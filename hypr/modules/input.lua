-- Input Settings

-- Keyboard
hl.config({
  input = {
    kb_layout  = "us",
    kb_variant = "",
    kb_model   = "",
    kb_options = "",
    kb_rules   = "",

    follow_mouse = 1,
    sensitivity  = 0, -- -1.0 - 1.0, 0 means no modification.

    touchpad = {
        natural_scroll = true,
    },

  },
})

-- Trackpad
hl.gesture({
    fingers     = 3,
    direction   = "horizontal",
    action      = "workspace"
})

-- Mouse
hl.device({
    name        = "epic-mouse-v1",
    sensitivity = 0.5,
})

