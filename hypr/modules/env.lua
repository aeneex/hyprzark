-- Environment Variables
hl.env("XCURSOR_SIZE", "14")
hl.env("HYPRCURSOR_SIZE", "14")
hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_TYPE", "wayland")
hl.env("XDG_SESSION_DESKTOP", "Hyprland")

-- Force Brave to not use any libsecret or keyring bullshit
hl.env("BRAVE_FLAGS", "--password-store=basic")
