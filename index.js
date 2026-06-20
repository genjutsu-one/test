"use strict";

// AI Chat Translator — Bunny/Vendetta/Kettu plugin
// Построено на подтверждённых реальных паттернах из живых опубликованных плагинов
// (fakeProfile-mobile-plugin, RevengePlugins/message-preview)

var common  = vendetta.metro.common;
var React   = common.React;
var RN      = common.ReactNative;

var metro   = vendetta.metro;
var findByProps = metro.findByProps;
var findByName  = metro.findByName;

var patcher = vendetta.patcher;
var after   = patcher.after;

var showToast = vendetta.ui.toasts.showToast;
var components = vendetta.ui.components;
var General = components.General;
var Forms   = components.Forms;

var storage = vendetta.plugin.storage;

if (!storage.apiKey)    storage.apiKey    = "";
if (!storage.model)     storage.model     = "gpt-4o-mini";
if (!storage.sysPrompt) storage.sysPrompt =
    "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
    "Используй его чтобы понимать тему. Отвечай кратко и точно.";

var MODELS = ["gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "gpt-4o"];

var patches = [];

// ── Поиск вложенного элемента в дереве React (свой findInReactTree) ─
function findInReactTree(tree, predicate) {
    if (!tree) return null;
    if (predicate(tree)) return tree;
    var children = tree && tree.props && tree.props.children;
    if (!children) return null;
    if (Array.isArray(children)) {
        for (var i = 0; i < children.length; i++) {
            var found = findInReactTree(children[i], predicate);
            if (found) return found;
        }
    } else {
        return findInReactTree(children, predicate);
    }
    return null;
}

// ── Контекст последних сообщений ────────────────────────────────
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

function getCurrentChannelId() {
    try {
        var mod = findByProps("getChannelId");
        return mod && mod.getChannelId();
    } catch(e) { return null; }
}

// ── Запрос к API ──────────────────────────────────────────────────
async function askAI(query, channelId, history) {
    if (!storage.apiKey) throw new Error("API ключ не задан (настройки плагина)");
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
        var t = await res.text();
        throw new Error("API " + res.status + ": " + t.slice(0, 200));
    }
    var data = await res.json();
    var choice = data.choices && data.choices[0];
    var content = choice && choice.message && choice.message.content;
    return (content || "").trim() || "(пустой ответ)";
}

// ── Кнопка + модалка чата, монтируется прямо в чат-бар ────────────
function AIChatButton() {
    var visibleState = React.useState(false);
    var visible = visibleState[0], setVisible = visibleState[1];
    var inputState = React.useState("");
    var input = inputState[0], setInput = inputState[1];
    var historyState = React.useState([]);
    var history = historyState[0], setHistory = historyState[1];
    var loadingState = React.useState(false);
    var loading = loadingState[0], setLoading = loadingState[1];

    async function send() {
        var q = (input || "").trim();
        if (!q || loading) return;
        setInput("");
        setLoading(true);
        var newHist = history.concat([{ role: "user", content: q }]);
        setHistory(newHist);
        try {
            var channelId = getCurrentChannelId();
            var answer = await askAI(q, channelId, history);
            setHistory(newHist.concat([{ role: "assistant", content: answer }]));
        } catch(e) {
            setHistory(newHist.concat([{ role: "assistant", content: "❌ " + e.message }]));
        } finally {
            setLoading(false);
        }
    }

    var c = {
        btn: { width: 32, height: 32, borderRadius: 16, marginHorizontal: 4,
               justifyContent: "center", alignItems: "center", backgroundColor: "#2b2d31" },
        btnText: { fontSize: 18 },
        overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
        sheet: { backgroundColor: "#1e1f22", borderTopLeftRadius: 16, borderTopRightRadius: 16,
                 maxHeight: "75%", minHeight: 320, padding: 12 },
        header: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8, textAlign: "center" },
        scroll: { maxHeight: 320, marginBottom: 8 },
        bubbleUser: { backgroundColor: "#5865f2", borderRadius: 10, padding: 10, marginVertical: 4, alignSelf: "flex-end", maxWidth: "85%" },
        bubbleAi:   { backgroundColor: "#2b2d31", borderRadius: 10, padding: 10, marginVertical: 4, alignSelf: "flex-start", maxWidth: "85%" },
        bubbleText: { color: "#dbdee1", fontSize: 14 },
        empty: { color: "#80848e", textAlign: "center", marginTop: 20, fontSize: 13 },
        inputRow: { flexDirection: "row", alignItems: "center" },
        input: { flex: 1, color: "#dbdee1", backgroundColor: "#2b2d31", borderRadius: 8,
                 padding: 10, marginRight: 8, fontSize: 14, maxHeight: 90 },
        sendBtn: { backgroundColor: "#5865f2", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
        sendText: { color: "#fff", fontWeight: "700" },
        closeBtn: { alignSelf: "center", marginTop: 10, padding: 6 },
        closeText: { color: "#80848e", fontSize: 13 }
    };

    return React.createElement(RN.View, null,
        React.createElement(RN.Pressable, {
            style: c.btn,
            onPress: function() { setVisible(true); }
        }, React.createElement(RN.Text, { style: c.btnText }, "🤖")),

        React.createElement(General.Modal, {
            visible: visible,
            transparent: true,
            animationType: "slide",
            onRequestClose: function() { setVisible(false); }
        },
            React.createElement(RN.Pressable, {
                style: c.overlay,
                onPress: function() { setVisible(false); }
            },
                React.createElement(RN.Pressable, { style: c.sheet, onPress: function(e) {} },
                    React.createElement(RN.Text, { style: c.header }, "🤖 AI Chat"),

                    React.createElement(RN.ScrollView, { style: c.scroll },
                        history.length === 0
                            ? React.createElement(RN.Text, { style: c.empty },
                                storage.apiKey
                                    ? "Спроси что-нибудь. Контекст последних 10 сообщений канала передаётся автоматически."
                                    : "⚠️ Сначала укажи API ключ в настройках плагина (⚙️ Configure)")
                            : history.map(function(m, i) {
                                return React.createElement(RN.View, { key: String(i), style: m.role === "user" ? c.bubbleUser : c.bubbleAi },
                                    React.createElement(RN.Text, { style: c.bubbleText }, m.content)
                                );
                            }),
                        loading ? React.createElement(RN.View, { style: c.bubbleAi },
                            React.createElement(RN.Text, { style: c.bubbleText }, "⏳ Думаю...")
                        ) : null
                    ),

                    React.createElement(RN.View, { style: c.inputRow },
                        React.createElement(RN.TextInput, {
                            style: c.input,
                            placeholder: "Спроси что-нибудь...",
                            placeholderTextColor: "#4e5058",
                            value: input,
                            onChangeText: setInput,
                            multiline: true
                        }),
                        React.createElement(RN.Pressable, { style: c.sendBtn, onPress: send },
                            React.createElement(RN.Text, { style: c.sendText }, loading ? "..." : "➤")
                        )
                    ),

                    React.createElement(RN.Pressable, { style: c.closeBtn, onPress: function() { setVisible(false); } },
                        React.createElement(RN.Text, { style: c.closeText }, "Закрыть")
                    )
                )
            )
        )
    );
}

// ── Патч: монтируем кнопку в панель ввода чата ────────────────────
function patchChatBar() {
    var ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
    if (!ChatInputGuardWrapper) {
        console.error("[AIChat] ChatInputGuardWrapper не найден");
        return false;
    }

    patches.push(after("default", ChatInputGuardWrapper, function(args, ret) {
        try {
            if (!ret || !ret.props) return ret;
            var children = (findInReactTree(ret.props.children, function(x) {
                return x && x.props && Array.isArray(x.props.children) &&
                       x.type && (x.type.displayName === "View" || typeof x.type === "function");
            }) || {}).props;

            // основной таргет: первый найденный View с массивом children внутри toolbar'а
            var target = findInReactTree(ret.props.children, function(x) {
                return x && x.props && Array.isArray(x.props.children) && x.props.children.length >= 1;
            });
            var arr = target && target.props && target.props.children;
            if (!arr || !Array.isArray(arr)) return ret;

            arr.unshift(React.createElement(AIChatButton, { key: "ai-chat-btn" }));
        } catch(e) {
            console.error("[AIChat] patch error:", e);
        }
        return ret;
    }));
    return true;
}

// ── Настройки плагина ──────────────────────────────────────────────
function Settings() {
    var ScrollView = General.ScrollView;
    var FormSection = Forms.FormSection;
    var FormRow = Forms.FormRow;
    var FormInput = Forms.FormInput;

    var apiKeyState = React.useState(storage.apiKey || "");
    var apiKey = apiKeyState[0], setApiKey = apiKeyState[1];
    var modelState = React.useState(storage.model || "gpt-4o-mini");
    var model = modelState[0], setModel = modelState[1];
    var sysState = React.useState(storage.sysPrompt || "");
    var sysp = sysState[0], setSysp = sysState[1];

    function save() {
        storage.apiKey = apiKey;
        storage.model = model;
        storage.sysPrompt = sysp;
        showToast("✅ Сохранено");
    }

    function cycleModel() {
        var idx = MODELS.indexOf(model);
        var next = MODELS[(idx + 1) % MODELS.length];
        setModel(next);
        storage.model = next;
    }

    return React.createElement(ScrollView, null,
        React.createElement(FormSection, { title: "API (onlysq.ru)" },
            React.createElement(FormInput, {
                title: "API Key",
                placeholder: "Вставь ключ...",
                value: apiKey,
                onChange: setApiKey,
                secureTextEntry: true
            }),
            React.createElement(FormRow, {
                label: "Модель",
                subLabel: model,
                trailing: FormRow.Arrow,
                onPress: cycleModel
            })
        ),
        React.createElement(FormSection, { title: "Системный промпт" },
            React.createElement(FormInput, {
                title: "Промпт",
                value: sysp,
                onChange: setSysp,
                multiline: true
            })
        ),
        React.createElement(FormSection, { title: "" },
            React.createElement(FormRow, { label: "💾 Сохранить", onPress: save })
        )
    );
}

// ── Export ────────────────────────────────────────────────────────
function onLoad() {
    var ok = patchChatBar();
    if (!ok) showToast("⚠️ AI Chat: кнопка не подключилась, используй настройки");
}
function onUnload() {
    patches.forEach(function(u) { try { u(); } catch(e) {} });
    patches = [];
}

module.exports = {
    onLoad: onLoad,
    onUnload: onUnload,
    settings: Settings
};
