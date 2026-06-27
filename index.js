(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { instead } = patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;

    if (typeof storage.enabled === "undefined") storage.enabled = true;

    let patches = [];

    function bypassAllPermissions() {
        try {
            const modules = findByProps("can", "canManageGuild", "canViewAuditLog");

            if (modules) {
                if (modules.can) {
                    patches.push(instead("can", modules, () => true));
                }

                const keys = ["canManageGuild", "canManageRoles", "canViewAuditLog", "canManageChannels"];
                keys.forEach(key => {
                    if (modules[key]) {
                        patches.push(instead(key, modules, () => true));
                    }
                });
            }
        } catch (e) {}
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
        showToast("✅ FakeAdmin включён");
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
