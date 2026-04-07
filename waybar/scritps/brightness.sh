#!/bin/bash

# REPLACE '5' with your actual bus number from 'ddcutil detect'
BUS=5

# Handle Scroll/Click Actions
if [ "$1" == "up" ]; then
    ddcutil -b $BUS setvcp 10 + 2 --sleep-multiplier .1
elif [ "$1" == "down" ]; then
    ddcutil -b $BUS setvcp 10 - 2 --sleep-multiplier .1
fi

# Fetch current brightness (Parsing the "current value=" string)
ddcutil -b $BUS getvcp 10 --brief | awk '{print $4}' | tr -d ','
