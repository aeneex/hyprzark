#!/bin/bash
# Dotfiles/config setup script with verification and safe fallbacks

set -uo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${BASE_DIR}/setup-$(date +%Y%m%d-%H%M%S).log"
FAILED_STEPS=()

log() {
    echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"
}

# sudo handling
log "Requesting sudo access..."
sudo -v || { log "ERROR: sudo authentication failed. Aborting."; exit 1; }

( while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done ) &
SUDO_KEEPALIVE_PID=$!
trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null' EXIT

# make every .sh file executable in the repo
log "Making .sh files executable..."
find "$BASE_DIR" -type f -name "*.sh" -exec chmod +x {} +

# make every .desktop file readable in the repo
log "Setting permissions on .desktop files..."
find "$BASE_DIR" -type f -name "*.desktop" -exec chmod 644 {} +

# config folders to copy
config_folders=(
    btop
    cava
    fastfetch
    gowall
    hypr
    kitty
    ranger
    rofi
    swaync
    waybar
    xdg-desktop-portal
)

# copy config folders to ~/.config, verifying each one
log "Setting up config files..."
mkdir -p "$HOME/.config"
for folder in "${config_folders[@]}"; do
    src="${BASE_DIR}/${folder}"
    dest="$HOME/.config/${folder}"

    if [ ! -d "$src" ]; then
        log "  [skip] $folder not found in repo, skipping"
        continue
    fi

    if [ -d "$dest" ]; then
        log "  [remove] existing $dest"
        rm -rf "$dest"
    fi

    log "  [copy] $folder"
    if cp -r "$src" "$HOME/.config/" && [ -d "$dest" ]; then
        log "  [ok] $folder copied and verified"
    else
        log "  [FAIL] $folder failed to copy"
        FAILED_STEPS+=("config:$folder")
    fi
done

# apply .desktop entries
log "Setting up desktop entries..."
DESKTOP_SRC="${BASE_DIR}/desktop-entries"
if [ -d "$DESKTOP_SRC" ]; then
    if sudo cp "$DESKTOP_SRC"/*.desktop /usr/share/applications/ 2>>"$LOG_FILE"; then
        sudo update-desktop-database /usr/share/applications/ 2>>"$LOG_FILE"
        log "  [ok] desktop entries applied"
    else
        log "  [FAIL] could not copy desktop entries"
        FAILED_STEPS+=("desktop-entries")
    fi
else
    log "  [skip] no desktop-entries folder found"
fi

# wallpapers
log "Setting up wallpapers..."
WALLPAPER_SRC="${BASE_DIR}/Wallpapers"
WALLPAPER_DEST="$HOME/Wallpapers"
if [ -d "$WALLPAPER_SRC" ]; then
    if [ -d "$WALLPAPER_DEST" ]; then
        log "  [remove] existing $WALLPAPER_DEST"
        rm -rf "$WALLPAPER_DEST"
    fi
    if cp -r "$WALLPAPER_SRC" "$HOME/" && [ -d "$WALLPAPER_DEST" ]; then
        log "  [ok] wallpapers copied"
    else
        log "  [FAIL] wallpapers failed to copy"
        FAILED_STEPS+=("wallpapers")
    fi
else
    log "  [skip] no Wallpapers folder found in repo"
fi

# fonts
log "Setting up fonts..."
FONT_SRC="${BASE_DIR}/Fonts"
if [ -d "$FONT_SRC" ]; then
    font_failures=0
    for font_folder in "$FONT_SRC"/*/; do
        [ -d "$font_folder" ] || continue
        font_name="$(basename "$font_folder")"
        log "  [copy] $font_name font"
        if ! sudo cp -r "$font_folder" /usr/share/fonts/ 2>>"$LOG_FILE"; then
            log "  [FAIL] $font_name failed to copy"
            font_failures=$((font_failures + 1))
        fi
    done
    if command -v fc-cache &> /dev/null; then
        sudo fc-cache -f 2>>"$LOG_FILE"
        log "  [ok] font cache rebuilt"
    else
        log "  [WARNING] fc-cache not found, skipping cache rebuild"
    fi
    if [ "$font_failures" -gt 0 ]; then
        FAILED_STEPS+=("fonts ($font_failures failed)")
    fi
else
    log "  [skip] no Fonts folder found in repo"
fi

# zsh dotfiles
log "Setting up zsh..."
ZSH_SRC="${BASE_DIR}/zsh"
if [ -d "$ZSH_SRC" ]; then
    for item in "$ZSH_SRC"/*; do
        [ -e "$item" ] || continue
        item_name="$(basename "$item")"
        dest="$HOME/.${item_name}"

        if [ -e "$dest" ]; then
            log "  [remove] existing $dest"
            rm -rf "$dest"
        fi

        log "  [copy] .${item_name}"
        if cp -r "$item" "$dest" && [ -e "$dest" ]; then
            log "  [ok] .${item_name} copied"
        else
            log "  [FAIL] .${item_name} failed to copy"
            FAILED_STEPS+=("zsh:$item_name")
        fi
    done
else
    log "  [skip] no zsh folder found in repo"
fi

# change shell to zsh
log "Changing shell to zsh..."
if command -v zsh &> /dev/null; then
    ZSH_PATH="$(which zsh)"
    if chsh -s "$ZSH_PATH" 2>>"$LOG_FILE"; then
        log "  [ok] default shell changed to $ZSH_PATH"
    else
        log "  [FAIL] could not change shell to zsh"
        FAILED_STEPS+=("chsh")
    fi
else
    log "  [skip] zsh not installed, skipping shell change"
    FAILED_STEPS+=("zsh-not-installed")
fi

# summary
if [ "${#FAILED_STEPS[@]}" -eq 0 ]; then
    log "Setup complete. Everything verified successfully."
else
    log "Setup finished with issues in the following steps:"
    for s in "${FAILED_STEPS[@]}"; do
        log "   - $s"
    done
    log "Check $LOG_FILE for details."
fi

log "Done. Please reboot or log out/in for all changes to take effect."
