"use strict";

const { findByProps, findByDisplayName } = vendetta.metro;
const { after } = vendetta.patcher;
const { showToast } = vendetta.ui.toasts;
const { showConfirmationAlert } = vendetta.ui.alerts;
const storage = vendetta.plugin.storage;

if (!storage.apiKey)    storage.apiKey    = "";
if (!storage.model)     storage.model     = "gpt-4o-mini";
if (!storage.sysPrompt) storage.sysPrompt =
    "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
    "Используй его чтобы понимать тему. Отвечай кратко и точно.";

const MODELS = ["gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "gpt-4o"];

let patches     = [];
let chatHistory = [];
let activeChan  = null;

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

async function askAI(query, channelId) {
    if (!storage.apiKey) throw new Error("API ключ не задан — открой настройки плагина");
    var ctx = getContext(channelId);
    var system = storage.sysPrompt + (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");
    var messages = [{ role: "system", content: system }];
    chatHistory.slice(-10).forEach(function(m) { messages.push(m); });
    messages.push({ role: "user", content: query });
    var res = await fetch("https://api.onlysq.ru/ai/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + storage.apiKey },
        body: JSON.stringify({ model: storage.model, messages: messages, max_tokens: 1024 })
    });
    if (!res.ok) throw new Error("API " + res.status + ": " + await res.text());
    var data = await res.json();
    return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim() || "(пустой ответ)";
}

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
                onConfirm: function() { doPrompt(""); }
            });
        } catch(e) {
            showToast("❌ " + e.message);
        }
    }

    function doPrompt(defaultVal) {
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
                content: "Зажми сообщение → 🤖 Спросить AI",
                confirmText: "OK",
                cancelText: "Закрыть"
            });
        }
    }

    doPrompt(prefill || "");
}

function patchMessageMenu() {
    var React = findByProps("createElement", "useState");
    var FormRow = findByProps("FormRow") && findByProps("FormRow").FormRow;
    if (!React || !FormRow) return;

    var LongPress = findByDisplayName("MessageLongPressActionSheet");
    if (!LongPress) {
        var lp = findByProps("MessageLongPressActionSheet");
        if (lp) LongPress = lp.MessageLongPressActionSheet;
    }
    if (!LongPress) return;

    patches.push(after("default", LongPress, function(args, ret) {
        if (!ret || !ret.props) return ret;
        var msg = args && args[0] && args[0].message;
        if (!msg) return ret;
        var row = React.createElement(FormRow, {
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

function Settings() {
    var React = findByProps("createElement", "useState");
    var useState = React.useState;

    // ищем каждый компонент отдельно
    var ScrollView = findByProps("ScrollView") && findByProps("ScrollView").ScrollView;
    var FormSection = findByProps("FormSection") && findByProps("FormSection").FormSection;
    var FormRow = findByProps("FormRow") && findByProps("FormRow").FormRow;
    var TextInput = findByProps("TextInput") && findByProps("TextInput").TextInput;
    var Text = findByProps("Text") && findByProps("Text").Text;
    var View = findByProps("View") && findByProps("View").View;
    var RNAlert = findByProps("prompt", "alert");

    var s = { apiKey: useState(storage.apiKey || ""), model: useState(storage.model || "gpt-4o-mini"), sysp: useState(storage.sysPrompt || "") };
    var apiKey = s.apiKey[0]; var setApiKey = s.apiKey[1];
    var model  = s.model[0];  var setModel  = s.model[1];
    var sysp   = s.sysp[0];   var setSysp   = s.sysp[1];

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
        } catch(e) { showToast("❌ " + e.message); }
    }

    var R = React;
    var inputStyle = { color: "#fff", backgroundColor: "#1e1f22", borderRadius: 8, padding: 10, marginVertical: 6, marginHorizontal: 16 };
    var btnStyle   = { backgroundColor: "#5865f2", borderRadius: 8, padding: 12, marginVertical: 4, marginHorizontal: 16, alignItems: "center" };
    var btnRed     = { backgroundColor: "#ed4245", borderRadius: 8, padding: 12, marginVertical: 4, marginHorizontal: 16, alignItems: "center" };
    var labelStyle = { color: "#fff", fontWeight: "bold", fontSize: 15 };
    var sectionStyle = { color: "#b5bac1", fontSize: 12, marginLeft: 16, marginTop: 16, marginBottom: 4, textTransform: "uppercase" };

    if (!ScrollView || !Text || !TextInput || !View) {
        // абсолютный fallback если ничего не нашлось
        return R.createElement(Text || "Text", null, "Ошибка: компоненты не найдены");
    }

    return R.createElement(ScrollView, { style: { flex: 1 } },

        R.createElement(Text, { style: sectionStyle }, "API KEY"),
        R.createElement(TextInput, {
            style: inputStyle,
            placeholder: "Вставь ключ от onlysq.ru...",
            placeholderTextColor: "#888",
            value: apiKey,
            onChangeText: setApiKey,
            secureTextEntry: true
        }),

        R.createElement(Text, { style: sectionStyle }, "МОДЕЛЬ: " + model),
        R.createElement(View, { style: { marginHorizontal: 16, marginVertical: 4 } },
            R.createElement(Text, {
                style: { color: "#00b0f4", fontSize: 15, padding: 10 },
                onPress: pickModel
            }, "Нажми чтобы выбрать модель ›")
        ),

        R.createElement(Text, { style: sectionStyle }, "СИСТЕМНЫЙ ПРОМПТ"),
        R.createElement(TextInput, {
            style: Object.assign({}, inputStyle, { minHeight: 80 }),
            placeholder: "Роль ИИ...",
            placeholderTextColor: "#888",
            value: sysp,
            onChangeText: setSysp,
            multiline: true
        }),

        R.createElement(Text, { style: sectionStyle }, "ДЕЙСТВИЯ"),

        R.createElement(View, { style: btnStyle, onTouchEnd: save },
            R.createElement(Text, { style: labelStyle }, "💾 Сохранить")
        ),

        R.createElement(View, { style: btnStyle, onTouchEnd: testApi },
            R.createElement(Text, { style: labelStyle }, "🧪 Тест API")
        ),

        R.createElement(View, { style: btnRed, onTouchEnd: function() { chatHistory = []; showToast("История очищена"); } },
            R.createElement(Text, { style: labelStyle }, "🗑️ Очистить историю")
        )
    );
}

module.exports = {
    onLoad: function() {
        try { patchMessageMenu(); } catch(e) { console.error("[AIChat] patch:", e); }
    },
    onUnload: function() {
        patches.forEach(function(u) { try { u(); } catch(e) {} });
        patches = [];
    },
    settings: Settings
};
