"use strict";

// AI Chat Translator — Vendetta/Bunny plugin
// Архитектура: вся работа происходит на странице настроек (⚙️/Configure),
// т.к. Alert.prompt не поддерживается на Android, а ActionSheet-меню
// слишком часто ломается между версиями Discord.

var metro     = vendetta.metro;
var findByProps = metro.findByProps;
var patcher   = vendetta.patcher;
var after     = patcher.after;
var showToast = vendetta.ui.toasts.showToast;
var storage   = vendetta.plugin.storage;

// Официальный, документированный путь к UI-компонентам Vendetta/Bunny
var components = vendetta.ui.components || {};
var General = components.General || {};
var Forms   = components.Forms || {};

if (!storage.apiKey)    storage.apiKey    = "";
if (!storage.model)     storage.model     = "gpt-4o-mini";
if (!storage.sysPrompt) storage.sysPrompt =
    "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
    "Используй его чтобы понимать тему. Отвечай кратко и точно.";

var MODELS = ["gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "gpt-4o"];

var patches = [];

// ── Текущий канал ────────────────────────────────────────────
function getCurrentChannelId() {
    try {
        var mod = findByProps("getChannelId");
        return mod && mod.getChannelId();
    } catch(e) { return null; }
}

// ── Контекст последних сообщений ────────────────────────────
function getContext(channelId) {
    try {
        var MS = findByProps("getMessages");
        var US = findByProps("getUser", "getCurrentUser");
        if (!MS || !channelId) return "";
        var msgs = MS.getMessages(channelId);
        if (!msgs) return "";
        var arr = msgs._array || (msgs.toArray ? msgs.toArray() : []);
        return arr.slice(-10).map(function(m) {
            var author = m.author || {};
            var name = (US && US.getUser(author.id) || {}).username || author.username || "?";
            return name + ": " + m.content;
        }).filter(Boolean).join("\n");
    } catch(e) { return ""; }
}

// ── Запрос к API ──────────────────────────────────────────────
async function askAI(query, channelId, history) {
    if (!storage.apiKey) throw new Error("API ключ не задан");
    var ctx = getContext(channelId);
    var system = storage.sysPrompt + (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");
    var messages = [{ role: "system", content: system }];
    (history || []).slice(-10).forEach(function(m) { messages.push({ role: m.role, content: m.content }); });
    messages.push({ role: "user", content: query });

    var res = await fetch("https://api.onlysq.ru/ai/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + storage.apiKey },
        body: JSON.stringify({ model: storage.model, messages: messages, max_tokens: 1024 })
    });

    if (!res.ok) {
        var errText = await res.text();
        throw new Error("API " + res.status + ": " + errText.slice(0, 200));
    }
    var data = await res.json();
    var choice = data.choices && data.choices[0];
    var content = choice && choice.message && choice.message.content;
    return (content || "").trim() || "(пустой ответ)";
}

// ── Страница настроек / чат (именованная функция — обязательна) ─
function SettingsPage() {
    var React = findByProps("createElement", "useState");
    if (!React || !React.useState) {
        return React ? React.createElement("Text", null, "Ошибка: React не найден") : null;
    }
    var useState = React.useState;
    var useRef   = React.useRef;

    var Text         = General.Text;
    var View         = General.View;
    var ScrollView   = General.ScrollView;
    var TextInput    = General.TextInput;
    var Pressable    = General.Pressable || General.TouchableOpacity;

    if (!Text || !View || !ScrollView || !TextInput || !Pressable) {
        return React.createElement(
            Text || "Text",
            { style: { color: "red", padding: 16 } },
            "Ошибка: не найдены UI-компоненты vendetta.ui.components.General. " +
            "Доступно: " + Object.keys(General).join(", ")
        );
    }

    var apiKeyState = useState(storage.apiKey || "");
    var modelState  = useState(storage.model || "gpt-4o-mini");
    var sysState    = useState(storage.sysPrompt || "");
    var inputState  = useState("");
    var historyState= useState([]);
    var loadingState= useState(false);
    var tabState    = useState("chat"); // chat | settings

    var apiKey = apiKeyState[0], setApiKey = apiKeyState[1];
    var model  = modelState[0],  setModel  = modelState[1];
    var sysp   = sysState[0],    setSysp   = sysState[1];
    var input  = inputState[0],  setInput  = inputState[1];
    var history= historyState[0],setHistory= historyState[1];
    var loading= loadingState[0],setLoading= loadingState[1];
    var tab    = tabState[0],    setTab    = tabState[1];

    var R = React;
    var c = {
        page:    { flex: 1, backgroundColor: "#1e1f22" },
        tabs:    { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
        tabBtn:  { flex: 1, padding: 10, alignItems: "center", borderRadius: 8, marginHorizontal: 4 },
        tabBtnOn:{ backgroundColor: "#5865f2" },
        tabBtnOff:{ backgroundColor: "#2b2d31" },
        tabText: { color: "#fff", fontWeight: "700" },
        chatArea:{ flex: 1, paddingHorizontal: 12 },
        bubbleUser: { backgroundColor: "#5865f2", borderRadius: 10, padding: 10, marginVertical: 4, alignSelf: "flex-end", maxWidth: "85%" },
        bubbleAi:   { backgroundColor: "#2b2d31", borderRadius: 10, padding: 10, marginVertical: 4, alignSelf: "flex-start", maxWidth: "85%" },
        bubbleText: { color: "#dbdee1", fontSize: 14 },
        inputRow:{ flexDirection: "row", padding: 12, alignItems: "center" },
        input:   { flex: 1, color: "#dbdee1", backgroundColor: "#2b2d31", borderRadius: 8, padding: 10, marginRight: 8, fontSize: 14, maxHeight: 100 },
        sendBtn: { backgroundColor: "#5865f2", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
        sendText:{ color: "#fff", fontWeight: "700" },
        section: { color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5,
                   marginLeft: 16, marginTop: 20, marginBottom: 6, textTransform: "uppercase" },
        settingsInput: { color: "#dbdee1", backgroundColor: "#2b2d31", borderRadius: 8,
                   padding: 12, marginHorizontal: 16, marginBottom: 4, fontSize: 15 },
        modelRow:{ backgroundColor: "#2b2d31", borderRadius: 8, padding: 14,
                   marginHorizontal: 16, marginBottom: 4, flexDirection: "row", justifyContent: "space-between" },
        label:   { color: "#dbdee1", fontSize: 15 },
        value:   { color: "#00b0f4", fontSize: 15 },
        btn:     { backgroundColor: "#5865f2", borderRadius: 8, padding: 14,
                   marginHorizontal: 16, marginTop: 16, alignItems: "center" },
        btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
        empty:   { color: "#80848e", textAlign: "center", marginTop: 40, fontSize: 14 }
    };

    async function send() {
        var q = (input || "").trim();
        if (!q || loading) return;
        setInput("");
        setLoading(true);
        var newHistUser = history.concat([{ role: "user", content: q }]);
        setHistory(newHistUser);
        try {
            var channelId = getCurrentChannelId();
            var answer = await askAI(q, channelId, history);
            setHistory(newHistUser.concat([{ role: "assistant", content: answer }]));
        } catch(e) {
            setHistory(newHistUser.concat([{ role: "assistant", content: "❌ " + e.message }]));
        } finally {
            setLoading(false);
        }
    }

    function save() {
        storage.apiKey    = apiKey;
        storage.model     = model;
        storage.sysPrompt = sysp;
        showToast("✅ Настройки сохранены");
        setTab("chat");
    }

    function pickModel(next) {
        var idx = MODELS.indexOf(model);
        var newModel = next || MODELS[(idx + 1) % MODELS.length];
        setModel(newModel);
        storage.model = newModel;
    }

    var tabsRow = R.createElement(View, { style: c.tabs },
        R.createElement(Pressable, {
            style: [c.tabBtn, tab === "chat" ? c.tabBtnOn : c.tabBtnOff],
            onPress: function() { setTab("chat"); }
        }, R.createElement(Text, { style: c.tabText }, "💬 Чат")),
        R.createElement(Pressable, {
            style: [c.tabBtn, tab === "settings" ? c.tabBtnOn : c.tabBtnOff],
            onPress: function() { setTab("settings"); }
        }, R.createElement(Text, { style: c.tabText }, "⚙️ Настройки"))
    );

    if (tab === "settings") {
        return R.createElement(View, { style: c.page },
            tabsRow,
            R.createElement(ScrollView, { style: { flex: 1 } },
                R.createElement(Text, { style: c.section }, "API KEY (onlysq.ru)"),
                R.createElement(TextInput, {
                    style: c.settingsInput,
                    placeholder: "Вставь ключ...",
                    placeholderTextColor: "#4e5058",
                    value: apiKey,
                    onChangeText: setApiKey,
                    secureTextEntry: true
                }),

                R.createElement(Text, { style: c.section }, "Модель"),
                R.createElement(Pressable, { style: c.modelRow, onPress: function() { pickModel(); } },
                    R.createElement(Text, { style: c.label }, "Нажми чтобы переключить:"),
                    R.createElement(Text, { style: c.value }, model)
                ),

                R.createElement(Text, { style: c.section }, "Системный промпт"),
                R.createElement(TextInput, {
                    style: [c.settingsInput, { minHeight: 90, textAlignVertical: "top" }],
                    placeholder: "Роль ИИ...",
                    placeholderTextColor: "#4e5058",
                    value: sysp,
                    onChangeText: setSysp,
                    multiline: true
                }),

                R.createElement(Pressable, { style: c.btn, onPress: save },
                    R.createElement(Text, { style: c.btnText }, "💾 Сохранить")
                ),

                R.createElement(Pressable, {
                    style: [c.btn, { backgroundColor: "#ed4245" }],
                    onPress: function() { setHistory([]); showToast("🗑️ История очищена"); }
                }, R.createElement(Text, { style: c.btnText }, "🗑️ Очистить историю чата")),

                R.createElement(View, { style: { height: 40 } })
            )
        );
    }

    // ── Вкладка чата ──
    return R.createElement(View, { style: c.page },
        tabsRow,
        R.createElement(ScrollView, { style: c.chatArea },
            history.length === 0
                ? R.createElement(Text, { style: c.empty },
                    apiKey ? "Напиши запрос ниже.\nКонтекст последних 10 сообщений текущего канала передаётся автоматически."
                           : "⚠️ Сначала укажи API ключ во вкладке Настройки")
                : history.map(function(m, i) {
                    return R.createElement(View, { key: String(i), style: m.role === "user" ? c.bubbleUser : c.bubbleAi },
                        R.createElement(Text, { style: c.bubbleText }, m.content)
                    );
                }),
            loading ? R.createElement(View, { style: c.bubbleAi },
                R.createElement(Text, { style: c.bubbleText }, "⏳ Думаю...")
            ) : null,
            R.createElement(View, { style: { height: 12 } })
        ),
        R.createElement(View, { style: c.inputRow },
            R.createElement(TextInput, {
                style: c.input,
                placeholder: "Спроси что-нибудь...",
                placeholderTextColor: "#4e5058",
                value: input,
                onChangeText: setInput,
                multiline: true
            }),
            R.createElement(Pressable, { style: c.sendBtn, onPress: send },
                R.createElement(Text, { style: c.sendText }, loading ? "..." : "➤")
            )
        )
    );
}

// ── (необязательный) best-effort патч меню сообщения ─────────
// Может не сработать в новых версиях Discord — не критично,
// основной интерфейс это страница настроек.
function tryPatchMessageMenu() {
    try {
        var React = findByProps("createElement");
        var FormRowMod = findByProps("FormRow");
        var FormRow = FormRowMod && FormRowMod.FormRow;
        var sheetMod = findByProps("MessageLongPressActionSheet");
        var target = sheetMod && (sheetMod.MessageLongPressActionSheet || sheetMod.default);
        if (!React || !FormRow || !target) return;

        patches.push(after("default", target, function(args, ret) {
            try {
                if (!ret || !ret.props) return ret;
                var msg = args && args[0] && args[0].message;
                if (!msg) return ret;
                var row = React.createElement(FormRow, {
                    label: "🤖 Открыть AI чат",
                    onPress: function() { showToast("Открой плагин через ⚙️ настройки"); }
                });
                var ch = ret.props.children;
                if (Array.isArray(ch)) ch.unshift(row);
            } catch(e) {}
            return ret;
        }));
    } catch(e) {
        console.error("[AIChat] message menu patch skipped:", e);
    }
}

// ── Export ────────────────────────────────────────────────────
function onLoad() {
    tryPatchMessageMenu();
}
function onUnload() {
    patches.forEach(function(u) { try { u(); } catch(e) {} });
    patches = [];
}

module.exports = {
    onLoad: onLoad,
    onUnload: onUnload,
    settings: SettingsPage,
    Settings: SettingsPage
};
