/// <reference types="vendetta-types" />
"use strict";

// ──────────────────────────────────────────────────────────────
//  AI Chat Translator — Vendetta/Bunny plugin (no build needed)
//  API: https://api.onlysq.ru/ai/openai  (OpenAI-совместимый)
// ──────────────────────────────────────────────────────────────

const { findByProps, findByDisplayName } = vendetta.metro;
const { after } = vendetta.patcher;
const { showToast } = vendetta.ui.toasts;
const { showConfirmationAlert } = vendetta.ui.alerts;
const storage = vendetta.plugin.storage;

// Дефолты
if (!storage.apiKey)     storage.apiKey     = "";
if (!storage.model)      storage.model      = "gpt-4o-mini";
if (!storage.sysPrompt)  storage.sysPrompt  =
    "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
    "Используй его чтобы понимать тему. Отвечай кратко и точно на языке пользователя.";

const MODELS = ["gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "gpt-4o"];

let patches      = [];
let chatHistory  = [];          // история текущей сессии
let activeChanId = null;

// ──────────────────────────────────────────────────────────────
//  Утилита: последние N сообщений канала
// ──────────────────────────────────────────────────────────────
function getContext(channelId, limit) {
    limit = limit || 10;
    try {
        var MS = findByProps("getMessages");
        var US = findByProps("getUser", "getCurrentUser");
        if (!MS || !channelId) return "";
        var msgs = MS.getMessages(channelId);
        if (!msgs) return "";
        var arr = msgs._array || msgs.toArray?.() || [];
        return arr.slice(-limit).map(function(m) {
            var name = US?.getUser(m.author?.id)?.username || m.author?.username || "?";
            return name + ": " + m.content;
        }).filter(Boolean).join("\n");
    } catch(e) { return ""; }
}

// ──────────────────────────────────────────────────────────────
//  Запрос к API
// ──────────────────────────────────────────────────────────────
async function askAI(query, channelId) {
    if (!storage.apiKey) throw new Error("API ключ не задан — открой настройки плагина");

    var ctx = getContext(channelId);
    var system = storage.sysPrompt +
        (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");

    var messages = [{ role: "system", content: system }];
    // добавляем историю диалога (последние 6 пар)
    chatHistory.slice(-12).forEach(function(m) { messages.push(m); });
    messages.push({ role: "user", content: query });

    var res = await fetch("https://api.onlysq.ru/ai/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + storage.apiKey
        },
        body: JSON.stringify({
            model: storage.model,
            messages: messages,
            max_tokens: 1024
        })
    });

    if (!res.ok) throw new Error("API " + res.status + ": " + await res.text());
    var data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim() || "(пустой ответ)";
}

// ──────────────────────────────────────────────────────────────
//  Диалог: отправить → показать ответ → продолжить
// ──────────────────────────────────────────────────────────────
function openChat(channelId, prefill) {
    activeChanId = channelId;
    var RNAlert = findByProps("prompt");

    function prompt(defaultVal) {
        var histStr = chatHistory.slice(-6).map(function(m) {
            return (m.role === "user" ? "👤 Ты" : "🤖 ИИ") + ": " + m.content;
        }).join("\n\n");

        if (RNAlert?.prompt) {
            // iOS / некоторые Android сборки
            RNAlert.prompt(
                "🤖 AI Chat",
                histStr || "Введи запрос:",
                [
                    { text: "Закрыть", style: "cancel" },
                    {
                        text: "Отправить",
                        onPress: function(input) {
                            if (!input?.trim()) return;
                            send(input.trim());
                        }
                    }
                ],
                "plain-text",
                defaultVal || ""
            );
        } else {
            // Fallback: showConfirmationAlert (без инпута — просто показывает историю)
            showConfirmationAlert({
                title: "🤖 AI Chat",
                content: histStr || "Открой чат и используй /ai <запрос> или кнопку в меню сообщения.",
                confirmText: "ОК",
                cancelText: "Закрыть",
            });
        }
    }

    async function send(input) {
        showToast("⏳ Думаю...");
        try {
            var answer = await askAI(input, activeChanId);
            chatHistory.push({ role: "user", content: input });
            chatHistory.push({ role: "assistant", content: answer });
            // Показываем ответ и даём продолжить
            showConfirmationAlert({
                title: "🤖 AI Chat",
                content: chatHistory.slice(-6).map(function(m) {
                    return (m.role === "user" ? "👤 Ты" : "🤖 ИИ") + ": " + m.content;
                }).join("\n\n"),
                confirmText: "Продолжить",
                cancelText: "Закрыть",
                onConfirm: function() { prompt(""); },
            });
        } catch(e) {
            showToast("❌ " + e.message);
        }
    }

    prompt(prefill || "");
}

// ──────────────────────────────────────────────────────────────
//  Патч: кнопка 🤖 в панели ввода сообщения
// ──────────────────────────────────────────────────────────────
function patchInputBar() {
    var InputBar = findByDisplayName("ChatInputBarButtons") ||
                   findByProps("ChatInputBarButtons")?.ChatInputBarButtons;
    if (!InputBar) return;

    var React = findByProps("createElement");
    var { TouchableOpacity, Text } = findByProps("TouchableOpacity") || {};
    if (!React || !TouchableOpacity) return;

    patches.push(after("default", InputBar, function(args, ret) {
        var channelId = args?.[0]?.channelId;
        if (!channelId || !ret) return ret;

        var btn = React.createElement(
            TouchableOpacity,
            {
                onPress: function() { openChat(channelId); },
                style: { marginHorizontal: 4, justifyContent: "center", alignItems: "center" }
            },
            React.createElement(Text, { style: { fontSize: 22 } }, "🤖")
        );

        var children = ret.props?.children;
        if (Array.isArray(children)) {
            children.unshift(btn);
        } else if (children) {
            ret.props.children = [btn, children];
        }
        return ret;
    }));
}

// ──────────────────────────────────────────────────────────────
//  Патч: пункт «🤖 Спросить AI» при долгом нажатии на сообщение
// ──────────────────────────────────────────────────────────────
function patchMessageMenu() {
    var LongPress = findByDisplayName("MessageLongPressActionSheet") ||
                    findByProps("MessageLongPressActionSheet")?.MessageLongPressActionSheet;
    if (!LongPress) return;

    var React = findByProps("createElement");
    var { FormRow } = findByProps("FormRow") || {};
    if (!React || !FormRow) return;

    patches.push(after("default", LongPress, function(args, ret) {
        var msg = args?.[0]?.message;
        if (!msg || !ret?.props) return ret;

        var row = React.createElement(FormRow, {
            label: "🤖 Спросить AI",
            onPress: function() {
                openChat(msg.channel_id, "Переведи или объясни: \"" + msg.content + "\"");
            }
        });

        var children = ret.props.children;
        if (Array.isArray(children)) children.unshift(row);
        return ret;
    }));
}

// ──────────────────────────────────────────────────────────────
//  Страница настроек
// ──────────────────────────────────────────────────────────────
function Settings() {
    var React        = findByProps("createElement", "useState");
    var { useState } = React;
    var { ScrollView, View, Text, TextInput, TouchableOpacity } =
        findByProps("ScrollView", "TextInput") || {};
    var { FormSection, FormInput, FormRow } = findByProps("FormSection", "FormRow") || {};

    var [apiKey, setApiKey]     = useState(storage.apiKey);
    var [model, setModel]       = useState(storage.model);
    var [prompt, setPrompt]     = useState(storage.sysPrompt);
    var [saved, setSaved]       = useState(false);

    function save() {
        storage.apiKey    = apiKey;
        storage.model     = model;
        storage.sysPrompt = prompt;
        setSaved(true);
        showToast("✅ Сохранено");
        setTimeout(function() { setSaved(false); }, 2000);
    }

    function pickModel() {
        var RNAlert = findByProps("alert");
        if (!RNAlert) return;
        RNAlert.alert("Выбери модель", "", MODELS.map(function(m) {
            return { text: m, onPress: function() { setModel(m); storage.model = m; } };
        }).concat([{ text: "Отмена", style: "cancel" }]));
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

    return React.createElement(ScrollView, { style: { flex: 1 } },

        React.createElement(FormSection, { title: "API настройки" },

            React.createElement(FormInput, {
                title: "API Key",
                placeholder: "Вставь ключ от onlysq.ru...",
                value: apiKey,
                onChange: setApiKey,
                secureTextEntry: true,
            }),

            React.createElement(FormRow, {
                label: "Модель: " + model,
                trailing: "›",
                onPress: pickModel,
            })
        ),

        React.createElement(FormSection, { title: "Системный промпт" },
            React.createElement(FormInput, {
                title: "Промпт",
                value: prompt,
                onChange: setPrompt,
                multiline: true,
            })
        ),

        React.createElement(FormSection, { title: "Действия" },

            React.createElement(FormRow, {
                label: saved ? "✅ Сохранено!" : "💾 Сохранить настройки",
                onPress: save,
            }),

            React.createElement(FormRow, {
                label: "🧪 Тест API",
                onPress: testApi,
            }),

            React.createElement(FormRow, {
                label: "🗑️ Очистить историю чата",
                onPress: function() {
                    chatHistory = [];
                    showToast("История очищена");
                },
            })
        )
    );
}

// ──────────────────────────────────────────────────────────────
//  Export
// ──────────────────────────────────────────────────────────────
export default {
    onLoad: function() {
        patchInputBar();
        patchMessageMenu();
    },
    onUnload: function() {
        patches.forEach(function(u) { try { u(); } catch(e) {} });
        patches = [];
    },
    settings: Settings,
};

