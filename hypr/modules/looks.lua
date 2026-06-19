hl.config({

-- general 
   general = {
     gaps_in             = 2,                             -- Gaps between windows
     gaps_out            = 5,                             -- Gaps between windows and monitor borders
     border_size         = 1,                             -- Thickness of window borders

     col = {
       active_border     = "rgba(C3C0BCee)",              -- Border color for focused window
       inactive_border   = "rgba(00000000)",              -- Border color for unfocused window
     },

     resize_on_border    = false,                         -- Enable resizing by clicking on the border
     allow_tearing       = false,                         -- Enable screen tearing for low latency
     layout              = "dwindle",                     -- Layout engine selection
   },

-- decoration
   decoration = {
     rounding            = 0,                             -- Corner radius of the windows
     rounding_power      = 2,                             -- Smoothness of the corner curve

     active_opacity      = 1.0,                           -- Opacity of focused window
     inactive_opacity    = 1.0,                           -- Opacity of unfocused window

   -- shadow
      shadow = {
        enabled          = false,                         -- Toggle window shadows
        range            = 4,                             -- Shadow spread distance
        render_power     = 3,                             -- Shadow falloff intensity
        color            = 0xee1a1a1a,                    -- Color of the shadow
      },

   -- blur
      blur = {
        enabled          = true,                          -- Toggle background blur
        size             = 10,                            -- Blur radius
        passes           = 3,                             -- Amount of blur passes
        vibrancy         = 0.1696,                        -- Color saturation boost
      },
   },

-- dwindle
   dwindle = {
     preserve_split      = true,
   }

})
