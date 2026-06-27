(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { instead, after } = patcher;
    const { showToast } = vendetta.ui.toasts;(function () {
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
            // 1. Точечный обход проверки прав администратора сервера
            const permissionModules = findByProps("can", "canManageGuild", "getGuildPermission");
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
            // 1. Точечный обход проверки прав администратора сервера
            const permissionModules = findByProps("can", "canManageGuild", "getGuildPermission");
            if (permissionModules) {
                ["canManageGuild", "canManageRoles", "canViewAuditLog", "canManageChannels", "canManageEmojisAndStickers"].forEach(key => {
                    if (permissionModules[key]) {
                        patches.push(instead(key, permissionModules, () => true));
                    }
                });
            }

            // 2. Внедрение кнопок в контекстное меню сервера (Guild Action Sheet)
            const actionSheetHook = findByProps("useGuildActionSheetActions") || findByName("useGuildActionSheetActions");
            if (actionSheetHook) {
                // В зависимости от версии Discord метод может быть напрямую или внутри объекта
                const targetMethod = actionSheetHook.useGuildActionSheetActions ? "useGuildActionSheetActions" : "default";
                
                patches.push(after(targetMethod, actionSheetHook, (args, res) => {
                    // Если массив кнопок существует, принудительно добавляем недостающие элементы интерфейса
                    if (Array.isArray(res)) {
                        // Проверяем, есть ли уже кнопка настроек, если нет — добавляем её визуальный фейк
                        const hasSettings = res.some(item => item?.text?.toLowerCase().includes("settings"));
                        
                        if (!hasSettings) {
                            // Пушим фейковую кнопку "Settings"
                            res.push({
                                text: "Settings (Fake)",
                                icon: "cog", // Системное имя иконки шестеренки в Discord
                                onPress: () => {
                                    const guildId = args[0]?.guild?.id;
                                    const guildSettings = findByProps("openGuildSettings");
                                    if (guildSettings?.openGuildSettings && guildId) {
                                        guildSettings.openGuildSettings(guildId);
                                    } else {
                                        showToast("❌ Не удалось открыть настройки");
                                    }
                                }
                            });

                            // Пушим фейковую кнопку создания каналов
                            res.push({
                                text: "Create Channel (Fake)",
                                icon: "plus",
                                onPress: () => showToast("ℹ️ Это визуальный фейк, действие отклонено сервером")
                            });
                        }
                    }
                    return res;
                }));
            }

            // 3. Исправление функции открытия экрана настроек (Исправлен порядок аргументов!)
            const guildSettings = findByProps("openGuildSettings");
            if (guildSettings?.openGuildSettings) {
                // В instead: первый параметр — массив аргументов при вызове, второй — оригинальная функция
                patches.push(instead("openGuildSettings", guildSettings, (args, original) => {
                    // Разрешаем выполнение оригинальной функции отрисовки экрана
                    return original(...args);
                }));
            }

            // 4. Патч роутера навигации
            const navigation = findByProps("push", "pushLazy");
            if (navigation?.push) {
                patches.push(after("push", navigation, (args) => {
                    const [route] = args;
                    if (typeof route === "string" && route.includes("GuildSettings")) {
                        return true; 
                    }
                }));
            }

            showToast("✅ FakeAdmin: элементы меню успешно внедрены");
        } catch (e) {
            console.error("[FakeAdmin]", e);
        }
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);

        const save = () => {
            storage.enabled = enabled;
            showToast("✅ Настройки сохранены. Перезапустите Discord");
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
