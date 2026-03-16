#!/usr/bin/env bash

WALLDIR="$HOME/Wallpapers"

# Create a list with extensions removed for display
display_list=$(ls "$WALLDIR" | sed 's/\.[^.]*$//')

# Show in rofi without extensions
selection=$(echo "$display_list" | rofi -dmenu -i -theme "$HOME/.config/rofi/wallsetter/wallsetter.rasi")

[[ -z "$selection" ]] && exit

# Find the actual file with extension
actual_file=$(ls "$WALLDIR" | grep "^${selection}\.")

swww img "$WALLDIR/$actual_file" -t wipe --transition-fps 180
