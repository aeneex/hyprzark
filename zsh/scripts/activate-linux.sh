#!/bin/bash

if pgrep -x "activate-linux" > /dev/null
then
    pkill -x "activate-linux"
else
    activate-linux &
fi
