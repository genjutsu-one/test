"use strict";

// Диагностический плагин — показывает что реально доступно в API Kettu/Vendetta

function safeKeys(obj) {
    try {
        if (!obj || typeof obj !== "object") return "(не объект: " + typeof obj + ")";
        var keys = Object.keys(obj);
        return keys.length ? keys.join(", ") : "(пусто)";
    } catch(e) { return "ошибка: " + e.message; }
}

function buildReport() {
    var lines = [];

    var hasVendetta = typeof vendetta !== "undefined";
    var hasKettu = typeof kettu !== "undefined";
    var hasBunny = typeof bunny !== "undefined";

    lines.push("=== Глобальные объекты ===");
    lines.push("vendetta: " + hasVendetta);
    lines.push("kettu: " + hasKettu);
    lines.push("bunny: " + hasBunny);

    var G = hasVendetta ? vendetta : (hasKettu ? kettu : (hasBunny ? bunny : null));
    var Gname = hasVendetta ? "vendetta" : (hasKettu ? "kettu" : (hasBunny ? "bunny" : "НИЧЕГО"));

    lines.push("");
    lines.push("=== Используем: " + Gname + " ===");

    if (!G) {
        lines.push("КРИТИЧНО: ни один глобальный объект не найден!");
        return lines.join("\n");
    }

    lines.push("Корневые ключи: " + safeKeys(G));

    try {
        lines.push("");
        lines.push("--- metro ---");
        lines.push(safeKeys(G.metro));
        if (G.metro && G.metro.common) {
            lines.push("metro.common: " + safeKeys(G.metro.common));
            if (G.metro.common.ReactNative) {
                lines.push("metro.common.ReactNative: " + safeKeys(G.metro.common.ReactNative));
            }
        }
    } catch(e) { lines.push("metro error: " + e.message); }

    try {
        lines.push("");
        lines.push("--- ui ---");
        lines.push(safeKeys(G.ui));
        if (G.ui && G.ui.components) {
            lines.push("ui.components: " + safeKeys(G.ui.components));
            if (G.ui.components.General) {
                lines.push("ui.components.General: " + safeKeys(G.ui.components.General));
            }
            if (G.ui.components.Forms) {
                lines.push("ui.components.Forms: " + safeKeys(G.ui.components.Forms));
            }
        }
    } catch(e) { lines.push("ui error: " + e.message); }

    try {
        lines.push("");
        lines.push("--- patcher ---");
        lines.push(safeKeys(G.patcher));
    } catch(e) { lines.push("patcher error: " + e.message); }

    try {
        lines.push("");
        lines.push("--- plugin ---");
        lines.push(safeKeys(G.plugin));
        if (G.plugin) lines.push("plugin.storage: " + safeKeys(G.plugin.storage));
    } catch(e) { lines.push("plugin error: " + e.message); }

    try {
        lines.push("");
        lines.push("--- metro.findByProps('getChannelId') ---");
        var ch = G.metro.findByProps("getChannelId");
        lines.push(ch ? "найдено, текущий канал: " + ch.getChannelId() : "не найдено");
    } catch(e) { lines.push("findByProps error: " + e.message); }

    return lines.join("\n");
}

function showReport() {
    var report = buildReport();
    console.log("[AI Chat Diagnostic]\n" + report);

    try {
        var hasVendetta = typeof vendetta !== "undefined";
        var hasKettu = typeof kettu !== "undefined";
        var hasBunny = typeof bunny !== "undefined";
        var G = hasVendetta ? vendetta : (hasKettu ? kettu : (hasBunny ? bunny : null));

        if (G && G.ui && G.ui.alerts && G.ui.alerts.showConfirmationAlert) {
            G.ui.alerts.showConfirmationAlert({
                title: "🔍 Диагностика",
                content: report,
                confirmText: "OK"
            });
            return;
        }
    } catch(e) {}

    // fallback: алертим частями через toast или нативный Alert
    try {
        var RN = (typeof vendetta !== "undefined" ? vendetta : (typeof kettu !== "undefined" ? kettu : bunny));
        if (RN && RN.metro) {
            var alertMod = RN.metro.findByProps("alert");
            if (alertMod && alertMod.alert) {
                alertMod.alert("Диагностика AI Chat", report);
                return;
            }
        }
    } catch(e) {}

    console.error("[AI Chat Diagnostic] Не удалось показать алерт, смотри console.log выше");
}

module.exports = {
    onLoad: showReport,
    onUnload: function() {},
    settings: function() { return null; },
    Settings: function() { return null; }
};
