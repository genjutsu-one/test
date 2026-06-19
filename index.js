"use strict";

// AI Chat Translator — Vendetta/Bunny plugin
// Без сборки, без JSX, module.exports

const { findByProps, findByDisplayName } = vendetta.metro;
const { after } = vendetta.patcher;
const { showToast } = vendetta.ui.toasts;
const { showConfirmationAlert } = vendetta.ui.alerts;
const storage = vendetta.plugin.storage;

// Дефолты
if (!storage.apiKey)    storage.apiKey    = "";
if (!storage.model)     storage.model     = "gpt-4o-mini";
if (!storage.sysPrompt) storage.sysPrompt =
    "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
    "Используй его чтобы понимать тему. Отвечай кратко и точно.";

const MODELS = ["gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "gpt-4o"];

let patches     = [];
let chatHistory = [];
let activeChan  = null;

// ── Контекст чата ──────────────────────────────────────────────
function getContext(channelId) {
    try {
        var MS = findByProps("getMessages");
        var US = findByProps("getUser", "getCurrentUser");
        if (!MS || !channelId) return "";
        var msgs = MS.getMessages(channelId);
        if (!msgs) return "";
        var arr = msgs._array || (msgs.toArray ? msgs.toArray() : []);
        return arr.slice(-10).map(function(m) {
            var name = (US && US.getUser(m.author && m.author.id) || {}).username
                    || (m.author && m.author.username) || "?";
            return name + ": " + m.content;
        }).filter(Boolean).join("\n");
    } catch(e) { return ""; }
}

// ── Запрос к API ───────────────────────────────────────────────
async function askAI(query, channelId) {
    if (!storage.apiKey) throw new Error("API ключ не задан — открой настройки плагина");

    var ctx = getContext(channelId);
    var system = storage.sysPrompt +
        (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");

    var messages = [{ role: "system", content: system }];
    chatHistory.slice(-10).forEach(function(m) { messages.push(m); });
    messages.push({ role: "user", content: query });

    var res = await fetch("https://api.onlysq.ru/ai/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + storage.apiKey
        },
        body: JSON.stringify({ model: storage.model, messages: messages, max_tokens: 1024 })
    });

    if (!res.ok) throw new Error("API " + res.status + ": " + await res.text());
    var data = await res.json();
    return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim() || "(пустой ответ)";
}

// ── Диалог ─────────────────────────────────────────────────────
function openChat(channelId, prefill) {
    activeChan = channelId;
    var RNAlert = findByProps("prompt", "alert");

    function buildHistory() {
        return chatHistory.slice(-6).map(function(m) {
            return (m.role === "user" ? "👤 Ты" : "🤖 ИИ") + ": " + m.content;
        }).join("\n\n");
    }

    async function send(input) {
        if (!input || !input.trim()) return;
        showToast("⏳ Думаю...");
        try {
            var answer = await askAI(input.trim(), activeChan);
            chatHistory.push({ role: "user", content: input.trim() });
            chatHistory.push({ role: "assistant", content: answer });
            showConfirmationAlert({
                title: "🤖 AI Chat",
                content: buildHistory(),
                confirmText: "Продолжить",
                cancelText: "Закрыть",
                onConfirm: function() { prompt(""); }
            });
        } catch(e) {
            showToast("❌ " + e.message);
        }
    }

    function prompt(defaultVal) {
        if (RNAlert && RNAlert.prompt) {
            RNAlert.prompt(
                "🤖 AI Chat",
                buildHistory() || "Введи запрос:",
                [
                    { text: "Закрыть", style: "cancel" },
                    { text: "Отправить", onPress: function(v) { send(v); } }
                ],
                "plain-text",
                defaultVal || ""
            );
        } else {
            showConfirmationAlert({
                title: "🤖 AI Chat",
                content: buildHistory() || "Используй кнопку 🤖 в меню сообщения (долгое нажатие).",
                confirmText: "OK",
                cancelText: "Закрыть"
            });
        }
    }

    prompt(prefill || "");
}

// ── Патч: кнопка 🤖 в панели ввода ────────────────────────────
function patchInputBar() {
    var React = findByProps("createElement", "useState");
    var RN    = findByProps("TouchableOpacity", "Text");
    if (!React || !RN) return;

    var targets = [
        "ChatInputBarButtons",
        "ApplicationCommandsBar",
        "ChatInput"
    ];

    for (var i = 0; i < targets.length; i++) {
        var mod = findByDisplayName(targets[i]) ||
                  (findByProps(targets[i]) && findByProps(targets[i])[targets[i]]);
        if (!mod) continue;

        (function(component) {
            patches.push(after("default", component, function(args, ret) {
                if (!ret || !ret.props) return ret;
                var channelId = (args && args[0] && args[0].channelId) || activeChan;
                if (!channelId) return ret;

                var btn = React.createElement(
                    RN.TouchableOpacity,
                    {
                        onPress: function() { openChat(channelId); },
                        style: { marginHorizontal: 6, justifyContent: "center", alignItems: "center" }
                    },
                    React.createElement(RN.Text, { style: { fontSize: 22 } }, "🤖")
                );

                var ch = ret.props.children;
                if (Array.isArray(ch)) {
                    ch.unshift(btn);
                } else {
                    ret.props.children = ch ? [btn, ch] : btn;
                }
                return ret;
            }));
        })(mod);
        break;
    }
}

// ── Патч: пункт в меню сообщения ───────────────────────────────
function patchMessageMenu() {
    var React = findByProps("createElement", "useState");
    var Forms = findByProps("FormRow");
    if (!React || !Forms) return;

    var LongPress = findByDisplayName("MessageLongPressActionSheet") ||
                    (findByProps("MessageLongPressActionSheet") &&
                     findByProps("MessageLongPressActionSheet").MessageLongPressActionSheet);
    if (!LongPress) return;

    patches.push(after("default", LongPress, function(args, ret) {
        if (!ret || !ret.props) return ret;
        var msg = args && args[0] && args[0].message;
        if (!msg) return ret;

        var row = React.createElement(Forms.FormRow, {
            label: "🤖 Спросить AI",
            onPress: function() {
                openChat(msg.channel_id, "Переведи или объясни: \"" + msg.content + "\"");
            }
        });

        var ch = ret.props.children;
        if (Array.isArray(ch)) ch.unshift(row);
        return ret;
    }));
}

// ── Настройки ──────────────────────────────────────────────────
function Settings() {
    var React        = findByProps("createElement", "useState");
    var { useState } = React;
    var Forms  = findByProps("FormSection", "FormRow", "FormInput");
    var RN     = findByProps("ScrollView", "Text");
    var RNAlert = findByProps("prompt", "alert");

    var [apiKey, setApiKey]   = useState(storage.apiKey || "");
    var [model,  setModel]    = useState(storage.model  || "gpt-4o-mini");
    var [sysp,   setSysp]     = useState(storage.sysPrompt || "");

    function save() {
        storage.apiKey    = apiKey;
        storage.model     = model;
        storage.sysPrompt = sysp;
        showToast("✅ Сохранено");
    }

    function pickModel() {
        if (!RNAlert || !RNAlert.alert) return;
        RNAlert.alert("Выбери модель", "",
            MODELS.map(function(m) {
                return { text: m, onPress: function() { setModel(m); storage.model = m; } };
            }).concat([{ text: "Отмена", style: "cancel" }])
        );
    }

    async function testApi() {
        showToast("⏳ Тест...");
        try {
            var ans = await askAI("Ответь одним словом: работаешь?", null);
            showToast("✅ ИИ: " + ans);
        } catch(e) {
            showToast("❌ " + e.message);
        }
    }

    if (!Forms || !RN) {
        return React.createElement(RN.Text, null, "Ошибка загрузки компонентов");
    }

    return React.createElement(RN.ScrollView, { style: { flex: 1 } },

        React.createElement(Forms.FormSection, { title: "API" },
            React.createElement(Forms.FormInput, {
                title: "API Key (onlysq.ru)",
                placeholder: "Вставь ключ...",
                value: apiKey,
                onChange: setApiKey,
                secureTextEntry: true
            }),
            React.createElement(Forms.FormRow, {
                label: "Модель",
                subLabel: model,
                trailing: Forms.FormRow.Arrow,
                onPress: pickModel
            })
        ),

        React.createElement(Forms.FormSection, { title: "Системный промпт" },
            React.createElement(Forms.FormInput, {
                title: "Промпт",
                value: sysp,
                onChange: setSysp,
                multiline: true
            })
        ),

        React.createElement(Forms.FormSection, { title: "Действия" },
            React.createElement(Forms.FormRow, {
                label: "💾 Сохранить",
                onPress: save
            }),
            React.createElement(Forms.FormRow, {
                label: "🧪 Тест API",
                onPress: testApi
            }),
            React.createElement(Forms.FormRow, {
                label: "🗑️ Очистить историю диалога",
                onPress: function() { chatHistory = []; showToast("История очищена"); }
            })
        )
    );
}

// ── Export ─────────────────────────────────────────────────────
module.exports = {
    onLoad: function() {
        try { patchInputBar(); }    catch(e) { console.error("[AIChat] patchInputBar:", e); }
        try { patchMessageMenu(); } catch(e) { console.error("[AIChat] patchMessageMenu:", e); }
    },
    onUnload: function() {
        patches.forEach(function(u) { try { u(); } catch(e) {} });
        patches = [];
    },
    settings: Settings
};
