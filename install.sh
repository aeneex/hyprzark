#!/bin/bash

# Ask for sudo password upfront
sudo -v

# Keep sudo alive
while true; do sudo -n true; sleep 60; kill -0 "$" || exit; done 2>/dev/null &

# Update system
echo "Updating system..."
sudo pacman -Syu --noconfirm

# Check if yay is installed
if ! command -v yay &> /dev/null; then
    echo "installing yay..."
    sudo pacman -S --needed --noconfirm base-devel git
    cd /tmp
    git clone https://aur.archlinux.org/yay.git
    cd yay
    makepkg -si --noconfirm
    cd ~
fi

# Core packages
echo "Installing core packages"
core_packages=(
    fzf
    exa
    unzip
    zip
    nsxiv
    imagemagick
    neovim
    ranger
    ueberzugpp
    fastfetch
    rofi
    waybar
    feh
    swaync
    cava
    mpv
    pamixer
    playerctl
    libnotify
    noto-fonts-cjk
    hyprlock
    ddcutil

# important for smooth OBS recording
    pipewire
    pipewire-pulse
    pipewire-alsa
    pipewire-jack
    wireplumber
    rtkit
    xdg-desktop-portal-hyprland
    libva-nvidia-driver
)

for pkg in "${core_packages[@]}"; do
    if ! pacman -Qi "$pkg" &> /dev/null; then
        echo "installing $pkg..."
        sudo pacman -S --noconfirm "$pkg"
    fi
done

# Basic packages
echo "Installing basic packages"
basic_packages=(
    gnome-calculator
    gnome-calendar
    nwg-look
    lxappearance
    btop
    pcmanfm
    pavucontrol
)

for pkg in "${basic_packages[@]}"; do
    if ! pacman -Qi "$pkg" &> /dev/null; then
        echo "installing $pkg..."
        sudo pacman -S --noconfirm "$pkg"
    fi
done

# Yay packages
echo "Installing yay packages"
yay_packages=(
    brave-bin
    tty-clock
    waybar-module-pacman-updates-git
    tela-circle-icon-theme-black
    kernel-modules-hook
)

for pkg in "${yay_packages[@]}"; do
    if ! pacman -Qi "$pkg" &> /dev/null; then
        echo "installing $pkg..."
        yes | yay -S --noconfirm "$pkg"
    fi
done

echo "done"

# Run setup.sh
if [ -f "./setup.sh" ]; then
    echo "Running setup.sh..."
    chmod +x ./setup.sh
    ./setup.sh
else
    echo "setup.sh not found in current directory"
fi
