#!/bin/bash
# Arch/Hyprland environment installer with verification, conflict resolution, and retries

set -uo pipefail

# Remembers where this script lives.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/install-$(date +%Y%m%d-%H%M%S).log"
FAILED_PACKAGES=()

log() {
    echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"
}

# sudo handling
log "Requesting sudo access..."
sudo -v || { log "ERROR: sudo authentication failed. Aborting."; exit 1; }

# keep sudo alive in the background, cleaned up on exit
( while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done ) &
SUDO_KEEPALIVE_PID=$!
trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null' EXIT

# system update
log "Updating system (full sync + upgrade)..."
if ! sudo pacman -Syyu --noconfirm; then
    log "WARNING: System update failed or had partial errors. Continuing anyway."
fi

# installs a pacman package, verifies it, and resolves common conflicts on failure
pacman_install() {
    local pkg="$1"
    local attempt_log
    attempt_log="$(mktemp)"

    if pacman -Qi "$pkg" &> /dev/null; then
        log "  [skip] $pkg already installed"
        rm -f "$attempt_log"
        return 0
    fi

    log "  [install] $pkg"
    if sudo pacman -S --noconfirm --needed "$pkg" 2>&1 | tee "$attempt_log" | tee -a "$LOG_FILE" > /dev/null; then
        if pacman -Qi "$pkg" &> /dev/null; then
            log "  [ok] $pkg verified installed"
            rm -f "$attempt_log"
            return 0
        fi
    fi

    log "  [retry] $pkg failed first attempt, inspecting error..."

    # file conflict -> force overwrite
    if grep -qiE "conflicting files|exists in filesystem" "$attempt_log"; then
        log "  [fix] file conflict detected for $pkg, retrying with --overwrite '*'"
        if sudo pacman -S --noconfirm --needed --overwrite '*' "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
            if pacman -Qi "$pkg" &> /dev/null; then
                log "  [ok] $pkg installed after overwrite"
                rm -f "$attempt_log"
                return 0
            fi
        fi
    fi

    # conflicting package dependency -> remove offending package, retry
    if grep -qiE "are in conflict|conflicting dependencies" "$attempt_log"; then
        local conflict_pkg
        conflict_pkg="$(grep -oiE "[A-Za-z0-9_.+-]+ and [A-Za-z0-9_.+-]+ are in conflict" "$attempt_log" \
            | head -n1 | awk '{print $1}')"
        if [[ -n "$conflict_pkg" && "$conflict_pkg" != "$pkg" ]]; then
            log "  [fix] removing conflicting package '$conflict_pkg' to unblock $pkg"
            sudo pacman -Rdd --noconfirm "$conflict_pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null
            if sudo pacman -S --noconfirm --needed "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
                if pacman -Qi "$pkg" &> /dev/null; then
                    log "  [ok] $pkg installed after removing conflict"
                    rm -f "$attempt_log"
                    return 0
                fi
            fi
        fi
    fi

    # keyring / signature issues -> refresh keyring, retry
    if grep -qiE "signature|key could not be looked up|invalid or corrupted" "$attempt_log"; then
        log "  [fix] keyring/signature issue for $pkg, refreshing archlinux-keyring"
        sudo pacman -Sy --noconfirm archlinux-keyring 2>&1 | tee -a "$LOG_FILE" > /dev/null
        if sudo pacman -S --noconfirm --needed "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
            if pacman -Qi "$pkg" &> /dev/null; then
                log "  [ok] $pkg installed after keyring refresh"
                rm -f "$attempt_log"
                return 0
            fi
        fi
    fi

    # generic fallback: force db refresh and one more try
    log "  [fix] generic fallback for $pkg: pacman -Syy + retry"
    sudo pacman -Syy --noconfirm 2>&1 | tee -a "$LOG_FILE" > /dev/null
    if sudo pacman -S --noconfirm --needed --overwrite '*' "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
        if pacman -Qi "$pkg" &> /dev/null; then
            log "  [ok] $pkg installed after generic fallback"
            rm -f "$attempt_log"
            return 0
        fi
    fi

    log "  [FAIL] could not install $pkg after all fallback strategies"
    FAILED_PACKAGES+=("$pkg")
    rm -f "$attempt_log"
    return 1
}

# yay (AUR helper) install wrapper, same verification + fallback approach
yay_install() {
    local pkg="$1"
    local attempt_log
    attempt_log="$(mktemp)"

    if pacman -Qi "$pkg" &> /dev/null; then
        log "  [skip] $pkg already installed"
        rm -f "$attempt_log"
        return 0
    fi

    log "  [install:aur] $pkg"
    if yay -S --noconfirm --needed "$pkg" 2>&1 | tee "$attempt_log" | tee -a "$LOG_FILE" > /dev/null; then
        if pacman -Qi "$pkg" &> /dev/null; then
            log "  [ok] $pkg verified installed (AUR)"
            rm -f "$attempt_log"
            return 0
        fi
    fi

    log "  [retry:aur] $pkg failed, inspecting error..."

    if grep -qiE "conflicting files|exists in filesystem" "$attempt_log"; then
        log "  [fix] file conflict for $pkg, retrying with --overwrite '*'"
        if yay -S --noconfirm --needed --overwrite '*' "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
            if pacman -Qi "$pkg" &> /dev/null; then
                log "  [ok] $pkg installed after overwrite (AUR)"
                rm -f "$attempt_log"
                return 0
            fi
        fi
    fi

    if grep -qiE "are in conflict|conflicting dependencies" "$attempt_log"; then
        local conflict_pkg
        conflict_pkg="$(grep -oiE "[A-Za-z0-9_.+-]+ and [A-Za-z0-9_.+-]+ are in conflict" "$attempt_log" \
            | head -n1 | awk '{print $1}')"
        if [[ -n "$conflict_pkg" && "$conflict_pkg" != "$pkg" ]]; then
            log "  [fix] removing conflicting package '$conflict_pkg' to unblock $pkg"
            sudo pacman -Rdd --noconfirm "$conflict_pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null
            if yay -S --noconfirm --needed "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
                if pacman -Qi "$pkg" &> /dev/null; then
                    log "  [ok] $pkg installed after removing conflict (AUR)"
                    rm -f "$attempt_log"
                    return 0
                fi
            fi
        fi
    fi

    log "  [fix:aur] clearing yay cache for $pkg and retrying once more"
    yay -Sc --noconfirm 2>&1 | tee -a "$LOG_FILE" > /dev/null
    if yay -S --noconfirm --needed --overwrite '*' "$pkg" 2>&1 | tee -a "$LOG_FILE" > /dev/null; then
        if pacman -Qi "$pkg" &> /dev/null; then
            log "  [ok] $pkg installed after cache clear (AUR)"
            rm -f "$attempt_log"
            return 0
        fi
    fi

    log "  [FAIL] could not install $pkg (AUR) after all fallback strategies"
    FAILED_PACKAGES+=("$pkg")
    rm -f "$attempt_log"
    return 1
}

# install yay itself, if missing
if ! command -v yay &> /dev/null; then
    log "yay not found, installing..."
    sudo pacman -S --needed --noconfirm base-devel git

    BUILD_DIR="$(mktemp -d)"
    if git clone https://aur.archlinux.org/yay.git "$BUILD_DIR/yay" 2>&1 | tee -a "$LOG_FILE"; then
        (
            cd "$BUILD_DIR/yay" || exit 1
            makepkg -si --noconfirm
        )
    else
        log "ERROR: failed to clone yay repo. Check network/DNS."
    fi
    rm -rf "$BUILD_DIR"

    if command -v yay &> /dev/null; then
        log "yay installed successfully"
    else
        log "ERROR: yay installation failed. AUR packages will be skipped."
    fi
fi

# package lists
core_packages=(

    # desktop components
    hyprlock rofi swaync waybar

    # terminal helper tools
    btop cava exa fastfetch fzf neovim ranger unzip zip

    # backend utilities
    awww ddcutil libnotify noto-fonts-cjk pamixer playerctl wl-clipboard

    # small gui utilities
    imagemagick mpv nsxiv

    # recording related utilities
    libva-nvidia-driver # Remove if you don't have an nvidia GPU
    pipewire pipewire-alsa pipewire-jack pipewire-pulse rtkit wireplumber
    xdg-desktop-portal xdg-desktop-portal-gtk xdg-desktop-portal-hyprland
)

basic_packages=(
    gnome-calculator gnome-calendar lxappearance nwg-look pavucontrol pcmanfm
)

yay_packages=(
    activate-linux
    brave-bin # Remove if you don't use brave
    kernel-modules-hook
    tty-clock
    waybar-module-pacman-updates-git
)

# run installs
log "Installing core packages..."
for pkg in "${core_packages[@]}"; do
    pacman_install "$pkg"
done

log "Installing basic packages..."
for pkg in "${basic_packages[@]}"; do
    pacman_install "$pkg"
done

if command -v yay &> /dev/null; then
    log "Installing AUR (yay) packages..."
    for pkg in "${yay_packages[@]}"; do
        yay_install "$pkg"
    done
else
    log "Skipping AUR packages: yay not available."
    FAILED_PACKAGES+=("${yay_packages[@]}")
fi

# summary
if [ "${#FAILED_PACKAGES[@]}" -eq 0 ]; then
    log "All packages installed and verified successfully."
else
    log "The following packages FAILED to install after all fallbacks:"
    for p in "${FAILED_PACKAGES[@]}"; do
        log "   - $p"
    done
    log "Check $LOG_FILE for details."
fi

# run setup.sh from the script's own directory
SETUP_SCRIPT="${SCRIPT_DIR}/setup.sh"
if [ -f "$SETUP_SCRIPT" ]; then
    log "Running setup.sh from $SCRIPT_DIR..."
    chmod +x "$SETUP_SCRIPT"
    "$SETUP_SCRIPT"
else
    log "setup.sh not found at $SETUP_SCRIPT"
fi

log "Done. Full log saved to $LOG_FILE"
