/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

export let fakeD = false;

function deafen() {
    (document.querySelector('[aria-label="Deafen"], [aria-label="Undeafen"]') as HTMLElement)?.click();
}

export function toggleFakeDeafen() {
    fakeD = !fakeD;
    deafen();
    setTimeout(deafen, 250);
}

// ─── Keyboard shortcut ────────────────────────────────────────────────────────

function parseShortcut(shortcut: string) {
    if (!shortcut?.trim()) return null;
    const parts = shortcut.toLowerCase().split("+").map(s => s.trim());
    return {
        ctrl:  parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt:   parts.includes("alt"),
        meta:  parts.includes("meta") || parts.includes("cmd"),
        key:   parts.find(p => !["ctrl", "shift", "alt", "meta", "cmd"].includes(p)) ?? ""
    };
}

function handleKeydown(e: KeyboardEvent) {
    const parsed = parseShortcut(settings.store.shortcut ?? "");
    if (!parsed?.key) return;
    if (
        e.key.toLowerCase() === parsed.key &&
        e.ctrlKey  === parsed.ctrl  &&
        e.shiftKey === parsed.shift &&
        e.altKey   === parsed.alt   &&
        e.metaKey  === parsed.meta
    ) {
        e.preventDefault();
        toggleFakeDeafen();
    }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    mute: {
        type: OptionType.BOOLEAN,
        description: "Keep mute state when fake deafened",
        default: true
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "Send deafen state to server (recommended: ON)",
        default: true
    },
    shortcut: {
        type: OptionType.STRING,
        description: "Keyboard shortcut to toggle (e.g. ctrl+shift+f or alt+d). Leave blank to disable.",
        default: "ctrl+shift+f"
    }
});

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "FakeDeafen",
    description: "Appear deafened to others while still being able to hear. Use /fd or your configured shortcut to toggle.",
    authors: [Devs.Nobody],

    settings,

    patches: [
        {
            find: "}voiceStateUpdate(",
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+),self_video:([^,]+)/,
                replace: "self_mute:$self.toggle($1,'mute'),self_deaf:$self.toggle($2,'deaf'),self_video:$self.toggle($3,'video')"
            }
        }
    ],

    commands: [
        {
            name: "fd",
            description: "Toggle fake deafen",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: (_, ctx) => {
                toggleFakeDeafen();
                sendBotMessage(ctx.channel.id, {
                    content: fakeD ? "🔴 Fake deafen: **ON**" : "⚪ Fake deafen: **OFF**"
                });
            }
        }
    ],

    start() {
        document.addEventListener("keydown", handleKeydown, true);
    },

    stop() {
        document.removeEventListener("keydown", handleKeydown, true);
        fakeD = false;
    },

    toggle(au: any, what: string) {
        if (!fakeD) return au;
        switch (what) {
            case "mute":  return settings.store.mute;
            case "deaf":  return settings.store.deafen;
            case "video": return au;
        }
    }
});
