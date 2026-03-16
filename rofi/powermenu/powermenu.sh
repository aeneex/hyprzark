#!/bin/bash

## USER COMMANDS
shutdown="systemctl poweroff"
reboot="systemctl reboot"
lock="betterlockscreen -l"
suspend="systemctl suspend"
logout="hyprctl dispatch exit"

# System info
uptime=$(uptime -p | sed -e 's/up //g')

# Icons
shutdown_icon='⏻'
reboot_icon='󰜉'
lock_icon='󰌾'
suspend_icon='󰒲'
logout_icon='󰍃'
yes_icon='󰄬'
no_icon='󰅖'

# Rofi menu
show_menu() {
	rofi -dmenu -p "Uptime: $uptime" -mesg "Uptime: $uptime" -theme $HOME/.config/rofi/powermenu/base.rasi
}

# Confirmation
confirm() {
	rofi -theme-str 'window {location: center; anchor: center; fullscreen: false; width: 350px;}' \
		-theme-str 'mainbox {children: [ "message", "listview" ];}' \
		-theme-str 'listview {columns: 2; lines: 1;}' \
		-theme-str 'element-text {horizontal-align: 0.5;}' \
		-theme-str 'textbox {horizontal-align: 0.5;}' \
		-dmenu -p 'Confirmation' -mesg 'Are you Sure?' -theme $HOME/.config/rofi/powermenu/base.rasi
}

# Execute action
execute() {
	[[ "$1" == "$lock_icon" ]] && { eval "$lock"; exit 0; }
	selected=$(echo -e "$yes_icon\n$no_icon" | confirm)
	[[ "$selected" == "$yes_icon" ]] && eval "$2"
}

# Main
chosen=$(echo -e "$lock_icon\n$suspend_icon\n$logout_icon\n$reboot_icon\n$shutdown_icon" | show_menu)

case "$chosen" in
	"$shutdown_icon") execute "$chosen" "$shutdown" ;;
	"$reboot_icon") execute "$chosen" "$reboot" ;;
	"$lock_icon") execute "$chosen" "$lock" ;;
	"$suspend_icon") execute "$chosen" "$suspend" ;;
	"$logout_icon") execute "$chosen" "$logout" ;;
esac
