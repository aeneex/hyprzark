/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { IconUtils, Menu, UserStore } from "@webpack/common";

let style: HTMLStyleElement | null = null;
let unpatchIconUtils: (() => void) | null = null;

const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/1.png";

const settings = definePluginSettings({
    mode: {
        description: "How profile pictures should be handled across Discord",
        type: OptionType.SELECT,
        default: "hide",
        options: [
            { label: "Hide Profile Pictures (Invisible)", value: "hide" },
            { label: "Blur Profile Pictures (Hover to reveal)", value: "blur" },
            { label: "Replace with Default Discord Profile Picture", value: "default" },
        ],
        onChange: updateStyles
    },
    hideDecorations: {
        description: "Hide avatar decorations, borders, and avatar frames",
        type: OptionType.BOOLEAN,
        default: true,
        onChange: updateStyles
    },
    hideBanners: {
        description: "Hide profile banners in popouts and user profiles",
        type: OptionType.BOOLEAN,
        default: false,
        onChange: updateStyles
    },
    hideServerTags: {
        description: "Hide server and clan tags next to usernames",
        type: OptionType.BOOLEAN,
        default: false,
        onChange: updateStyles
    },
    keepOwnPFP: {
        description: "Keep your own profile picture visible",
        type: OptionType.BOOLEAN,
        default: false,
        onChange: updateStyles
    },
    userExceptions: {
        description: "List of user IDs to exempt from disabling PFPs and server tags (separated by commas, spaces, or newlines)",
        type: OptionType.STRING,
        default: "",
        multiline: true,
        onChange: updateStyles
    }
});

function getExceptedUserIds(): Set<string> {
    const set = new Set<string>();
    if (settings.store.keepOwnPFP) {
        const selfId = UserStore.getCurrentUser()?.id;
        if (selfId) set.add(selfId);
    }
    if (settings.store.userExceptions) {
        const ids = settings.store.userExceptions.split(/[\s,]+/).filter(Boolean);
        for (const id of ids) set.add(id);
    }
    return set;
}

function patchIconUtils() {
    if (unpatchIconUtils) return;

    try {
        const origGetUserAvatarURL = IconUtils.getUserAvatarURL;
        const origGetGuildMemberAvatarURL = IconUtils.getGuildMemberAvatarURL;

        IconUtils.getUserAvatarURL = function (user: any, ...args: any[]) {
            const excepted = getExceptedUserIds();
            if (user?.id && excepted.has(user.id)) {
                return origGetUserAvatarURL.call(this, user, ...args);
            }
            if (settings.store.mode === "default") {
                return DEFAULT_AVATAR_URL;
            }
            return origGetUserAvatarURL.call(this, user, ...args);
        };

        IconUtils.getGuildMemberAvatarURL = function (params: any, ...args: any[]) {
            const excepted = getExceptedUserIds();
            if (params?.user?.id && excepted.has(params.user.id)) {
                return origGetGuildMemberAvatarURL.call(this, params, ...args);
            }
            if (settings.store.mode === "default") {
                return DEFAULT_AVATAR_URL;
            }
            return origGetGuildMemberAvatarURL.call(this, params, ...args);
        };

        unpatchIconUtils = () => {
            IconUtils.getUserAvatarURL = origGetUserAvatarURL;
            IconUtils.getGuildMemberAvatarURL = origGetGuildMemberAvatarURL;
            unpatchIconUtils = null;
        };
    } catch (e) {
        console.error("[DisablePFP] Failed to patch IconUtils:", e);
    }
}

function updateStyles() {
    if (!style) return;

    const exceptedUserIds = Array.from(getExceptedUserIds());
    const notExcepted = exceptedUserIds.length > 0
        ? exceptedUserIds.map(id => `:not([src*="${id}"]):not([style*="${id}"])`).join("")
        : "";

    // Comprehensive CSS selectors covering PFPs across all Discord UI areas
    const imgAvatarSelectors = [
        `img[src*="avatars/"]${notExcepted}`,
        `img[src*="avatar"]${notExcepted}`,
        `foreignObject[mask*="avatar"] img${notExcepted}`,
        `svg[class*="avatar"] image${notExcepted}`
    ];

    const baseAvatarSelectors = [
        ...imgAvatarSelectors,
        `[class*="avatar-"]${notExcepted}`,
        `[class*="avatar_"]${notExcepted}`,
        `[class*="avatarContainer"]${notExcepted}`,
        `[class*="avatarWrapper"]${notExcepted}`,
        `[class*="replyAvatar"]${notExcepted}`,
        `[class*="message-"] [class*="avatar"]${notExcepted}`,
        `[class*="cozy-"] [class*="avatar"]${notExcepted}`,
        `[class*="header-"] [class*="avatar"]${notExcepted}`,
        `[class*="member-"] [class*="avatar"]${notExcepted}`,
        `[class*="layout_"] [class*="avatar"]${notExcepted}`,
        `[class*="channel_"] [class*="avatar"]${notExcepted}`,
        `[class*="privateChannels-"] [class*="avatar"]${notExcepted}`,
        `[class*="userPopout"] [class*="avatar"]${notExcepted}`,
        `[class*="userProfile"] [class*="avatar"]${notExcepted}`,
        `[class*="voiceUser"] [class*="avatar"]${notExcepted}`,
        `[class*="tile-"] [class*="avatar"]${notExcepted}`,
        `[class*="callAvatar"]${notExcepted}`,
        `[class*="peopleListItem"] [class*="avatar"]${notExcepted}`,
        `[class*="panels-"] [class*="avatar"]${notExcepted}`,
        `[class*="accountProfileCard"] [class*="avatar"]${notExcepted}`,
        `[class*="typing-"] [class*="avatar"]${notExcepted}`,
        `[class*="reaction-"] [class*="avatar"]${notExcepted}`
    ];

    let css = "";

    const mode = settings.store.mode;

    if (mode === "hide") {
        css += `
            ${baseAvatarSelectors.join(",\n")} {
                visibility: hidden !important;
                opacity: 0 !important;
            }
        `;
    } else if (mode === "blur") {
        const hoverSelectors = baseAvatarSelectors.map(s => `${s}:hover`).join(",\n");
        css += `
            ${baseAvatarSelectors.join(",\n")} {
                filter: blur(12px) !important;
                transition: filter 0.2s ease-in-out !important;
            }
            ${hoverSelectors} {
                filter: blur(0px) !important;
            }
        `;
    } else if (mode === "default") {
        css += `
            ${imgAvatarSelectors.join(",\n")} {
                content: url("${DEFAULT_AVATAR_URL}") !important;
                object-fit: cover !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
        `;
    }

    if (settings.store.hideDecorations) {
        css += `
            [class*="avatarDecoration"],
            img[class*="avatarDecoration"],
            svg[class*="avatarDecoration"] {
                display: none !important;
            }
        `;
    }

    if (settings.store.hideBanners) {
        css += `
            [class*="bannerSVGWrapper"],
            [class*="banner-"],
            [class*="userProfile"] [class*="banner"] {
                display: none !important;
            }
        `;
    }

    if (settings.store.hideServerTags) {
        css += `
            [class*="clanTag"],
            [class*="clanTagChip"],
            [class*="clanTagContainer"],
            [class*="primaryGuild"],
            [class*="clanBadge"],
            [class*="guildTag"],
            [class*="serverTag"],
            [class*="clan-"] {
                display: none !important;
            }
        `;
    }

    style.textContent = css;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;

    const currentExceptions = settings.store.userExceptions
        ? new Set(settings.store.userExceptions.split(/[\s,]+/).filter(Boolean))
        : new Set<string>();

    const isExcepted = currentExceptions.has(user.id);

    children.push(
        <Menu.MenuItem
            id="vc-disablepfp-toggle-exception"
            label={isExcepted ? "Remove DisablePFP Exception" : "Add DisablePFP Exception"}
            action={() => {
                if (isExcepted) {
                    currentExceptions.delete(user.id);
                } else {
                    currentExceptions.add(user.id);
                }
                settings.store.userExceptions = Array.from(currentExceptions).join(", ");
                updateStyles();
            }}
        />
    );
};

export default definePlugin({
    name: "DisablePFP",
    description: "Disables and hides profile pictures (PFPs) everywhere across Discord.",
    tags: ["Appearance", "Privacy", "Customisation"],
    authors: [Devs.Ven],
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    start() {
        style = createAndAppendStyle("DisablePFP", managedStyleRootNode);
        patchIconUtils();
        updateStyles();
    },

    stop() {
        unpatchIconUtils?.();
        style?.remove();
        style = null;
    }
});
