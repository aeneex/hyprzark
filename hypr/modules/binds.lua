-- Application Variables
local terminal             =    'kitty'
local fileManager          =    'nautilus'
local menu                 =    'rofi -show drun -theme "~/.config/rofi/appsearcher/config.rasi"'
local wallpaper            =    'bash ~/.config/rofi/wallsetter/wallsetter.sh'
local powermenu            =    'bash ~/.config/rofi/powermenu/powermenu.sh'
local screenshot           =    'grim -g "$(slurp)" - | wl-copy'
local activatelinux        =    'bash ~/.scripts/activate-linux.sh'
local browser              =    'brave --profile-directory="Default"'

-- Sets "Windows" key as main modifier
local mainMod = "SUPER"

-- Basic Applications
hl.bind(mainMod .. " + Return",              hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + SHIFT + B",           hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + SHIFT + F",           hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + D",                   hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + SHIFT + D",           hl.dsp.exec_cmd(powermenu))
hl.bind(mainMod .. " + SHIFT + W",           hl.dsp.exec_cmd(wallpaper))
hl.bind(mainMod .. " + SHIFT + S",           hl.dsp.exec_cmd(screenshot))
hl.bind(mainMod .. " + SHIFT + A",           hl.dsp.exec_cmd(activatelinux))
hl.bind(mainMod .. " + SHIFT + backslash",   hl.dsp.exec_cmd("hyprlock"))
hl.bind(mainMod .. " + Q",                   hl.dsp.window.close())
hl.bind(mainMod .. " + SHIFT + E",           hl.dsp.exec_cmd("hyprctl dispatch 'hl.dsp.exit()'"))
hl.bind(mainMod .. " + F",                   hl.dsp.window.fullscreen())
hl.bind(mainMod .. " + V",                   hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + SHIFT + R",           hl.dsp.exec_cmd("killall -9 waybar ; waybar &"))
hl.bind(mainMod .. " + P",                   hl.dsp.window.pseudo())

-- System Controls
hl.bind("F10", hl.dsp.exec_cmd("pctl set-sink-mute @DEFAULT_SINK@ toggle"))
hl.bind("F11", hl.dsp.exec_cmd("pctl set-sink-mute @DEFAULT_SINK@ 0 && pactl set-sink-volume @DEFAULT_SINK@ -5%"))
hl.bind("F12", hl.dsp.exec_cmd("pctl set-sink-mute @DEFAULT_SINK@ 0 && pactl set-sink-volume @DEFAULT_SINK@ +5%"))

-- Brightness controls (Repeating bind enabled)
hl.bind("F8", hl.dsp.exec_cmd("ddcutil setvcp 10 - 5 --sleep-multiplier .1"), { repeating = true })
hl.bind("F9", hl.dsp.exec_cmd("ddcutil setvcp 10 + 5 --sleep-multiplier .1"), { repeating = true })

-- Media Controls
hl.bind(mainMod .. " + SHIFT + period", hl.dsp.exec_cmd("playerctl next"))
hl.bind(mainMod .. " + SHIFT + comma",  hl.dsp.exec_cmd("playerctl previous"))
hl.bind(mainMod .. " + SHIFT + space",  hl.dsp.exec_cmd("playerctl play-pause"))

-- Vim-like Focus (h, j, k, l)
hl.bind(mainMod .. " + H", hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + L", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + K", hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + J", hl.dsp.focus({ direction = "down" }))

-- Vim-like Window Movement (Shift + h, j, k, l)
hl.bind(mainMod .. " + SHIFT + H", hl.dsp.window.move({ direction = "left" }))
hl.bind(mainMod .. " + SHIFT + L", hl.dsp.window.move({ direction = "right" }))
hl.bind(mainMod .. " + SHIFT + K", hl.dsp.window.move({ direction = "up" }))
hl.bind(mainMod .. " + SHIFT + J", hl.dsp.window.move({ direction = "down" }))

-- Arrow Key Focus/Movement
hl.bind(mainMod .. " + Left",  hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + Right", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + Up",    hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + Down",  hl.dsp.focus({ direction = "down" }))
hl.bind(mainMod .. " + B",     hl.dsp.layout("togglesplit"))

-- Workspaces (1-10) & Move to Workspace
for i = 1, 10 do
    local key = i % 10 -- Maps 10 to key 0
    hl.bind(mainMod .. " + " .. key,           hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key,   hl.dsp.window.move({ workspace = i }))
end

-- Mouse Bindings
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Scroll through existing workspaces with mainMod + scroll
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mainMod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))
