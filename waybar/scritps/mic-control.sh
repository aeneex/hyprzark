#!/bin/bash

# Check if any source is currently unmuted
# If even one mic is live, we want the "ON" status
status=$(pactl list sources | grep "Mute: no")

if [ -z "$status" ]; then
    # Everything is muted
    echo '{"text": "", "class": "muted", "tooltip": "All microphones muted"}'
else
    # At least one mic is live
    echo '{"text": "", "class": "unmuted", "tooltip": "Microphone(s) active"}'
fi

# Logic for toggling (run when clicked)
if [[ "$1" == "toggle" ]]; then
    if [ -z "$status" ]; then
        pactl list sources short | cut -f1 | xargs -I{} pactl set-source-mute {} false
    else
        pactl list sources short | cut -f1 | xargs -I{} pactl set-source-mute {} true
    fi
fi
