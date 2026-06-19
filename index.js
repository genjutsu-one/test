"use strict";

// AI Chat Translator — Vendetta/Bunny plugin
// Fixes: named Settings component, correct message menu patch

const { findByProps, findByDisplayName, findByName } = vendetta.metro;
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

var patches     = [];
var chatHistory = [];
var activeChan  = null;

// ── Контекст ──────────────────────────────────────────────────
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

// ── API ───────────────────────────────────────────────────────
async function askAI(query, channelId) {
    if (!storage.apiKey) throw new Error("API ключ не задан — открой настройки плагина (⚙️)");
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

// ── Диалог ────────────────────────────────────────────────────
function openChat(channelId, prefill) {
    activeChan = channelId;
    var RNAlert = findByProps("prompt", "alert");

    function buildHistory() {
        return chatHistory.slice(-6).map(function(m) {
            return (m.role === "user" ? "👤" : "🤖") + " " + m.content;
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

    function doPrompt(def) {
        if (RNAlert && RNAlert.prompt) {
            RNAlert.prompt(
                "🤖 AI Chat",
                buildHistory() || "Введи запрос (перевод, объяснение...)",
                [
                    { text: "Закрыть", style: "cancel" },
                    { text: "Отправить", onPress: function(v) { send(v); } }
                ],
                "plain-text",
                def || ""
            );
        } else {
            showConfirmationAlert({
                title: "🤖 AI Chat",
                content: "Зажми любое сообщение → 🤖 Спросить AI",
                confirmText: "OK",
                cancelText: "Закрыть"
            });
        }
    }

    doPrompt(prefill || "");
}

// ── Патч меню сообщений ────────────────────────────────────────
// Bunny использует key-based ActionSheet систему
function patchMessageMenu() {
    var React = findByProps("createElement", "useState");
    if (!React) return;

    // Ищем ActionSheet через несколько путей
    var ActionSheetRow = (findByProps("ActionSheetRow") || {}).ActionSheetRow
                      || (findByProps("TableRow") || {}).TableRow;

    // Патчим MessageActionSheet через messages module
    var messageActionSheetModule = findByProps("MessageActionSheet")
                                || findByName("MessageActionSheet")
                                || findByDisplayName("MessageActionSheet");

    if (!messageActionSheetModule) {
        // fallback: ищем через useMessageLongPressContext
        var contextModule = findByProps("useMessageLongPressContext");
        if (contextModule) {
            patches.push(after("useMessageLongPressContext", contextModule, function(args, ret) {
                if (!ret) return ret;
                var orig = ret.onPress;
                return ret;
            }));
        }
        return;
    }

    var target = messageActionSheetModule.MessageActionSheet || messageActionSheetModule.default || messageActionSheetModule;

    patches.push(after("default", target, function(args, ret) {
        if (!ret || !ret.props) return ret;
        var msg = args && args[0] && (args[0].message || args[0].msg);
        if (!msg) return ret;

        var row = React.createElement(
            ActionSheetRow || "View",
            {
                label: "🤖 Спросить AI",
                onPress: function() {
                    openChat(msg.channel_id, "Переведи или объясни: \"" + msg.content.slice(0, 200) + "\"");
                }
            }
        );

        try {
            var ch = ret.props.children;
            if (Array.isArray(ch)) ch.unshift(row);
            else if (ch && ch.props && Array.isArray(ch.props.children)) ch.props.children.unshift(row);
        } catch(e) {}

        return ret;
    }));
}

// ── Настройки (ИМЕНОВАННАЯ функция — обязательно для Bunny!) ──
function SettingsPage() {
    var React   = findByProps("createElement", "useState");
    var RN      = findByProps("ScrollView", "TextInput", "Text", "View", "TouchableOpacity");
    var RNAlert = findByProps("prompt", "alert");

    if (!React || !RN) return null;

    var useState = React.useState;
    var apiKeyState  = useState(storage.apiKey    || "");
    var modelState   = useState(storage.model     || "gpt-4o-mini");
    var sysState     = useState(storage.sysPrompt || "");

    var apiKey  = apiKeyState[0];  var setApiKey  = apiKeyState[1];
    var model   = modelState[0];   var setModel   = modelState[1];
    var sysp    = sysState[0];     var setSysp    = sysState[1];

    var R = React;
    var c = {
        page:    { flex: 1, backgroundColor: "#1e1f22" },
        section: { color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5,
                   marginLeft: 16, marginTop: 20, marginBottom: 6, textTransform: "uppercase" },
        input:   { color: "#dbdee1", backgroundColor: "#2b2d31", borderRadius: 8,
                   padding: 12, marginHorizontal: 16, marginBottom: 4, fontSize: 15 },
        btn:     { backgroundColor: "#5865f2", borderRadius: 8, padding: 14,
                   marginHorizontal: 16, marginBottom: 8, alignItems: "center" },
        btnRed:  { backgroundColor: "#ed4245", borderRadius: 8, padding: 14,
                   marginHorizontal: 16, marginBottom: 8, alignItems: "center" },
        btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
        modelRow:{ backgroundColor: "#2b2d31", borderRadius: 8, padding: 14,
                   marginHorizontal: 16, marginBottom: 4, flexDirection: "row", justifyContent: "space-between" },
        label:   { color: "#dbdee1", fontSize: 15 },
        value:   { color: "#00b0f4", fontSize: 15 }
    };

    function save() {
        storage.apiKey    = apiKey;
        storage.model     = model;
        storage.sysPrompt = sysp;
        showToast("✅ Настройки сохранены");
    }

    function pickModel() {
        if (!RNAlert || !RNAlert.alert) return;
        RNAlert.alert("Выбери модель", "",
            MODELS.map(function(m) {
                return { text: (m === model ? "✓ " : "") + m, onPress: function() { setModel(m); storage.model = m; } };
            }).concat([{ text: "Отмена", style: "cancel" }])
        );
    }

    async function testApi() {
        showToast("⏳ Тестирую...");
        try {
            var ans = await askAI("Ответь одним словом: работаешь?", null);
            showToast("✅ ИИ ответил: " + ans);
        } catch(e) { showToast("❌ " + e.message); }
    }

    return R.createElement(RN.ScrollView, { style: c.page },

        R.createElement(RN.Text, { style: c.section }, "API KEY"),
        R.createElement(RN.TextInput, {
            style: c.input,
            placeholder: "Вставь ключ от onlysq.ru...",
            placeholderTextColor: "#4e5058",
            value: apiKey,
            onChangeText: setApiKey,
            secureTextEntry: true
        }),

        R.createElement(RN.Text, { style: c.section }, "Модель"),
        R.createElement(RN.TouchableOpacity, { style: c.modelRow, onPress: pickModel },
            R.createElement(RN.Text, { style: c.label }, "Текущая:"),
            R.createElement(RN.Text, { style: c.value }, model + " ›")
        ),

        R.createElement(RN.Text, { style: c.section }, "Системный промпт"),
        R.createElement(RN.TextInput, {
            style: [c.input, { minHeight: 100, textAlignVertical: "top" }],
            placeholder: "Роль и поведение ИИ...",
            placeholderTextColor: "#4e5058",
            value: sysp,
            onChangeText: setSysp,
            multiline: true
        }),

        R.createElement(RN.Text, { style: c.section }, "Действия"),

        R.createElement(RN.TouchableOpacity, { style: c.btn, onPress: save },
            R.createElement(RN.Text, { style: c.btnText }, "💾  Сохранить настройки")
        ),

        R.createElement(RN.TouchableOpacity, { style: c.btn, onPress: testApi },
            R.createElement(RN.Text, { style: c.btnText }, "🧪  Тест API")
        ),

        R.createElement(RN.TouchableOpacity, { style: c.btn, onPress: function() { openChat(null); } },
            R.createElement(RN.Text, { style: c.btnText }, "🤖  Открыть AI чат")
        ),

        R.createElement(RN.TouchableOpacity, { style: c.btnRed, onPress: function() { chatHistory = []; showToast("🗑️ История очищена"); } },
            R.createElement(RN.Text, { style: c.btnText }, "🗑️  Очистить историю")
        ),

        // Отступ снизу
        R.createElement(RN.View, { style: { height: 40 } })
    );
}

// ── Export ────────────────────────────────────────────────────
module.exports = {
    onLoad: function() {
        try { patchMessageMenu(); } catch(e) { console.error("[AIChat] patchMessageMenu:", e); }
    },
    onUnload: function() {
        patches.forEach(function(u) { try { u(); } catch(e) {} });
        patches = [];
    },
    settings: SettingsPage   // именованная функция = гаечный ключ активен
};
