(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { instead, after } = patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;

    if (typeof storage.enabled === "undefined") storage.enabled = true;

    let patches = [];

    function bypassAllPermissions() {
        try {
            // Основная проверка прав
            const canModule = findByProps("can", "canManageGuild", "canViewAuditLog");
            if (canModule?.can) {
                patches.push(instead("can", canModule, () => true));
            }

            // Дополнительные модули
            const guildModules = findByProps("getGuild", "canManageGuild", "getGuildPermissions");
            if (guildModules) {
                ["canManageGuild", "canManageRoles", "canViewAuditLog", 
                 "canManageChannels", "canManageEmojisAndStickers"].forEach(m => {
                    if (guildModules[m]) {
                        patches.push(instead(m, guildModules, () => true));
                    }
                });
            }

            console.log("[FakeAdmin] Права пропатчены");
        } catch (e) {}
    }

    // Принудительно показываем скрытые разделы в настройках сервера
    function patchGuildSettings() {
        const GuildSettings = findByName("GuildSettings") || findByProps("GuildSettings")?.default;

        if (GuildSettings) {
            patches.push(after("default", GuildSettings, (args, ret) => {
                try {
                    // Форсируем показ всех разделов
                    if (ret?.props?.children) {
                        // Можно добавить логику, но обычно достаточно патча прав
                    }
                } catch (e) {}
                return ret;
            }));
        }
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);

        const save = () => {
            storage.enabled = enabled;
            showToast("✅ Сохранено");
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
        patchGuildSettings();

        showToast("✅ FakeAdmin v2 загружен\nПопробуй зайти в настройки сервера");
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
