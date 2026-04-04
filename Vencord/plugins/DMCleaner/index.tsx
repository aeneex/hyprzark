/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { createRoot, React, ReactDOM, useEffect, useState } from "@webpack/common";

/* ─────────────────────────────────────────────
   SETTINGS
───────────────────────────────────────────── */

const settings = definePluginSettings({
    minDelay: {
        type: OptionType.NUMBER,
        description: "Minimum delay between deletions (ms)",
        default: 850,
    },
    maxDelay: {
        type: OptionType.NUMBER,
        description: "Maximum delay between deletions (ms)",
        default: 1250,
    },
    toggleKeybind: {
        type: OptionType.STRING,
        description: "Key combo to toggle the panel (e.g. Control+Shift+D)",
        default: "Control+Shift+D",
    },
    circleX: {
        type: OptionType.NUMBER,
        description: "Minimized circle X position (pixels from left edge). -1 = auto (near right edge)",
        default: -1,
    },
    circleY: {
        type: OptionType.NUMBER,
        description: "Minimized circle Y position (pixels from top edge). -1 = auto (near bottom)",
        default: -1,
    },
});

/* ─────────────────────────────────────────────
   DISCORD INTERNALS
───────────────────────────────────────────── */

const TokenModule  = findByPropsLazy("getToken");
const ChannelStore = findByPropsLazy("getSortedPrivateChannels");
const UserStore    = findByPropsLazy("getUser", "getCurrentUser");

function getToken(): string { return TokenModule?.getToken?.() ?? ""; }
function getMyId():  string { return UserStore?.getCurrentUser?.()?.id ?? ""; }
function getUser(id: string): { username: string; globalName?: string | null; } | null {
    return UserStore?.getUser?.(id) ?? null;
}

interface DMChannel {
    id: string;
    type: number;
    recipients?: string[];
    name?: string | null;
}

function getDMChannels(): DMChannel[] {
    return (ChannelStore?.getSortedPrivateChannels?.() ?? []) as DMChannel[];
}

function dmLabel(ch: DMChannel): string {
    if (ch.type === 3) return ch.name || "Group DM";
    const rid = ch.recipients?.[0];
    if (!rid) return ch.id;
    const u = getUser(rid);
    if (!u) return rid;
    return u.globalName || u.username || rid;
}

/* ─────────────────────────────────────────────
   MESSAGE FILTERS
───────────────────────────────────────────── */

export interface MessageFilters {
    // content
    containing: string;         // message contains this text
    // type toggles — if all false, all types included
    typeText:        boolean;
    typeImages:      boolean;
    typeVideos:      boolean;
    typeFiles:       boolean;
    typeLinks:       boolean;
    typeEmbeds:      boolean;
    typePins:        boolean;
    typeStickers:    boolean;
    // date range
    afterDate:  string;          // ISO date string YYYY-MM-DD
    beforeDate: string;
    // mentions
    mentionsMe: boolean;
}

const defaultFilters = (): MessageFilters => ({
    containing:   "",
    typeText:     false,
    typeImages:   false,
    typeVideos:   false,
    typeFiles:    false,
    typeLinks:    false,
    typeEmbeds:   false,
    typePins:     false,
    typeStickers: false,
    afterDate:    "",
    beforeDate:   "",
    mentionsMe:   false,
});

/** Returns true if the message passes all active filters */
function messagePassesFilters(msg: any, filters: MessageFilters, myId: string): boolean {
    // --- containing ---
    if (filters.containing.trim()) {
        const needle = filters.containing.trim().toLowerCase();
        const content = (msg.content ?? "").toLowerCase();
        if (!content.includes(needle)) return false;
    }

    // --- date range ---
    if (filters.afterDate) {
        const after = new Date(filters.afterDate).getTime();
        const msgTs = new Date(msg.timestamp).getTime();
        if (msgTs <= after) return false;
    }
    if (filters.beforeDate) {
        const before = new Date(filters.beforeDate).getTime();
        const msgTs  = new Date(msg.timestamp).getTime();
        if (msgTs >= before) return false;
    }

    // --- mentions me ---
    if (filters.mentionsMe) {
        const mentioned = (msg.mentions ?? []).some((u: any) => u.id === myId)
            || (msg.content ?? "").includes(`<@${myId}>`)
            || (msg.content ?? "").includes(`<@!${myId}>`);
        if (!mentioned) return false;
    }

    // --- type filters (only active if at least one is ticked) ---
    const anyTypeActive = filters.typeText || filters.typeImages || filters.typeVideos
        || filters.typeFiles || filters.typeLinks || filters.typeEmbeds
        || filters.typePins  || filters.typeStickers;

    if (anyTypeActive) {
        const attachments: any[] = msg.attachments ?? [];
        const embeds:      any[] = msg.embeds      ?? [];
        const content:   string  = msg.content     ?? "";
        const stickers:  any[]   = msg.sticker_items ?? [];

        const isImage   = attachments.some(a => a.content_type?.startsWith("image/"));
        const isVideo   = attachments.some(a => a.content_type?.startsWith("video/"));
        const isFile    = attachments.some(a => !a.content_type?.startsWith("image/") && !a.content_type?.startsWith("video/"));
        const hasLink   = /https?:\/\/\S+/.test(content);
        const hasEmbed  = embeds.length > 0;
        const isPin     = msg.type === 6;
        const isSticker = stickers.length > 0;
        // "text" = has content and no attachments/stickers
        const isText    = content.trim().length > 0 && attachments.length === 0 && stickers.length === 0;

        let matched = false;
        if (filters.typeText     && isText)    matched = true;
        if (filters.typeImages   && isImage)   matched = true;
        if (filters.typeVideos   && isVideo)   matched = true;
        if (filters.typeFiles    && isFile)    matched = true;
        if (filters.typeLinks    && hasLink)   matched = true;
        if (filters.typeEmbeds   && hasEmbed)  matched = true;
        if (filters.typePins     && isPin)     matched = true;
        if (filters.typeStickers && isSticker) matched = true;
        if (!matched) return false;
    }

    return true;
}

/* ─────────────────────────────────────────────
   MODULE-LEVEL STATE
───────────────────────────────────────────── */

type Phase = "idle" | "running" | "done" | "stopped";

let _phase: Phase = "idle";
let _currentDM    = "";
let _deletedCount = 0;
let _skippedCount = 0;
let _abortFlag    = false;

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() { listeners.forEach(fn => fn()); }

function useCleanerState() {
    const [, tick] = useState(0);
    useEffect(() => {
        const cb = () => tick(n => n + 1);
        listeners.add(cb);
        return () => { listeners.delete(cb); };
    }, []);
    return { phase: _phase, currentDM: _currentDM, deletedCount: _deletedCount, skippedCount: _skippedCount };
}

/* ─────────────────────────────────────────────
   CORE CLEANUP LOGIC
───────────────────────────────────────────── */

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

async function fetchMessageBatch(channelId: string, token: string, lastId: string | null) {
    while (!_abortFlag) {
        let url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=100`;
        if (lastId) url += `&before=${lastId}`;
        const res = await fetch(url, { headers: { Authorization: token } });
        if (res.status === 429) {
            const d = await res.json();
            await delay((d.retry_after ?? 5) * 1000);
            continue;
        }
        return await res.json();
    }
    return [];
}

async function deleteSingleMessage(channelId: string, msgId: string, token: string) {
    while (!_abortFlag) {
        const del = await fetch(
            `https://discord.com/api/v9/channels/${channelId}/messages/${msgId}`,
            { method: "DELETE", headers: { Authorization: token } }
        );
        if (del.status === 204)      { _deletedCount++; notify(); return; }
        else if (del.status === 429) { const d = await del.json(); await delay((d.retry_after ?? 5) * 1000); }
        else return;
    }
}

async function processMessage(
    msg: any,
    channelId: string,
    myId: string,
    token: string,
    filters: MessageFilters
) {
    // Only delete messages I sent (type 0 = normal, 6 = pin notice, 19 = reply)
    const deletableTypes = new Set([0, 6, 19]);
    if (!deletableTypes.has(msg.type)) return;
    if (msg.author.id !== myId) return;

    // Apply filters
    if (!messagePassesFilters(msg, filters, myId)) {
        _skippedCount++;
        notify();
        return;
    }

    await deleteSingleMessage(channelId, msg.id, token);

    if (!_abortFlag) {
        const { minDelay, maxDelay } = settings.store;
        await delay(Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay));
    }
}

async function deleteMessagesInChannel(
    channelId: string,
    myId: string,
    token: string,
    filters: MessageFilters
) {
    let lastId: string | null = null;

    // If beforeDate filter set, we need to find the right starting snowflake
    // Discord snowflake encodes timestamp: (timestamp_ms - discord_epoch) << 22
    // We'll just paginate and rely on the filter check for date boundaries.

    while (!_abortFlag) {
        const messages = await fetchMessageBatch(channelId, token, lastId);
        if (!Array.isArray(messages) || messages.length === 0) break;

        for (const msg of messages) {
            if (_abortFlag) return;
            lastId = msg.id;

            // Optimisation: if afterDate is set and message is older, stop paginating this channel
            if (filters.afterDate) {
                const after  = new Date(filters.afterDate).getTime();
                const msgTs  = new Date(msg.timestamp).getTime();
                if (msgTs <= after) return;
            }

            await processMessage(msg, channelId, myId, token, filters);
        }
    }
}

async function startCleaning(selectedIds: string[], filters: MessageFilters, customChannels: { id: string; label: string; }[] = []) {
    const token = getToken();
    const myId  = getMyId();
    if (!token || !myId) return;

    _phase = "running"; _deletedCount = 0; _skippedCount = 0; _abortFlag = false; notify();

    const channels = getDMChannels();
    for (const id of selectedIds) {
        if (_abortFlag) break;
        const dmCh     = channels.find(c => c.id === id);
        const customCh = customChannels.find(c => c.id === id);
        _currentDM = dmCh ? dmLabel(dmCh) : (customCh ? `#${customCh.id} (server)` : id);
        notify();
        await deleteMessagesInChannel(id, myId, token, filters);
    }

    _phase = _abortFlag ? "stopped" : "done";
    _currentDM = "";
    notify();
}

function stopCleaning() { _abortFlag = true; _phase = "stopped"; notify(); }

/* ─────────────────────────────────────────────
   KEYBIND
───────────────────────────────────────────── */

function keybindMatches(e: KeyboardEvent, raw: string): boolean {
    try {
        const parts = raw.split("+").map(p => p.trim());
        const mods  = new Set(parts.slice(0, -1).map(p => p.toLowerCase()));
        const key   = (parts[parts.length - 1] ?? "").toLowerCase();
        if (e.key.toLowerCase() !== key)        return false;
        if (mods.has("control") !== e.ctrlKey)  return false;
        if (mods.has("shift")   !== e.shiftKey) return false;
        if (mods.has("alt")     !== e.altKey)   return false;
        if (mods.has("meta")    !== e.metaKey)  return false;
        return true;
    } catch { return false; }
}

/* ─────────────────────────────────────────────
   THEME
───────────────────────────────────────────── */

const T = {
    bg4:    "#000000",
    bg3:    "#0a0a0a",
    bg2:    "#121212",
    bg1:    "#1a1a1a",
    hover:  "rgba(255,255,255,0.06)",
    active: "rgba(255,255,255,0.10)",
    border: "rgba(255,255,255,0.12)",
    borderF:"rgba(255,255,255,0.22)",
    text1:  "#f5f5f5",
    text2:  "#e0e0e0",
    text3:  "#b8b8b8",
    text4:  "#888888",
    text5:  "#5a5a5a",
    accent: "#a0a0a0",
    font:   "'Figtree', 'Inter', sans-serif",
};

/* ─────────────────────────────────────────────
   STYLE HELPERS
───────────────────────────────────────────── */

const baseBtn = (bg: string): React.CSSProperties => ({
    all: "unset" as any,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "10px 0", borderRadius: 10,
    background: bg, color: T.text1, fontSize: 13, fontWeight: 700,
    cursor: "pointer", boxSizing: "border-box" as any,
    border: `1px solid ${T.border}`, transition: "background 0.15s",
    fontFamily: T.font,
});

const smallBtn: React.CSSProperties = {
    all: "unset" as any,
    cursor: "pointer", padding: "4px 10px", borderRadius: 7,
    background: T.bg1, border: `1px solid ${T.border}`,
    color: T.text3, fontSize: 11, fontWeight: 600,
    fontFamily: T.font, transition: "background 0.15s",
};

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px",
    background: T.bg3, border: `1px solid ${T.border}`,
    borderRadius: 8, color: T.text1, fontSize: 12,
    outline: "none", boxSizing: "border-box" as any,
    fontFamily: T.font, transition: "border-color 0.15s",
};

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode; }) {
    return (
        <div style={{ color: T.text5, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: T.font }}>
            {children}
        </div>
    );
}

function TypeChip({
    label, active, onClick,
}: { label: string; active: boolean; onClick: () => void; }) {
    return (
        <button
            className="no-drag"
            onClick={onClick}
            style={{
                all: "unset" as any,
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: T.font,
                border: `1px solid ${active ? T.borderF : T.border}`,
                background: active ? T.active : "transparent",
                color: active ? T.text1 : T.text4,
                transition: "all 0.12s",
                userSelect: "none" as any,
            }}
        >
            {label}
        </button>
    );
}

/* ─────────────────────────────────────────────
   FILTER PANEL  (collapsible section)
───────────────────────────────────────────── */

function FilterPanel({
    filters,
    onChange,
}: {
    filters: MessageFilters;
    onChange: (f: MessageFilters) => void;
}) {
    const [open, setOpen] = useState(false);

    function set<K extends keyof MessageFilters>(key: K, val: MessageFilters[K]) {
        onChange({ ...filters, [key]: val });
    }

    const typeOptions: { key: keyof MessageFilters; label: string; }[] = [
        { key: "typeText",     label: "Text"     },
        { key: "typeImages",   label: "Images"   },
        { key: "typeVideos",   label: "Videos"   },
        { key: "typeFiles",    label: "Files"    },
        { key: "typeLinks",    label: "Links"    },
        { key: "typeEmbeds",   label: "Embeds"   },
        { key: "typePins",     label: "Pins"     },
        { key: "typeStickers", label: "Stickers" },
    ];

    const anyActive =
        filters.containing || filters.afterDate || filters.beforeDate || filters.mentionsMe ||
        filters.typeText || filters.typeImages || filters.typeVideos || filters.typeFiles ||
        filters.typeLinks || filters.typeEmbeds || filters.typePins || filters.typeStickers;

    return (
        <div className="no-drag" style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            {/* Header row */}
            <button
                className="no-drag"
                onClick={() => setOpen(o => !o)}
                style={{
                    all: "unset" as any,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "9px 12px", cursor: "pointer",
                    boxSizing: "border-box" as any,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: T.text3, fontSize: 12, fontWeight: 600, fontFamily: T.font }}>Filters</span>
                    {anyActive && (
                        <span style={{
                            background: T.active, border: `1px solid ${T.border}`,
                            borderRadius: 10, padding: "1px 7px",
                            color: T.text2, fontSize: 10, fontWeight: 700, fontFamily: T.font,
                        }}>
                            active
                        </span>
                    )}
                </div>
                <span style={{ color: T.text5, fontSize: 14, lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>
                    ›
                </span>
            </button>

            {/* Body */}
            {open && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${T.border}` }}>

                    {/* Containing */}
                    <div style={{ marginTop: 10 }}>
                        <SectionLabel>Contains text</SectionLabel>
                        <input
                            className="no-drag"
                            type="text"
                            placeholder='e.g. "hello world"'
                            value={filters.containing}
                            onChange={e => set("containing", (e.target as HTMLInputElement).value)}
                            style={inputStyle}
                            onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                        />
                    </div>

                    {/* Message type chips */}
                    <div>
                        <SectionLabel>Message type</SectionLabel>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {typeOptions.map(opt => (
                                <TypeChip
                                    key={opt.key}
                                    label={opt.label}
                                    active={filters[opt.key] as boolean}
                                    onClick={() => set(opt.key, !filters[opt.key] as any)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Date range */}
                    <div>
                        <SectionLabel>Date range</SectionLabel>
                        <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: T.text5, fontSize: 10, marginBottom: 4, fontFamily: T.font }}>After</div>
                                <input
                                    className="no-drag"
                                    type="date"
                                    value={filters.afterDate}
                                    onChange={e => set("afterDate", (e.target as HTMLInputElement).value)}
                                    style={{ ...inputStyle, colorScheme: "dark" }}
                                    onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                                    onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: T.text5, fontSize: 10, marginBottom: 4, fontFamily: T.font }}>Before</div>
                                <input
                                    className="no-drag"
                                    type="date"
                                    value={filters.beforeDate}
                                    onChange={e => set("beforeDate", (e.target as HTMLInputElement).value)}
                                    style={{ ...inputStyle, colorScheme: "dark" }}
                                    onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                                    onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Mentions */}
                    <div>
                        <SectionLabel>Mentions</SectionLabel>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input
                                className="no-drag"
                                type="checkbox"
                                checked={filters.mentionsMe}
                                onChange={() => set("mentionsMe", !filters.mentionsMe)}
                                style={{ accentColor: T.accent, width: 14, height: 14, cursor: "pointer" }}
                            />
                            <span style={{ color: T.text3, fontSize: 12, fontFamily: T.font }}>Only messages that mention me</span>
                        </label>
                    </div>

                    {/* Reset */}
                    {anyActive && (
                        <button
                            className="no-drag"
                            onClick={() => onChange(defaultFilters())}
                            style={{
                                ...smallBtn,
                                width: "100%",
                                textAlign: "center" as any,
                                padding: "6px 0",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                        >
                            Reset all filters
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────
   FLOATING PANEL
───────────────────────────────────────────── */

function FloatingPanel() {
    const { phase, currentDM, deletedCount, skippedCount } = useCleanerState();
    const [selected,        setSelected]        = useState<Set<string>>(new Set());
    const [dms,             setDms]             = useState<DMChannel[]>([]);
    const [search,          setSearch]          = useState("");
    const [minimized,       setMinimized]       = useState(true);
    const [filters,         setFilters]         = useState<MessageFilters>(defaultFilters());
    const [customChannelInput, setCustomChannelInput] = useState("");
    const [customChannels,     setCustomChannels]     = useState<{ id: string; label: string; }[]>([]);

    const [circlePos, setCirclePos] = useState(() => ({
        x: (settings.store.circleX >= 0) ? settings.store.circleX : window.innerWidth - 88,
        y: (settings.store.circleY >= 0) ? settings.store.circleY : window.innerHeight - 220,
    }));
    const [panelPos,  setPanelPos]  = useState({ x: window.innerWidth - 400, y: window.innerHeight - 700 });

    function makeDrag(
        pos: { x: number; y: number },
        set: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
    ) {
        return (e: React.PointerEvent) => {
            if ((e.target as HTMLElement).closest(".no-drag")) return;
            e.preventDefault();
            const ox = e.clientX - pos.x;
            const oy = e.clientY - pos.y;
            const mv = (m: PointerEvent) => set({ x: m.clientX - ox, y: m.clientY - oy });
            const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
            window.addEventListener("pointermove", mv);
            window.addEventListener("pointerup",   up);
        };
    }

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const raw = settings.store.toggleKeybind;
            if (raw && keybindMatches(e, raw)) { e.preventDefault(); setMinimized(m => !m); }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    useEffect(() => {
        if (phase !== "running") setDms(getDMChannels());
    }, [phase]);

    function toggle(id: string) {
        setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    function addCustomChannel() {
        const raw = customChannelInput.trim();
        if (!raw) return;
        // Accept plain IDs or channel URLs like https://discord.com/channels/GUILD/CHANNEL
        const match = raw.match(/(\d{17,20})(?:\/\d+)?$/) ?? raw.match(/^(\d{17,20})$/);
        const id = match ? match[1] : null;
        if (!id) return;
        if (customChannels.some(c => c.id === id) || dms.some(c => c.id === id)) {
            // Already present — just select it
            setSelected(prev => { const n = new Set(prev); n.add(id); return n; });
            setCustomChannelInput("");
            return;
        }
        const label = `#${id}`;
        setCustomChannels(prev => [...prev, { id, label }]);
        setSelected(prev => { const n = new Set(prev); n.add(id); return n; });
        setCustomChannelInput("");
    }

    function removeCustomChannel(id: string) {
        setCustomChannels(prev => prev.filter(c => c.id !== id));
        setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    }

    const filtered = dms.filter(ch => dmLabel(ch).toLowerCase().includes(search.toLowerCase()));

    /* ───── MINIMIZED CIRCLE ───── */
    if (minimized) {
        return ReactDOM.createPortal(
            <div
                onPointerDown={makeDrag(circlePos, setCirclePos)}
                style={{
                    position: "fixed",
                    left: circlePos.x,
                    top:  circlePos.y,
                    width: 52, height: 52,
                    borderRadius: "50%",
                    background: phase === "running" ? T.bg1 : T.bg3,
                    border: `1.5px solid ${phase === "running" ? T.accent : T.border}`,
                    zIndex: 9999999,
                    cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    userSelect: "none",
                    transition: "border-color 0.25s, background 0.25s",
                } as React.CSSProperties}
            >
                <button
                    className="no-drag"
                    title="Open DM Cleaner"
                    onClick={e => { e.stopPropagation(); setMinimized(false); }}
                    style={{
                        all: "unset" as any,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "100%", height: "100%", borderRadius: "50%", cursor: "pointer",
                        fontFamily: T.font,
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: 1,
                        color: phase === "running" ? T.text1 : T.text3,
                        transition: "color 0.2s",
                    } as React.CSSProperties}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.text1; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = phase === "running" ? T.text1 : T.text3; }}
                >
                    III
                </button>
            </div>,
            document.body
        );
    }

    /* ───── EXPANDED PANEL ───── */
    return ReactDOM.createPortal(
        <div
            onPointerDown={makeDrag(panelPos, setPanelPos)}
            style={{
                position: "fixed",
                left: panelPos.x, top: panelPos.y,
                width: 370,
                background: T.bg4,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderRadius: 16,
                border: `1px solid ${T.border}`,

                zIndex: 9999999,
                fontFamily: T.font,
                display: "flex", flexDirection: "column",
                overflow: "hidden",
                userSelect: "none",
                cursor: "grab",
            } as React.CSSProperties}
        >
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "14px 16px 13px",
                background: T.bg3, borderBottom: `1px solid ${T.border}`,
            }}>
                <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: T.bg2, border: `1px solid ${T.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    color: T.accent, fontFamily: T.font, fontSize: 13, fontWeight: 700, letterSpacing: 1,
                }}>
                    III
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.text1, fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>DM Cleaner</div>
                    <div style={{ color: T.text4, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {phase === "running" ? `Cleaning ${currentDM || "…"}` :
                         phase === "done"    ? `Done — ${deletedCount} deleted` :
                         phase === "stopped" ? `Stopped — ${deletedCount} deleted` :
                         `${dms.length} conversation${dms.length !== 1 ? "s" : ""}`}
                    </div>
                </div>
                <button
                    className="no-drag"
                    onClick={e => { e.stopPropagation(); setMinimized(true); }}
                    title="Minimize"
                    style={{
                        all: "unset" as any,
                        cursor: "pointer", color: T.text4,
                        width: 28, height: 28,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 7, fontSize: 18, lineHeight: 1,
                        transition: "background 0.15s, color 0.15s",
                    } as React.CSSProperties}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.hover; el.style.color = T.text1; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = T.text4; }}
                >
                    ‒
                </button>
            </div>

            {/* Scrollable body */}
            <div style={{
                overflowY: "auto", maxHeight: "calc(100vh - 120px)",
                padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12,
            }}>

                {/* RUNNING */}
                {phase === "running" && (
                    <>
                        <div style={{
                            background: T.bg3, border: `1px solid ${T.border}`,
                            borderRadius: 10, padding: "12px 14px",
                            display: "flex", flexDirection: "column", gap: 6,
                        }}>
                            <div style={{ color: T.text5, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>Currently cleaning</div>
                            <div style={{ color: T.text1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {currentDM || "…"}
                            </div>
                            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                                <div>
                                    <span style={{ color: T.text1, fontWeight: 700, fontSize: 20 }}>{deletedCount}</span>
                                    <span style={{ color: T.text4, fontSize: 11, marginLeft: 5 }}>deleted</span>
                                </div>
                                <div>
                                    <span style={{ color: T.text4, fontWeight: 700, fontSize: 20 }}>{skippedCount}</span>
                                    <span style={{ color: T.text5, fontSize: 11, marginLeft: 5 }}>skipped</span>
                                </div>
                            </div>
                        </div>
                        <button className="no-drag" style={baseBtn(T.bg2)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                            onClick={stopCleaning}>
                            ■ &nbsp;Stop Cleaning
                        </button>
                    </>
                )}

                {/* DONE / STOPPED */}
                {(phase === "done" || phase === "stopped") && (
                    <>
                        <div style={{
                            background: T.bg3, border: `1px solid ${T.border}`,
                            borderRadius: 10, padding: "18px 14px", textAlign: "center",
                            display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
                        }}>
                            <div style={{ color: T.text2, fontSize: 24, fontWeight: 300 }}>{phase === "done" ? "✓" : "■"}</div>
                            <div style={{ color: T.text1, fontWeight: 700, fontSize: 15 }}>{phase === "done" ? "All done" : "Stopped"}</div>
                            <div style={{ display: "flex", gap: 14 }}>
                                <span style={{ color: T.text3, fontSize: 12 }}><strong style={{ color: T.text1 }}>{deletedCount}</strong> deleted</span>
                                <span style={{ color: T.text4, fontSize: 12 }}><strong>{skippedCount}</strong> skipped</span>
                            </div>
                        </div>
                        <button className="no-drag" style={baseBtn(T.bg2)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                            onClick={() => { _phase = "idle"; _deletedCount = 0; _skippedCount = 0; notify(); setSelected(new Set()); }}>
                            Clean Again
                        </button>
                    </>
                )}

                {/* IDLE */}
                {phase === "idle" && (
                    <>
                        {/* Search conversations */}
                        <input
                            className="no-drag"
                            type="text"
                            placeholder="Search conversations…"
                            value={search}
                            onChange={e => setSearch((e.target as HTMLInputElement).value)}
                            style={{
                                width: "100%", padding: "8px 12px",
                                background: T.bg3, border: `1px solid ${T.border}`,
                                borderRadius: 9, color: T.text1, fontSize: 13,
                                outline: "none", boxSizing: "border-box" as any,
                                fontFamily: T.font, transition: "border-color 0.15s",
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                        />

                        {/* Select all / clear */}
                        <div className="no-drag" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button style={smallBtn}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                                onClick={() => setSelected(new Set(filtered.map(c => c.id)))}>
                                Select all
                            </button>
                            <button style={smallBtn}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                                onClick={() => setSelected(new Set())}>
                                Clear
                            </button>
                            <span style={{ color: T.text5, fontSize: 11, marginLeft: "auto", fontFamily: T.font }}>
                                {selected.size} selected
                            </span>
                        </div>

                        {/* DM list */}
                        <div className="no-drag" style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, paddingRight: 2 }}>
                            {dms.length === 0 && (
                                <div style={{ color: T.text5, fontSize: 12, textAlign: "center", padding: "20px 0" }}>No open DMs found</div>
                            )}
                            {filtered.map(ch => {
                                const checked = selected.has(ch.id);
                                return (
                                    <label key={ch.id} style={{
                                        display: "flex", alignItems: "center", gap: 10,
                                        padding: "7px 10px", borderRadius: 8,
                                        background: checked ? T.active : "transparent",
                                        border: `1px solid ${checked ? T.border : "transparent"}`,
                                        cursor: "pointer", transition: "background 0.1s, border-color 0.1s",
                                    } as React.CSSProperties}
                                        onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = T.hover; }}
                                        onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                    >
                                        <input type="checkbox" checked={checked} onChange={() => toggle(ch.id)}
                                            style={{ accentColor: T.accent, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }} />
                                        <span style={{
                                            color: checked ? T.text1 : T.text3, fontSize: 13,
                                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                            flex: 1, fontFamily: T.font, transition: "color 0.1s",
                                        } as React.CSSProperties}>
                                            {dmLabel(ch)}
                                        </span>
                                        {ch.type === 3 && <span style={{ color: T.text5, fontSize: 10, flexShrink: 0 }}>Group</span>}
                                    </label>
                                );
                            })}
                        </div>

                        {/* Custom server channel */}
                        <div className="no-drag" style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ color: T.text5, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as any, fontFamily: T.font }}>
                                Custom server channel
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                                <input
                                    className="no-drag"
                                    type="text"
                                    placeholder="Channel ID or discord.com URL…"
                                    value={customChannelInput}
                                    onChange={e => setCustomChannelInput((e.target as HTMLInputElement).value)}
                                    onKeyDown={e => { if (e.key === "Enter") addCustomChannel(); }}
                                    style={{ ...inputStyle, flex: 1 }}
                                    onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                                    onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                                />
                                <button
                                    className="no-drag"
                                    onClick={addCustomChannel}
                                    style={{
                                        ...smallBtn,
                                        padding: "4px 12px",
                                        flexShrink: 0,
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                                >
                                    Add
                                </button>
                            </div>
                            {customChannels.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {customChannels.map(ch => {
                                        const checked = selected.has(ch.id);
                                        return (
                                            <div key={ch.id} style={{
                                                display: "flex", alignItems: "center", gap: 8,
                                                padding: "5px 8px", borderRadius: 7,
                                                background: checked ? T.active : "transparent",
                                                border: `1px solid ${checked ? T.border : "transparent"}`,
                                            }}>
                                                <input
                                                    className="no-drag"
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggle(ch.id)}
                                                    style={{ accentColor: T.accent, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }}
                                                />
                                                <span style={{
                                                    color: checked ? T.text1 : T.text3, fontSize: 12,
                                                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                    fontFamily: T.font,
                                                }}>
                                                    {ch.label}
                                                </span>
                                                <span style={{ color: T.text5, fontSize: 10, flexShrink: 0, fontFamily: T.font }}>
                                                    server
                                                </span>
                                                <button
                                                    className="no-drag"
                                                    onClick={() => removeCustomChannel(ch.id)}
                                                    title="Remove"
                                                    style={{
                                                        all: "unset" as any,
                                                        cursor: "pointer", color: T.text5, fontSize: 14, lineHeight: 1,
                                                        flexShrink: 0, padding: "0 2px",
                                                        transition: "color 0.15s",
                                                    }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.text2; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.text5; }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {customChannels.length === 0 && (
                                <div style={{ color: T.text5, fontSize: 11, fontFamily: T.font }}>
                                    Paste a channel ID or Discord URL to delete your messages from a server channel.
                                </div>
                            )}
                        </div>

                        {/* Filters */}
                        <FilterPanel filters={filters} onChange={setFilters} />

                        {/* Start button */}
                        <button
                            className="no-drag"
                            disabled={selected.size === 0}
                            onClick={() => { if (selected.size > 0) startCleaning([...selected], filters, customChannels); }}
                            style={{
                                ...baseBtn(selected.size > 0 ? T.bg2 : T.bg3),
                                opacity: selected.size > 0 ? 1 : 0.4,
                                cursor: selected.size > 0 ? "pointer" : "not-allowed",
                            }}
                            onMouseEnter={e => { if (selected.size > 0) (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.size > 0 ? T.bg2 : T.bg3; }}
                        >
                            {selected.size > 0
                                ? `Clean ${selected.size} conversation${selected.size !== 1 ? "s" : ""}`
                                : "Select conversations first"}
                        </button>

                        {settings.store.toggleKeybind && (
                            <div style={{ color: T.text5, fontSize: 10, textAlign: "center", fontFamily: T.font }}>
                                Toggle: {settings.store.toggleKeybind}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

/* ─────────────────────────────────────────────
   PLUGIN EXPORT
───────────────────────────────────────────── */

const AuthorIxubux    = (Devs as any).ixubux     ?? { name: "ixubux",     id: 0n };
const AuthorJustNixxx = (Devs as any).just_nixxx ?? { name: "just_nixxx", id: 0n };

let _overlayRoot: any = null;

export default definePlugin({
    name: "DMCleaner",
    description: "Bulk-deletes your own messages from selected DMs with filters. Configure delay and keybind in plugin settings.",
    authors: [AuthorIxubux, AuthorJustNixxx],
    settings,

    start() {
        const container = document.createElement("div");
        container.id = "vc-dmcleaner-root";
        document.body.appendChild(container);
        _overlayRoot = createRoot(container);
        _overlayRoot.render(<FloatingPanel />);
    },

    stop() {
        stopCleaning();
        const el = document.getElementById("vc-dmcleaner-root");
        if (el) {
            try { if (_overlayRoot) { _overlayRoot.unmount(); _overlayRoot = null; } }
            finally { el.remove(); }
        }
    },
});
