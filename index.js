(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { instead, after } = patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;
    if (typeof storage.enabled === "undefined") storage.enabled = true;

    let patches = [];

    function bypassAllPermissions() {
        try {
            // Основные проверки прав
            const permissionModules = findByProps("can", "canManageGuild", "canViewAuditLog", "getGuildPermission");
            if (permissionModules) {
                if (permissionModules.can) {
                    patches.push(instead("can", permissionModules, () => true));
                }
                ["canManageGuild", "canManageRoles", "canViewAuditLog", "canManageChannels", "canManageEmojisAndStickers"].forEach(key => {
                    if (permissionModules[key]) {
                        patches.push(instead(key, permissionModules, () => true));
                    }
                });
            }

            // Guild Action Sheet (меню при долгом нажатии на сервер)
            const actionSheetHook = findByProps("useGuildActionSheetActions") || findByName("useGuildActionSheetActions");
            if (actionSheetHook?.useGuildActionSheetActions) {
                patches.push(after("useGuildActionSheetActions", actionSheetHook, (args, res) => {
                    // Добавляем/разблокируем все пункты меню
                    if (Array.isArray(res)) {
                        res.forEach(item => {
                            if (item && typeof item.onPress === "function") {
                                // Принудительно разрешаем
                            }
                        });
                    }
                    return res;
                }));
            }

            // getGuildActionSheetItems
            const getItems = findByProps("getGuildActionSheetItems");
            if (getItems?.getGuildActionSheetItems) {
                patches.push(instead("getGuildActionSheetItems", getItems, (original, args) => {
                    const items = original(...args) || [];
                    // Можно добавить свои пункты или просто вернуть всё
                    return items;
                }));
            }

            // Guild Settings доступ
            const guildSettings = findByProps("openGuildSettings", "GuildSettings");
            if (guildSettings?.openGuildSettings) {
                patches.push(instead("openGuildSettings", guildSettings, (original, args) => {
                    // Просто открываем без проверок
                    return original(...args);
                }));
            }

            // Патч навигации на GuildSettingsPage
            const navigation = findByProps("push", "pushLazy");
            if (navigation?.push) {
                patches.push(after("push", navigation, (args) => {
                    const [route] = args;
                    if (typeof route === "string" && route.includes("GuildSettings")) {
                        return true; // разрешаем переход
                    }
                }));
            }

            showToast("✅ FakeAdmin: расширенный bypass активирован");
        } catch (e) {
            console.error("[FakeAdmin]", e);
        }
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);

        const save = () => {
            storage.enabled = enabled;
            showToast("✅ Настройки сохранены");
        };

        return React.createElement(RN.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Admin" },
                React.createElement(Forms.FormSwitch, {
                    label: "Включить Fake Admin",
                    value: enabled,
                    onValueChange: setEnabled
                })
            ),
            React.createElement(Forms.FormRow, { label: "💾 Сохранить", onPress: save })
        );
    }

    function onLoad() {
        if (!storage.enabled) return;
        bypassAllPermissions();
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
