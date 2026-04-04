/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { Devs } from "@utils/constants";
import { ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { createRoot, React, ReactDOM, useEffect, useState } from "@webpack/common";

/* ─────────────────────────────────────────────
   SETTINGS
───────────────────────────────────────────── */

const TokenModule = findByPropsLazy("getToken");
function getAuthToken(): string { return TokenModule?.getToken?.() ?? ""; }

const settings = definePluginSettings({
    toggleKeybind: {
        type: OptionType.STRING,
        description: "Key combo to toggle the overlay open/closed (e.g. Control+Shift+A)",
        default: "Control+Shift+A",
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
   SENDER MODEL
───────────────────────────────────────────── */

interface Sender {
    id: string;
    label: string;
    channelId: string;
    message: string;
    interval: number;       // seconds
    running: boolean;
    secs: number;           // countdown
    autoId:  ReturnType<typeof setInterval> | null;
    countId: ReturnType<typeof setInterval> | null;
}

function makeSender(overrides?: Partial<Sender>): Sender {
    return {
        id:        Math.random().toString(36).slice(2),
        label:     "Sender",
        channelId: "",
        message:   "!work",
        interval:  600,
        running:   false,
        secs:      0,
        autoId:    null,
        countId:   null,
        ...overrides,
    };
}

/* ─────────────────────────────────────────────
   MODULE-LEVEL STATE  (array of senders)
───────────────────────────────────────────── */

let _senders: Sender[] = [makeSender({ label: "Sender 1" })];

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() { listeners.forEach(fn => fn()); }

function usePluginState() {
    const [, tick] = useState(0);
    useEffect(() => {
        const cb = () => tick(n => n + 1);
        listeners.add(cb);
        return () => { listeners.delete(cb); };
    }, []);
    return _senders;
}

/* ─────────────────────────────────────────────
   PER-SENDER LOGIC
───────────────────────────────────────────── */

async function sendMsg(channel: string, message: string) {
    const token = getAuthToken();
    if (!token) return;
    try {
        const res = await fetch(`https://discord.com/api/v9/channels/${channel}/messages`, {
            method: "POST",
            headers: { "Authorization": token, "Content-Type": "application/json" },
            body: JSON.stringify({ content: message }),
        });
        if (res.status === 429) {
            const data = await res.json();
            setTimeout(() => sendMsg(channel, message), (data.retry_after ?? 5) * 1000);
        }
    } catch (e) {
        console.error("[AutoSender]", e);
    }
}

function startSender(id: string) {
    const s = _senders.find(x => x.id === id);
    if (!s || !s.channelId || !s.message || s.interval <= 0) return;
    stopSender(id);

    // re-find after stop (stopSender mutates)
    const sender = _senders.find(x => x.id === id)!;

    function loop() {
        sendMsg(sender.channelId, sender.message);
        let sec = sender.interval;
        sender.running = true;
        sender.secs    = sec;
        notify();

        if (sender.countId !== null) clearInterval(sender.countId);
        sender.countId = setInterval(() => {
            sec--;
            sender.secs = Math.max(0, sec);
            notify();
            if (sec <= 0) clearInterval(sender.countId!);
        }, 1000);
    }

    loop();
    sender.autoId = setInterval(loop, sender.interval * 1000);
}

function stopSender(id: string) {
    const s = _senders.find(x => x.id === id);
    if (!s) return;
    if (s.autoId  !== null) { clearInterval(s.autoId);  s.autoId  = null; }
    if (s.countId !== null) { clearInterval(s.countId); s.countId = null; }
    s.running = false;
    s.secs    = 0;
    notify();
}

function stopAllSenders() {
    _senders.forEach(s => stopSender(s.id));
}

function addSender() {
    _senders = [..._senders, makeSender({ label: `Sender ${_senders.length + 1}` })];
    notify();
}

function removeSender(id: string) {
    stopSender(id);
    _senders = _senders.filter(s => s.id !== id);
    notify();
}

function updateSender(id: string, patch: Partial<Sender>) {
    _senders = _senders.map(s => s.id === id ? { ...s, ...patch } : s);
    notify();
}

/* ─────────────────────────────────────────────
   KEYBIND HELPER
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

const inputStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: "7px 10px",
    background: T.bg4, border: `1px solid ${T.border}`,
    borderRadius: 7, color: T.text1, fontSize: 12,
    outline: "none", boxSizing: "border-box" as any,
    fontFamily: T.font, transition: "border-color 0.15s",
    width: "100%",
    ...extra,
});

function SectionLabel({ children }: { children: React.ReactNode; }) {
    return (
        <div style={{ color: T.text5, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4, fontFamily: T.font }}>
            {children}
        </div>
    );
}

/* ─────────────────────────────────────────────
   MINI COUNTDOWN RING
───────────────────────────────────────────── */

function MiniRing({ running, secs, interval, size = 36 }: {
    running: boolean; secs: number; interval: number; size?: number;
}) {
    const r      = size * 0.38;
    const circ   = 2 * Math.PI * r;
    const offset = circ * (1 - (running ? Math.min(secs / Math.max(interval, 1), 1) : 0));
    const cx = size / 2, cy = size / 2;

    return (
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
            <circle cx={cx} cy={cy} r={r} stroke={T.border} strokeWidth="2.5" fill="none" />
            <circle
                cx={cx} cy={cy} r={r}
                stroke={running ? T.text2 : T.text5}
                strokeWidth="2.5" fill="none"
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeDasharray={circ}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
            />
            <text
                x={cx} y={cy}
                textAnchor="middle" dominantBaseline="central"
                fill={running ? T.text1 : T.text5}
                fontSize={size * 0.28} fontWeight="700" fontFamily={T.font}
            >
                {running ? (secs >= 60 ? `${Math.ceil(secs / 60)}m` : `${secs}`) : "–"}
            </text>
        </svg>
    );
}

/* ─────────────────────────────────────────────
   SENDER CARD  (expanded edit view)
───────────────────────────────────────────── */

function SenderCard({ sender, onClose }: { sender: Sender; onClose: () => void; }) {
    // local edit state — flushed to module on every change
    const [label,     setLabel]     = useState(sender.label);
    const [channelId, setChannelId] = useState(sender.channelId);
    const [message,   setMessage]   = useState(sender.message);
    const [interval,  setInterval_] = useState(sender.interval);

    const running  = sender.running;
    const canStart = !!channelId.trim() && !!message.trim() && interval > 0;

    function commit(patch: Partial<Sender>) {
        updateSender(sender.id, patch);
    }

    return (
        <div style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
        }}>
            <div
                className="no-drag"
                style={{
                    width: 320,
                    background: T.bg3,
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,

                    overflow: "hidden",
                    fontFamily: T.font,
                }}
            >
                {/* Card header */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", background: T.bg2, borderBottom: `1px solid ${T.border}`,
                }}>
                    <input
                        type="text"
                        value={label}
                        onChange={e => { const v = (e.target as HTMLInputElement).value; setLabel(v); commit({ label: v }); }}
                        style={{
                            ...inputStyle({ background: "transparent", border: "none", padding: "0", fontSize: 14, fontWeight: 700, color: T.text1, width: "auto", flex: 1 }),
                        }}
                        placeholder="Sender name"
                    />
                    <button
                        onClick={onClose}
                        style={{
                            all: "unset" as any,
                            cursor: "pointer", color: T.text4,
                            width: 26, height: 26,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: 6, fontSize: 16, lineHeight: 1,
                            transition: "background 0.15s, color 0.15s", flexShrink: 0,
                        } as React.CSSProperties}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.hover; el.style.color = T.text1; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = T.text4; }}
                    >
                        ✕
                    </button>
                </div>

                {/* Card body */}
                <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>

                    <div>
                        <SectionLabel>Channel ID</SectionLabel>
                        <input
                            type="text"
                            placeholder="e.g. 123456789012345678"
                            value={channelId}
                            onChange={e => { const v = (e.target as HTMLInputElement).value; setChannelId(v); commit({ channelId: v }); }}
                            style={inputStyle({ opacity: running ? 0.5 : 1 } as any)}
                            onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                            disabled={running}
                        />
                    </div>

                    <div>
                        <SectionLabel>Message</SectionLabel>
                        <input
                            type="text"
                            placeholder="e.g. !work"
                            value={message}
                            onChange={e => { const v = (e.target as HTMLInputElement).value; setMessage(v); commit({ message: v }); }}
                            style={inputStyle({ opacity: running ? 0.5 : 1 } as any)}
                            onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                            disabled={running}
                        />
                    </div>

                    <div>
                        <SectionLabel>Interval (seconds)</SectionLabel>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                            <input
                                type="number"
                                min={1}
                                value={interval}
                                onChange={e => {
                                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                                    if (!isNaN(v) && v > 0) { setInterval_(v); commit({ interval: v }); }
                                }}
                                style={inputStyle({ flex: "1" as any, opacity: running ? 0.5 : 1 } as any)}
                                onFocus={e => { e.currentTarget.style.borderColor = T.borderF; }}
                                onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
                                disabled={running}
                            />
                            {([60, 300, 600, 3600] as const).map(s => (
                                <button
                                    key={s}
                                    disabled={running}
                                    onClick={() => { setInterval_(s); commit({ interval: s }); }}
                                    style={{
                                        all: "unset" as any,
                                        cursor: running ? "not-allowed" : "pointer",
                                        padding: "5px 7px", borderRadius: 6,
                                        background: interval === s ? T.active : "transparent",
                                        border: `1px solid ${interval === s ? T.borderF : T.border}`,
                                        color: interval === s ? T.text1 : T.text4,
                                        fontSize: 10, fontWeight: 600, fontFamily: T.font,
                                        opacity: running ? 0.4 : 1, flexShrink: 0,
                                        transition: "all 0.12s",
                                    }}
                                >
                                    {s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {running && (
                        <div style={{ color: T.text5, fontSize: 10, textAlign: "center" }}>Stop to edit config</div>
                    )}

                    <button
                        onClick={() => running ? stopSender(sender.id) : startSender(sender.id)}
                        disabled={!running && !canStart}
                        style={{
                            ...baseBtn(T.bg2),
                            opacity: (!running && !canStart) ? 0.4 : 1,
                            cursor: (!running && !canStart) ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={e => { if (running || canStart) (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                    >
                        {running ? "■ Stop" : (canStart ? "▶ Start" : "Fill in config first")}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   SENDER ROW  (compact list item)
───────────────────────────────────────────── */

function SenderRow({ sender, onEdit, onDelete }: {
    sender: Sender;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const senders = usePluginState(); // subscribe to live updates
    const live    = senders.find(s => s.id === sender.id) ?? sender;

    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            background: T.bg3,
            border: `1px solid ${live.running ? T.borderF : T.border}`,
            borderRadius: 10,
            transition: "border-color 0.2s",
        }}>
            {/* Ring */}
            <MiniRing running={live.running} secs={live.secs} interval={live.interval} size={38} />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: live.running ? T.text1 : T.text2, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {live.label || "Sender"}
                </div>
                <div style={{ color: T.text5, fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {live.channelId
                        ? `#…${live.channelId.slice(-5)} · ${live.message || "—"} · every ${live.interval >= 3600 ? `${live.interval / 3600}h` : live.interval >= 60 ? `${live.interval / 60}m` : `${live.interval}s`}`
                        : "Not configured"}
                </div>
            </div>

            {/* Toggle switch */}
            <button
                className="no-drag"
                title={live.running ? "Stop" : "Start"}
                onClick={() => live.running ? stopSender(live.id) : startSender(live.id)}
                style={{
                    all: "unset" as any,
                    cursor: "pointer",
                    width: 36, height: 20,
                    borderRadius: 10,
                    background: live.running ? T.accent : T.bg1,
                    border: `1px solid ${live.running ? T.borderF : T.border}`,
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s, border-color 0.2s",
                } as React.CSSProperties}
            >
                <span style={{
                    position: "absolute",
                    top: 2, left: live.running ? 18 : 2,
                    width: 14, height: 14,
                    borderRadius: "50%",
                    background: live.running ? T.bg4 : T.text5,
                    transition: "left 0.2s, background 0.2s",
                }} />
            </button>

            {/* Edit */}
            <button
                className="no-drag"
                title="Edit"
                onClick={onEdit}
                style={{
                    all: "unset" as any,
                    cursor: "pointer", color: T.text4,
                    width: 26, height: 26,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 6, fontSize: 13,
                    transition: "background 0.15s, color 0.15s",
                } as React.CSSProperties}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.hover; el.style.color = T.text1; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = T.text4; }}
            >
                ✎
            </button>

            {/* Delete */}
            <button
                className="no-drag"
                title="Remove"
                onClick={onDelete}
                style={{
                    all: "unset" as any,
                    cursor: "pointer", color: T.text5,
                    width: 26, height: 26,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 6, fontSize: 14,
                    transition: "background 0.15s, color 0.15s",
                } as React.CSSProperties}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.hover; el.style.color = T.text3; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = T.text5; }}
            >
                ✕
            </button>
        </div>
    );
}

/* ─────────────────────────────────────────────
   FLOATING PANEL
───────────────────────────────────────────── */

function FloatingPanel() {
    const senders = usePluginState();
    const [minimized,   setMinimized]   = useState(true);
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [circlePos,   setCirclePos]   = useState(() => ({
        x: (settings.store.circleX >= 0) ? settings.store.circleX : window.innerWidth - 88,
        y: (settings.store.circleY >= 0) ? settings.store.circleY : window.innerHeight - 220,
    }));
    const [panelPos,    setPanelPos]    = useState({ x: window.innerWidth - 400, y: window.innerHeight - 560 });

    const anyRunning  = senders.some(s => s.running);
    const runningCount = senders.filter(s => s.running).length;

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

    const editingSender = editingId ? senders.find(s => s.id === editingId) ?? null : null;

    /* ── MINIMIZED CIRCLE ── */
    if (minimized) {
        return ReactDOM.createPortal(
            <div
                onPointerDown={makeDrag(circlePos, setCirclePos)}
                style={{
                    position: "fixed",
                    left: circlePos.x, top: circlePos.y,
                    width: 52, height: 52,
                    borderRadius: "50%",
                    background: anyRunning ? T.bg1 : T.bg3,
                    border: `1.5px solid ${anyRunning ? T.accent : T.border}`,
                    zIndex: 9999999,
                    cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    userSelect: "none",
                    transition: "border-color 0.25s, background 0.25s",
                } as React.CSSProperties}
            >
                <button
                    className="no-drag"
                    title="Open AutoSender"
                    onClick={e => { e.stopPropagation(); setMinimized(false); }}
                    style={{
                        all: "unset" as any,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "100%", height: "100%",
                        borderRadius: "50%", cursor: "pointer",
                        fontFamily: T.font,
                        fontSize: anyRunning ? 12 : 15,
                        fontWeight: 700, letterSpacing: anyRunning ? 0 : 1,
                        color: anyRunning ? T.text2 : T.text3,
                        transition: "color 0.2s",
                    } as React.CSSProperties}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.text1; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = anyRunning ? T.text2 : T.text3; }}
                >
                    {anyRunning ? `${runningCount}▶` : "III"}
                </button>
            </div>,
            document.body
        );
    }

    /* ── EXPANDED PANEL ── */
    return ReactDOM.createPortal(
        <>
            <div
                onPointerDown={makeDrag(panelPos, setPanelPos)}
                style={{
                    position: "fixed",
                    left: panelPos.x, top: panelPos.y,
                    width: 360,
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
                        <div style={{ color: T.text1, fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>AutoSender</div>
                        <div style={{ color: T.text4, fontSize: 11, marginTop: 2 }}>
                            {runningCount > 0
                                ? `${runningCount} of ${senders.length} running`
                                : `${senders.length} sender${senders.length !== 1 ? "s" : ""} · idle`}
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

                {/* Sender list */}
                <div style={{
                    padding: "12px 14px 14px",
                    display: "flex", flexDirection: "column", gap: 8,
                    overflowY: "auto", maxHeight: "calc(100vh - 200px)",
                }}>
                    {senders.map(s => (
                        <SenderRow
                            key={s.id}
                            sender={s}
                            onEdit={() => setEditingId(s.id)}
                            onDelete={() => {
                                if (editingId === s.id) setEditingId(null);
                                removeSender(s.id);
                            }}
                        />
                    ))}

                    {/* Add sender button */}
                    <button
                        className="no-drag"
                        onClick={addSender}
                        style={{
                            all: "unset" as any,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                            padding: "9px 0",
                            borderRadius: 10,
                            background: "transparent",
                            border: `1px dashed ${T.border}`,
                            color: T.text4, fontSize: 12, fontWeight: 600,
                            cursor: "pointer", fontFamily: T.font,
                            transition: "border-color 0.15s, color 0.15s",
                        } as React.CSSProperties}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.borderF; el.style.color = T.text2; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.border;  el.style.color = T.text4; }}
                    >
                        + Add Sender
                    </button>

                    {/* Stop all (shown when any running) */}
                    {anyRunning && (
                        <button
                            className="no-drag"
                            onClick={stopAllSenders}
                            style={{
                                ...baseBtn(T.bg2),
                                fontSize: 12,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                        >
                            ■ Stop All
                        </button>
                    )}

                    {settings.store.toggleKeybind && (
                        <div style={{ color: T.text5, fontSize: 10, textAlign: "center", fontFamily: T.font, marginTop: 2 }}>
                            Toggle: {settings.store.toggleKeybind}
                        </div>
                    )}
                </div>
            </div>

            {/* Sender edit card — rendered as overlay on top of panel */}
            {editingSender && (
                <SenderCard
                    sender={editingSender}
                    onClose={() => setEditingId(null)}
                />
            )}
        </>,
        document.body
    );
}

/* ─────────────────────────────────────────────
   CONTROL MODAL  (chat-bar button)
───────────────────────────────────────────── */

function ControlModal({ modalProps }: Readonly<{ modalProps: ModalProps; }>) {
    const senders      = usePluginState();
    const runningCount = senders.filter(s => s.running).length;
    const anyRunning   = runningCount > 0;

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" tag="h2" style={{ margin: 0, fontFamily: T.font, color: T.text1 }}>
                    AutoSender
                </BaseText>
            </ModalHeader>
            <ModalContent style={{ padding: "16px 20px", background: T.bg4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{
                        background: T.bg3, border: `1px solid ${T.border}`,
                        borderRadius: 10, padding: "12px 14px",
                        color: anyRunning ? T.text1 : T.text4,
                        fontWeight: 700, fontSize: 15, fontFamily: T.font, textAlign: "center",
                    }}>
                        {anyRunning
                            ? `${runningCount} of ${senders.length} sender${senders.length !== 1 ? "s" : ""} running`
                            : "No senders running"}
                    </div>

                    {anyRunning && (
                        <button style={baseBtn(T.bg2)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg1; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                            onClick={() => { stopAllSenders(); modalProps.onClose(); }}>
                            ■ Stop All
                        </button>
                    )}

                    <button style={{ ...baseBtn(T.bg3), color: T.text4 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bg2; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bg3; }}
                        onClick={() => modalProps.onClose()}>
                        Close
                    </button>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

/* ─────────────────────────────────────────────
   CHAT-BAR BUTTON
───────────────────────────────────────────── */

function openControl() { openModal(mp => <ControlModal modalProps={mp} />); }

const AutoSenderButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const senders    = usePluginState();
    const anyRunning = senders.some(s => s.running);
    if (!isMainChat) return null;
    return (
        <ChatBarButton tooltip={anyRunning ? "AutoSender — Running" : "AutoSender"} onClick={openControl}>
            <svg width="20" height="20" viewBox="0 0 24 24"
                style={{
                    color: anyRunning ? T.text1 : T.text4,
                    filter: anyRunning ? "drop-shadow(0 0 4px rgba(255,255,255,0.3))" : "none",
                    transition: "color 0.2s, filter 0.2s",
                }}
            >
                <path fill="currentColor" d="M13 2L4.09344 12.6879C3.74463 13.1064 3.57023 13.3157 3.56756 13.4925C3.56524 13.6461 3.63372 13.7923 3.75324 13.8889C3.89073 14 4.15943 14 4.69683 14H12L11 22L19.9066 11.3121C20.2554 10.8936 20.4298 10.6843 20.4324 10.5075C20.4348 10.3539 20.3663 10.2077 20.2468 10.1111C20.1093 10 19.8406 10 19.3032 10H12L13 2Z" />
            </svg>
        </ChatBarButton>
    );
};

/* ─────────────────────────────────────────────
   PLUGIN EXPORT
───────────────────────────────────────────── */

const AuthorIxubux    = (Devs as any).ixubux     ?? { name: "ixubux",     id: 0n };
const AuthorJustNixxx = (Devs as any).just_nixxx ?? { name: "just_nixxx", id: 0n };

let _overlayRoot: any = null;

export default definePlugin({
    name: "AutoSender",
    description: "Sends messages to channels on set intervals. Supports multiple independent senders.",
    authors: [AuthorIxubux, AuthorJustNixxx],
    settings,

    start() {
        const container = document.createElement("div");
        container.id = "vc-autosender-root";
        document.body.appendChild(container);
        _overlayRoot = createRoot(container);
        _overlayRoot.render(<FloatingPanel />);
    },

    stop() {
        stopAllSenders();
        const el = document.getElementById("vc-autosender-root");
        if (el) {
            try { if (_overlayRoot) { _overlayRoot.unmount(); _overlayRoot = null; } }
            finally { el.remove(); }
        }
    },

    chatBarButton: {
        icon: ({ width = 20, height = 20 }) => (
            <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L4.09344 12.6879C3.74463 13.1064 3.57023 13.3157 3.56756 13.4925C3.56524 13.6461 3.63372 13.7923 3.75324 13.8889C3.89073 14 4.15943 14 4.69683 14H12L11 22L19.9066 11.3121C20.2554 10.8936 20.4298 10.6843 20.4324 10.5075C20.4348 10.3539 20.3663 10.2077 20.2468 10.1111C20.1093 10 19.8406 10 19.3032 10H12L13 2Z" />
            </svg>
        ),
        render: AutoSenderButton,
    },
});
