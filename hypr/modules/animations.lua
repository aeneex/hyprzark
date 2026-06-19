hl.config ({
animations = {
        enabled = true,
    },
})

-- Bezier Curves
hl.curve("myBezier", { type = "bezier", points = { {0.05, 0.9}, {0.1, 1.0} } })
hl.curve("popOut",   { type = "bezier", points = { {0.05, 0.9}, {0.1, 1.0} } })

-- Animation Rules
hl.animation({ leaf = "windows",    enabled = true, speed = 7,  bezier = "myBezier" })
hl.animation({ leaf = "windowsIn",  enabled = true, speed = 7,  bezier = "popOut",   style = "popin 10%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 7,  bezier = "myBezier", style = "slide" })
hl.animation({ leaf = "border",     enabled = true, speed = 10, bezier = "default" })
hl.animation({ leaf = "borderangle",enabled = true, speed = 8,  bezier = "default" })
hl.animation({ leaf = "fade",       enabled = true, speed = 7,  bezier = "default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 7,  bezier = "myBezier", style = "slidevert" })
