-- Fixes some dragging issues with XWayland
hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

-- Layer Rules
hl.layer_rule({
    name           = "blur-waybar",
    match          = { namespace = "waybar" },
    blur           = true,
    ignore_alpha   = 0.2,
})

hl.layer_rule({
    name           = "blur-swaync-notification",
    match          = { namespace = "swaync-notification-window" },
    blur           = true,
    ignore_alpha   = 0.0,
})

hl.layer_rule({
    name           = "blur-swaync-control",
    match          = { namespace = "swaync-control-center" },
    blur           = true,
    ignore_alpha   = 0.0,
})

hl.layer_rule({
    name           = "blur-rofi",
    match          = { namespace = "rofi" },
    blur           = true,
    ignore_alpha   = 0.0,
})

-- Window Rules
-- TerTime Rules
hl.window_rule({
    name           = "tertime-rules",
    match          = { class = "tertime" },
    float          = true,
    size           = "400 180",
    move           = "9 42",
})

-- GNOME Calendar Rules
hl.window_rule({
    name           = "gnome-calendar-rules",
    match          = { class = "org.gnome.Calendar" },
    float          = true,
    size           = "360 600",
    move           = "781 258",
})

-- Audio Relay Workspace Assignment
hl.window_rule({
    name           = "audiorelay-workspace",
    match          = { class = "com-azefsw-audioconnect-desktop-app-MainKt" },
    workspace      = 10,
})

-- Force tile certain apps
local suppressMaximizeRule = hl.window_rule({
    name           = "suppress-maximize-events",
    match          = { class = ".*" },
    suppress_event = "maximize",
})
