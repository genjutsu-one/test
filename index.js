(function () {
    "use strict";

    // AI Chat Translator — Kettu/Vendetta-compat plugin
    // ВАЖНО: весь файл — это ОДНО выражение (function(){...})(),
    // т.к. loader подставляет его как `vendetta => { return <файл>; }`

    var common  = vendetta.metro.common;
    var React   = common.React;
    var RN      = common.ReactNative;

    var metro   = vendetta.metro;
    var findByProps = metro.findByProps;
    var findByName  = metro.findByName;

    var patcher = vendetta.patcher;
    var after   = patcher.after;

    var showToast = vendetta.ui.toasts.showToast;
    var Forms   = vendetta.ui.components.Forms;
    var findInReactTree = vendetta.utils.findInReactTree;

    var storage = vendetta.plugin.storage;

    // "openai" — бесплатный дефолтный ключ onlysq.ru, работает без регистрации
    // (см. https://docs.onlysq.ru/#get-started). Свой ключ можно получить на my.onlysq.ru
    if (!storage.apiKey)    storage.apiKey    = "openai";
    if (!storage.model)     storage.model     = "gpt-4o-mini";
    if (!storage.sysPrompt) storage.sysPrompt =
        "Ты переводчик и помощник. Тебе передаётся контекст последних сообщений Discord-чата. " +
        "Используй его чтобы понимать тему. Отвечай кратко и точно.";
    if (storage.btnPos === undefined) storage.btnPos = null; // {x,y} плавающей кнопки

    // ВАЖНО: правильный base_url для OpenAI-совместимого эндпоинта onlysq.ru —
    // БЕЗ "/v1/" в пути (см. https://docs.onlysq.ru/#get-started -> OpenAI SDK).
    // Раньше тут было ".../ai/openai/v1/chat/completions" — лишний "/v1/" ломал запросы.
    var API_BASE = "https://api.onlysq.ru/ai/openai";

    // Популярные модели onlysq.ru (см. https://docs.onlysq.ru/#models).
    // Список курируемый — если конкретный ID не сработает, его всегда можно
    // вписать вручную в поле "ID модели" в настройках.
    var MODEL_GROUPS = [
        { group: "OpenAI", items: [
            { id: "gpt-4o-mini",     label: "GPT-4o mini" },
            { id: "gpt-4o",          label: "GPT-4o" },
            { id: "gpt-4.1-mini",    label: "GPT-4.1 mini" },
            { id: "gpt-4.1",         label: "GPT-4.1" },
            { id: "gpt-5.2-chat",    label: "GPT-5.2 Chat" },
            { id: "o1-mini",         label: "o1-mini" },
            { id: "o3-mini",         label: "o3-mini" },
            { id: "gpt-oss-120b",    label: "GPT OSS 120B" }
        ]},
        { group: "Google Gemini", items: [
            { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro" },
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
            { id: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
            { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" }
        ]},
        { group: "Anthropic Claude", items: [
            { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
            { id: "claude-3-5-haiku",  label: "Claude 3.5 Haiku" },
            { id: "claude-3-opus",     label: "Claude 3 Opus" }
        ]},
        { group: "DeepSeek", items: [
            { id: "deepseek-r1",   label: "DeepSeek R1" },
            { id: "deepseek-v3",   label: "DeepSeek V3" },
            { id: "deepseek-chat", label: "DeepSeek Chat" }
        ]},
        { group: "Meta Llama", items: [
            { id: "llama-4-scout",    label: "Llama 4 Scout" },
            { id: "llama-4-maverick", label: "Llama 4 Maverick" },
            { id: "llama-3.3-70b",    label: "Llama 3.3 70B" }
        ]},
        { group: "Qwen", items: [
            { id: "qwen3-235b",          label: "Qwen3 235B" },
            { id: "qwen-2.5-72b",        label: "Qwen 2.5 72B" },
            { id: "qwen-2.5-coder-32b",  label: "Qwen 2.5 Coder 32B" }
        ]},
        { group: "Mistral", items: [
            { id: "mistral-large", label: "Mistral Large" },
            { id: "mistral-small", label: "Mistral Small" },
            { id: "mixtral-8x7b",  label: "Mixtral 8x7B" }
        ]},
        { group: "xAI", items: [
            { id: "grok-2", label: "Grok 2" }
        ]}
    ];

    var FAB_SIZE = 56;
    var ACCENT = "#5865f2";

    var patches = [];

    function findModelLabel(id) {
        for (var g = 0; g < MODEL_GROUPS.length; g++) {
            var items = MODEL_GROUPS[g].items;
            for (var i = 0; i < items.length; i++) {
                if (items[i].id === id) return items[i].label;
            }
        }
        return id;
    }

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

    function getClipboard() {
        try {
            var c = findByProps("setString", "getString");
            if (c && typeof c.setString === "function") return c;
        } catch(e) {}
        try {
            if (RN.Clipboard && typeof RN.Clipboard.setString === "function") return RN.Clipboard;
        } catch(e) {}
        return null;
    }

    function copyText(text) {
        try {
            var c = getClipboard();
            if (c) {
                c.setString(String(text || ""));
                showToast("✅ Скопировано");
                return;
            }
        } catch(e) {}
        showToast("⚠️ Не удалось скопировать (выдели текст вручную)");
    }

    async function askAI(query, channelId, history) {
        if (!storage.apiKey) throw new Error("API ключ не задан (настройки плагина)");
        var ctx = getContext(channelId);
        var system = storage.sysPrompt + (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");
        var messages = [{ role: "system", content: system }];
        (history || []).slice(-10).forEach(function(m) { messages.push({ role: m.role, content: m.content }); });
        messages.push({ role: "user", content: query });

        var res = await fetch(API_BASE + "/chat/completions", {
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

    // ---------- Иконки (без эмодзи, рисуются View'ами) ----------

    function BotIcon(size, color) {
        var s = size || 24;
        var col = color || "#fff";
        return React.createElement(RN.View, { style: { width: s, height: s } },
            React.createElement(RN.View, { style: { position: "absolute", top: 0, left: s / 2 - 1, width: 2, height: s * 0.16, backgroundColor: col } }),
            React.createElement(RN.View, { style: { position: "absolute", top: 0, left: s / 2 - s * 0.07, width: s * 0.14, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: col } }),
            React.createElement(RN.View, { style: { position: "absolute", top: s * 0.2, left: 0, width: s, height: s * 0.62, borderRadius: s * 0.18, backgroundColor: col, alignItems: "center", justifyContent: "center", flexDirection: "row" } },
                React.createElement(RN.View, { style: { width: s * 0.14, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: "#1e1f22", marginHorizontal: s * 0.09 } }),
                React.createElement(RN.View, { style: { width: s * 0.14, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: "#1e1f22", marginHorizontal: s * 0.09 } })
            ),
            React.createElement(RN.View, { style: { position: "absolute", bottom: 0, left: s * 0.24, width: s * 0.52, height: s * 0.07, borderRadius: s * 0.04, backgroundColor: col, opacity: 0.8 } })
        );
    }

    function CopyIcon(size, color) {
        var s = size || 13;
        var col = color || "#9aa0a8";
        return React.createElement(RN.View, { style: { width: s * 1.3, height: s * 1.3 } },
            React.createElement(RN.View, { style: { position: "absolute", left: s * 0.35, top: 0, width: s * 0.85, height: s * 0.85, borderRadius: 2, borderWidth: 1.3, borderColor: col } }),
            React.createElement(RN.View, { style: { position: "absolute", left: 0, top: s * 0.35, width: s * 0.85, height: s * 0.85, borderRadius: 2, borderWidth: 1.3, borderColor: col, backgroundColor: "#1e1f22" } })
        );
    }

    function CloseIcon(size, color) {
        var s = size || 16;
        var col = color || "#dbdee1";
        return React.createElement(RN.View, { style: { width: s, height: s, alignItems: "center", justifyContent: "center" } },
            React.createElement(RN.View, { style: { position: "absolute", width: s, height: 2, backgroundColor: col, borderRadius: 1, transform: [{ rotate: "45deg" }] } }),
            React.createElement(RN.View, { style: { position: "absolute", width: s, height: 2, backgroundColor: col, borderRadius: 1, transform: [{ rotate: "-45deg" }] } })
        );
    }

    var c = {
        fab: {
            position: "absolute", width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
            backgroundColor: ACCENT, alignItems: "center", justifyContent: "center",
            zIndex: 9999, elevation: 12,
            shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }
        },
        overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
        sheet: {
            backgroundColor: "#1e1f22", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: "85%", minHeight: 420, paddingBottom: 12, borderTopWidth: 2, borderTopColor: ACCENT
        },
        header: {
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
            borderBottomWidth: 1, borderBottomColor: "#2b2d31"
        },
        headerLeft: { flexDirection: "row", alignItems: "center" },
        headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginLeft: 8 },
        headerBtns: { flexDirection: "row", alignItems: "center" },
        iconBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center", marginLeft: 8 },
        clearText: { color: "#9aa0a8", fontSize: 12, fontWeight: "600", marginLeft: 8 },
        scroll: { flex: 1, paddingHorizontal: 12 },
        scrollContent: { paddingVertical: 10 },
        bubbleUser: {
            backgroundColor: ACCENT, borderRadius: 14, borderBottomRightRadius: 4,
            padding: 12, marginVertical: 5, alignSelf: "flex-end", maxWidth: "85%"
        },
        bubbleAi: {
            backgroundColor: "#2b2d31", borderRadius: 14, borderBottomLeftRadius: 4,
            padding: 12, marginVertical: 5, alignSelf: "flex-start", maxWidth: "85%"
        },
        bubbleText: { color: "#dbdee1", fontSize: 14.5, lineHeight: 20 },
        bubbleRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 6 },
        copyBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 2, paddingHorizontal: 4 },
        copyBtnText: { color: "#9aa0a8", fontSize: 11, marginLeft: 4 },
        empty: { color: "#80848e", textAlign: "center", marginTop: 28, fontSize: 13, paddingHorizontal: 20, lineHeight: 19 },
        inputBar: {
            flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8,
            borderTopWidth: 1, borderTopColor: "#2b2d31"
        },
        input: {
            flex: 1, color: "#dbdee1", backgroundColor: "#2b2d31", borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, fontSize: 14.5, maxHeight: 110
        },
        sendBtn: {
            backgroundColor: ACCENT, borderRadius: 12, width: 44, height: 44,
            alignItems: "center", justifyContent: "center"
        },
        sendText: { color: "#fff", fontWeight: "700", fontSize: 16 },

        pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
        pickerSheet: { backgroundColor: "#1e1f22", borderRadius: 16, maxHeight: "80%", padding: 14 },
        pickerTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 10, textAlign: "center" },
        pickerScroll: { flexGrow: 0 },
        pickerGroup: { color: "#80848e", fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 4, textTransform: "uppercase" },
        pickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
        pickerRowSel: { backgroundColor: "rgba(88,101,242,0.18)" },
        pickerRowText: { color: "#dbdee1", fontSize: 14, flex: 1 },
        pickerRowTextSel: { color: "#fff", fontWeight: "700" },
        pickerRowId: { color: "#80848e", fontSize: 11, marginRight: 6 },
        pickerCheck: { color: ACCENT, fontSize: 15, fontWeight: "900" },
        pickerClose: { marginTop: 12, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 18, backgroundColor: "#2b2d31", borderRadius: 10 },
        pickerCloseText: { color: "#dbdee1", fontSize: 13, fontWeight: "600" }
    };

    function ChatSheet(props) {
        var visible = props.visible;
        var onClose = props.onClose;
        var inputState = React.useState("");
        var input = inputState[0], setInput = inputState[1];
        var historyState = React.useState([]);
        var history = historyState[0], setHistory = historyState[1];
        var loadingState = React.useState(false);
        var loading = loadingState[0], setLoading = loadingState[1];
        var scrollRef = React.useRef(null);

        React.useEffect(function() {
            if (scrollRef.current) {
                setTimeout(function() {
                    try { scrollRef.current.scrollToEnd({ animated: true }); } catch(e) {}
                }, 60);
            }
        }, [history.length, loading, visible]);

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

        function clearHistory() {
            setHistory([]);
        }

        return React.createElement(RN.Modal, {
            visible: visible,
            transparent: true,
            animationType: "slide",
            onRequestClose: onClose
        },
            React.createElement(RN.Pressable, { style: c.overlay, onPress: onClose },
                React.createElement(RN.Pressable, { style: c.sheet, onPress: function() {} },
                    React.createElement(RN.KeyboardAvoidingView, {
                        behavior: RN.Platform.OS === "ios" ? "padding" : undefined,
                        keyboardVerticalOffset: RN.Platform.OS === "ios" ? 40 : 0,
                        style: { flex: 1 }
                    },
                        React.createElement(RN.View, { style: c.header },
                            React.createElement(RN.View, { style: c.headerLeft },
                                BotIcon(20, "#fff"),
                                React.createElement(RN.Text, { style: c.headerTitle }, "AI Chat")
                            ),
                            React.createElement(RN.View, { style: c.headerBtns },
                                history.length > 0 ? React.createElement(RN.Pressable, { onPress: clearHistory },
                                    React.createElement(RN.Text, { style: c.clearText }, "Очистить")
                                ) : null,
                                React.createElement(RN.Pressable, { style: c.iconBtn, onPress: onClose },
                                    CloseIcon(13, "#dbdee1")
                                )
                            )
                        ),

                        React.createElement(RN.ScrollView, {
                            ref: scrollRef,
                            style: c.scroll,
                            contentContainerStyle: c.scrollContent
                        },
                            history.length === 0
                                ? React.createElement(RN.Text, { style: c.empty },
                                    storage.apiKey
                                        ? "Спроси что-нибудь. Контекст последних 10 сообщений канала передаётся автоматически. Текст в сообщениях можно выделить или скопировать кнопкой под ним."
                                        : "⚠️ Сначала укажи API ключ в настройках плагина (⚙️ Configure)")
                                : history.map(function(m, i) {
                                    var isUser = m.role === "user";
                                    return React.createElement(RN.View, { key: String(i), style: isUser ? c.bubbleUser : c.bubbleAi },
                                        React.createElement(RN.Text, { style: c.bubbleText, selectable: true }, m.content),
                                        React.createElement(RN.View, { style: c.bubbleRow },
                                            React.createElement(RN.Pressable, {
                                                style: c.copyBtn,
                                                hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
                                                onPress: function() { copyText(m.content); }
                                            },
                                                CopyIcon(12, isUser ? "rgba(255,255,255,0.85)" : "#9aa0a8"),
                                                React.createElement(RN.Text, { style: [c.copyBtnText, isUser ? { color: "rgba(255,255,255,0.85)" } : null] }, "Копировать")
                                            )
                                        )
                                    );
                                }),
                            loading ? React.createElement(RN.View, { style: c.bubbleAi },
                                React.createElement(RN.Text, { style: c.bubbleText }, "Думаю...")
                            ) : null
                        ),

                        React.createElement(RN.View, { style: c.inputBar },
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
                        )
                    )
                )
            )
        );
    }

    function AIChatFAB() {
        var win = RN.Dimensions.get("window");
        var defaultPos = { x: win.width - FAB_SIZE - 12, y: win.height * 0.55 };
        var startPos = (storage.btnPos && typeof storage.btnPos.x === "number") ? storage.btnPos : defaultPos;

        var visibleState = React.useState(false);
        var visible = visibleState[0], setVisible = visibleState[1];

        var pan = React.useRef(new RN.Animated.ValueXY({ x: startPos.x, y: startPos.y })).current;
        var posRef = React.useRef({ x: startPos.x, y: startPos.y });
        var draggedRef = React.useRef(false);

        React.useEffect(function() {
            var id = pan.addListener(function(v) { posRef.current = v; });
            return function() { pan.removeListener(id); };
        }, []);

        var panResponder = React.useRef(
            RN.PanResponder.create({
                onStartShouldSetPanResponder: function() { return true; },
                onMoveShouldSetPanResponder: function(e, g) {
                    return Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3;
                },
                onPanResponderGrant: function() {
                    draggedRef.current = false;
                    pan.setOffset({ x: posRef.current.x, y: posRef.current.y });
                    pan.setValue({ x: 0, y: 0 });
                },
                onPanResponderMove: function(e, g) {
                    if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) draggedRef.current = true;
                    RN.Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(e, g);
                },
                onPanResponderRelease: function() {
                    pan.flattenOffset();
                    var w = RN.Dimensions.get("window");
                    var x = posRef.current.x, y = posRef.current.y;
                    var clampedY = Math.max(40, Math.min(y, w.height - FAB_SIZE - 60));
                    var snapX = (x + FAB_SIZE / 2 < w.width / 2) ? 10 : (w.width - FAB_SIZE - 10);
                    RN.Animated.spring(pan, { toValue: { x: snapX, y: clampedY }, friction: 7, useNativeDriver: false }).start();
                    storage.btnPos = { x: snapX, y: clampedY };
                    if (!draggedRef.current) setVisible(true);
                },
                onPanResponderTerminate: function() {
                    pan.flattenOffset();
                }
            })
        ).current;

        return React.createElement(React.Fragment, null,
            React.createElement(RN.Animated.View, Object.assign(
                { style: [c.fab, pan.getLayout()] },
                panResponder.panHandlers
            ),
                BotIcon(28, "#fff")
            ),
            React.createElement(ChatSheet, { visible: visible, onClose: function() { setVisible(false); } })
        );
    }

    function patchChatBar() {
        try {
            var ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
            if (!ChatInputGuardWrapper) {
                console.error("[AIChat] ChatInputGuardWrapper не найден");
                return false;
            }

            patches.push(after("default", ChatInputGuardWrapper, function(args, ret) {
                try {
                    if (!ret || !ret.props) return ret;
                    var target = findInReactTree(ret.props.children, function(x) {
                        return x && x.props && Array.isArray(x.props.children)
                            && x.props.children.length >= 1 && x.props.children.length <= 8;
                    });
                    var arr = target && target.props && target.props.children;
                    if (!arr || !Array.isArray(arr)) return ret;

                    // Защита от дублирования: кнопку добавляем только если её ещё нет
                    // в этом конкретном массиве (раньше тут не было проверки, и при
                    // каждом ре-рендере панели ввода кнопка добавлялась заново).
                    var already = arr.some(function(el) { return el && el.key === "ai-chat-fab"; });
                    if (!already) {
                        arr.unshift(React.createElement(AIChatFAB, { key: "ai-chat-fab" }));
                    }
                } catch(e) {
                    console.error("[AIChat] patch error:", e);
                }
                return ret;
            }));
            return true;
        } catch(e) {
            console.error("[AIChat] patchChatBar error:", e);
            return false;
        }
    }

    function ModelPicker(props) {
        var visible = props.visible, onClose = props.onClose, current = props.current, onSelect = props.onSelect;
        return React.createElement(RN.Modal, { visible: visible, transparent: true, animationType: "fade", onRequestClose: onClose },
            React.createElement(RN.Pressable, { style: c.pickerOverlay, onPress: onClose },
                React.createElement(RN.Pressable, { style: c.pickerSheet, onPress: function() {} },
                    React.createElement(RN.Text, { style: c.pickerTitle }, "Выбери модель"),
                    React.createElement(RN.ScrollView, { style: c.pickerScroll },
                        MODEL_GROUPS.map(function(g) {
                            return React.createElement(RN.View, { key: g.group },
                                React.createElement(RN.Text, { style: c.pickerGroup }, g.group),
                                g.items.map(function(it) {
                                    var sel = it.id === current;
                                    return React.createElement(RN.Pressable, {
                                        key: it.id,
                                        style: sel ? [c.pickerRow, c.pickerRowSel] : c.pickerRow,
                                        onPress: function() { onSelect(it.id); onClose(); }
                                    },
                                        React.createElement(RN.Text, { style: sel ? [c.pickerRowText, c.pickerRowTextSel] : c.pickerRowText }, it.label),
                                        React.createElement(RN.Text, { style: c.pickerRowId }, it.id),
                                        sel ? React.createElement(RN.Text, { style: c.pickerCheck }, "✓") : null
                                    );
                                })
                            );
                        })
                    ),
                    React.createElement(RN.Pressable, { style: c.pickerClose, onPress: onClose },
                        React.createElement(RN.Text, { style: c.pickerCloseText }, "Закрыть")
                    )
                )
            )
        );
    }

    function Settings() {
        var ScrollView = RN.ScrollView;
        var FormSection = Forms.FormSection;
        var FormRow = Forms.FormRow;
        var FormInput = Forms.FormInput;

        var apiKeyState = React.useState(storage.apiKey || "");
        var apiKey = apiKeyState[0], setApiKey = apiKeyState[1];
        var modelState = React.useState(storage.model || "gpt-4o-mini");
        var model = modelState[0], setModel = modelState[1];
        var sysState = React.useState(storage.sysPrompt || "");
        var sysp = sysState[0], setSysp = sysState[1];
        var pickerState = React.useState(false);
        var pickerVisible = pickerState[0], setPickerVisible = pickerState[1];

        function save() {
            storage.apiKey = apiKey;
            storage.model = model;
            storage.sysPrompt = sysp;
            showToast("✅ Сохранено");
        }

        function selectModel(id) {
            setModel(id);
            storage.model = id;
        }

        function resetFabPos() {
            storage.btnPos = null;
            showToast("✅ Положение кнопки сброшено, перезайди в чат");
        }

        return React.createElement(ScrollView, null,
            React.createElement(FormSection, { title: "API (onlysq.ru)" },
                React.createElement(FormInput, {
                    title: "API Key",
                    placeholder: "openai (бесплатно) или свой ключ с my.onlysq.ru",
                    value: apiKey,
                    onChange: setApiKey,
                    secureTextEntry: true
                }),
                React.createElement(FormInput, {
                    title: "ID модели",
                    placeholder: "например gpt-4o-mini",
                    value: model,
                    onChange: setModel
                }),
                React.createElement(FormRow, {
                    label: "Выбрать из списка популярных",
                    subLabel: findModelLabel(model),
                    trailing: FormRow.Arrow,
                    onPress: function() { setPickerVisible(true); }
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
            React.createElement(FormSection, { title: "Плавающая кнопка" },
                React.createElement(FormRow, { label: "Сбросить положение кнопки", onPress: resetFabPos })
            ),
            React.createElement(FormSection, { title: "" },
                React.createElement(FormRow, { label: "💾 Сохранить", onPress: save })
            ),
            React.createElement(ModelPicker, {
                visible: pickerVisible,
                onClose: function() { setPickerVisible(false); },
                current: model,
                onSelect: selectModel
            })
        );
    }

    function onLoad() {
        onUnload();
        var ok = patchChatBar();
        if (!ok) showToast("⚠️ AI Chat: кнопка в чате не подключилась, используй ⚙️ настройки");
    }
    function onUnload() {
        patches.forEach(function(u) { try { u(); } catch(e) {} });
        patches = [];
    }

    return {
        onLoad: onLoad,
        onUnload: onUnload,
        settings: Settings
    };
})()
