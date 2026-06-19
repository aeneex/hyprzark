-- Autostart applications
hl.on("hyprland.start", function () 

-- Essential Startup programs (Desktop Components)
  hl.exec_cmd("waybar &")
  hl.exec_cmd("awww-daemon &")
  hl.exec_cmd("nm-applet")
  hl.exec_cmd("dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP")
  hl.exec_cmd("systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP")
  hl.exec_cmd("systemctl --user start pipewire wireplumber pipewire-pulse")
end)
