#!/bin/bash

# Ask for sudo password upfront
sudo -v

# Keep sudo alive
while true; do sudo -n true; sleep 60; kill -0 "$" || exit; done 2>/dev/null &

# Makes every .sh file executable in the repo.
BASE_DIR=$(cd "$(dirname "$0")" && pwd)
find "$BASE_DIR" -type f -name "*.sh" -exec chmod +x {} +

# Makes every .desktop file searchable in the repo.
BASE_DIR=$(cd "$(dirname "$0")" && pwd)
find "$BASE_DIR" -type f -name "*.desktop" -exec chmod 644 {} +

# Config folders to copy
config_folders=(
    btop
    cava
    fastfetch
    hypr
    kitty
    ranger
    rofi
    swaync
    waybar
)

# Copy config folders to ~/.config
echo "Setting up config files..."
for folder in "${config_folders[@]}"; do
    if [ -d "./$folder" ]; then
        if [ -d "$HOME/.config/$folder" ]; then
            echo "removing existing $folder..."
            rm -rf "$HOME/.config/$folder"
        fi
        echo "copying $folder..."
        cp -r "./$folder" "$HOME/.config/"
    fi
done

echo "config setup done"

# Applies the .desktop files to make navigation easier
sudo cp ./desktop-entries/*.desktop /usr/share/applications/
sudo update-desktop-database /usr/share/applications/
echo "Applied custom app entries."

# Moving Wallpapers to system
echo "Setting up wallpapers..."
   if [ -d "$HOME/Wallpapers" ]; then
    echo "removing existing Wallpapers..."
    rm -rf "$HOME/Wallpapers"
fi
   if [ -d "./Wallpapers" ]; then
    echo "copying Wallpapers..."
    cp -r "./Wallpapers" "$HOME/"
fi

echo "Wallpapers moved to your system."

# Copy fonts
echo "Setting up fonts..."
if [ -d "./Fonts" ]; then
    for font_folder in ./Fonts/*/; do
        font_name=$(basename "$font_folder")
        echo "copying $font_name font..."
        sudo cp -r "$font_folder" /usr/share/fonts/
    done
    sudo fc-cache -fv
fi

echo "Needed Fonts installed."

# Copy zsh files with dot prefix
echo "Setting up zsh..."
if [ -d "./zsh" ]; then
    for item in ./zsh/*; do
        item_name=$(basename "$item")
        if [ -e "$HOME/.$item_name" ]; then
            echo "removing existing .$item_name..."
            rm -rf "$HOME/.$item_name"
        fi
        echo "copying .$item_name..."
        cp -r "$item" "$HOME/.$item_name"
    done
fi

echo "zsh configured successfully."

# Set the Zark wallpaper
feh --bg-fill $HOME/Wallpapers/zark.png

echo "setup complete"

# Change shell to zsh
echo "Changing shell to zsh..."
chsh -s $(which zsh)

echo "all done. Please reboot the system or fuck yourself."
