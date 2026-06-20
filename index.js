(function () {
    "use strict";

    var common = vendetta.metro.common;
    var React = common.React;
    var RN = common.ReactNative;
    var { View, Text, Modal, Pressable, TextInput, ScrollView, Animated, PanResponder, Clipboard } = RN;

    var metro = vendetta.metro;
    var findByProps = metro.findByProps;
    var findByName = metro.findByName;

    var patcher = vendetta.patcher;
    var after = patcher.after;

    var showToast = vendetta.ui.toasts.showToast;
    var Forms = vendetta.ui.components.Forms;

    var storage = vendetta.plugin.storage;

    // Дефолтные настройки
    if (!storage.apiKey) storage.apiKey = "";
    if (!storage.model) storage.model = "gpt-4o-mini";
    if (!storage.sysPrompt) storage.sysPrompt = "Ты полезный помощник. Отвечай кратко, точно и по делу.";
    if (!storage.btnPos) storage.btnPos = { x: -20, y: -100 };

    // Актуальные модели onlysq.ru
    const MODELS = [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
        { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
        { label: "Claude 3.5 Sonnet", value: "claude-3.5-sonnet" },
        { label: "DeepSeek R1", value: "deepseek-r1" },
        { label: "Llama 3.1 70B", value: "llama-3.1-70b" },
        { label: "Mistral Large", value: "mistral-large" }
    ];

    var patches = [];

    // ====================== ОСНОВНАЯ ЛОГИКА ======================

    function getContext(channelId) {
        try {
            var MS = findByProps("getMessages");
            var US = findByProps("getUser", "getCurrentUser");
            if (!MS || !channelId) return "";
            
            var msgs = MS.getMessages(channelId);
            if (!msgs) return "";
            
            var arr = msgs._array || (msgs.toArray ? msgs.toArray() : []);
            return arr.slice(-12).map(function (m) {
                var author = m.author || {};
                var name = (US && US.getUser(author.id) || {}).username || author.username || "?";
                return name + ": " + (m.content || "");
            }).filter(Boolean).join("\n");
        } catch (e) { 
            console.error("[AIChat] Context error:", e);
            return ""; 
        }
    }

    function getCurrentChannelId() {
        try {
            var mod = findByProps("getChannelId");
            return mod && mod.getChannelId();
        } catch (e) { return null; }
    }

    async function askAI(query, channelId, history) {
        if (!storage.apiKey) throw new Error("Укажите API ключ в настройках");

        var ctx = getContext(channelId);
        var system = storage.sysPrompt + (ctx ? "\n\n[Контекст чата]\n" + ctx + "\n[/Контекст]" : "");

        var messages = [{ role: "system", content: system }];
        (history || []).slice(-20).forEach(m => {
            messages.push({ role: m.role, content: m.content });
        });
        messages.push({ role: "user", content: query });

        var res = await fetch("https://api.onlysq.ru/ai/openai/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": "Bearer " + storage.apiKey 
            },
            body: JSON.stringify({ 
                model: storage.model, 
                messages: messages, 
                max_tokens: 1200,
                temperature: 0.75
            })
        });

        if (!res.ok) {
            var errorText = await res.text().catch(() => "No error details");
            console.error("[AIChat] API Error:", res.status, errorText);
            throw new Error(`API Error ${res.status}: ${errorText}`);
        }
        
        var data = await res.json();
        var choice = data.choices && data.choices[0];
        var content = choice && choice.message && choice.message.content;
        return (content || "").trim() || "(пустой ответ)";
    }

    // ====================== UI ======================

    const SparklesIcon = ({ color = "#fff", size = 24 }) => React.createElement(
        RN.Image, 
        { 
            source: { uri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23${color.replace('#','')}"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>` },
            style: { width: size, height: size }
        }
    );

    function AIChatModal({ visible, onClose }) {
        const [input, setInput] = React.useState("");
        const [history, setHistory] = React.useState([]);
        const [loading, setLoading] = React.useState(false);
        const scrollRef = React.useRef(null);

        async function send() {
            const q = input.trim();
            if (!q || loading) return;

            setInput("");
            setLoading(true);
            const newHist = [...history, { role: "user", content: q }];
            setHistory(newHist);

            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

            try {
                const channelId = getCurrentChannelId();
                const answer = await askAI(q, channelId, history);
                setHistory(prev => [...prev, { role: "assistant", content: answer }]);
            } catch (e) {
                setHistory(prev => [...prev, { role: "assistant", content: "❌ " + e.message }]);
            } finally {
                setLoading(false);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
            }
        }

        const copyText = (text) => {
            Clipboard.setString(text);
            showToast("✅ Скопировано");
        };

        const s = {
            overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
            sheet: { 
                backgroundColor: "#1e1f22", 
                borderTopLeftRadius: 24, 
                borderTopRightRadius: 24,
                maxHeight: "85%", 
                minHeight: 420,
                paddingHorizontal: 16, 
                paddingTop: 16, 
                paddingBottom: 24
            },
            header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
            title: { color: "#fff", fontSize: 20, fontWeight: "700" },
            msgRow: { marginVertical: 6, maxWidth: "88%" },
            bubbleUser: { alignSelf: "flex-end", backgroundColor: "#5865f2", borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
            bubbleAi: { alignSelf: "flex-start", backgroundColor: "#2b2d31", borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
            text: { color: "#dbdee1", fontSize: 15.5, lineHeight: 22 },
            inputArea: { flexDirection: "row", alignItems: "flex-end", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#36393f" },
            input: { 
                flex: 1, color: "#fff", backgroundColor: "#2b2d31", borderRadius: 22, 
                paddingHorizontal: 18, paddingVertical: 12, marginRight: 10, fontSize: 15.5, maxHeight: 120 
            },
            sendBtn: { 
                backgroundColor: "#5865f2", width: 44, height: 44, borderRadius: 22, 
                justifyContent: "center", alignItems: "center", marginBottom: 3 
            }
        };

        return React.createElement(Modal, { visible: visible, transparent: true, animationType: "slide", onRequestClose: onClose },
            React.createElement(Pressable, { style: s.overlay, onPress: onClose },
                React.createElement(Pressable, { style: s.sheet, onPress: e => e.stopPropagation() },
                    
                    React.createElement(View, { style: s.header },
                        React.createElement(Text, { style: s.title }, "✨ AI Assistant"),
                        React.createElement(Pressable, { onPress: () => setHistory([]), style: {padding: 6} },
                            React.createElement(Text, { style: {color: "#ed4245", fontWeight: "600"} }, "Очистить")
                        )
                    ),

                    React.createElement(ScrollView, { 
                        ref: scrollRef, 
                        style: { flex: 1 }, 
                        contentContainerStyle: { paddingBottom: 20 }
                    },
                        history.length === 0 
                            ? React.createElement(View, {style: {alignItems: "center", marginTop: 60}},
                                React.createElement(SparklesIcon, {size: 56, color: "#4e5058"}),
                                React.createElement(Text, {style: {color: "#80848e", marginTop: 16, fontSize: 16}}, "Задайте вопрос ИИ...")
                              )
                            : history.map((m, i) => 
                                React.createElement(Pressable, { 
                                    key: i, 
                                    style: [s.msgRow, m.role === "user" ? s.bubbleUser : s.bubbleAi],
                                    onLongPress: () => copyText(m.content)
                                },
                                    React.createElement(Text, { style: s.text, selectable: true }, m.content)
                                )
                              ),
                        loading && React.createElement(View, { style: [s.msgRow, s.bubbleAi] },
                            React.createElement(Text, { style: [s.text, {opacity: 0.7}] }, "⏳ ИИ думает...")
                        )
                    ),

                    React.createElement(View, { style: s.inputArea },
                        React.createElement(TextInput, {
                            style: s.input,
                            placeholder: "Сообщение...",
                            placeholderTextColor: "#72767d",
                            value: input,
                            onChangeText: setInput,
                            multiline: true,
                            onSubmitEditing: send,
                            blurOnSubmit: false
                        }),
                        React.createElement(Pressable, { 
                            style: [s.sendBtn, {opacity: (!input.trim() || loading) ? 0.5 : 1}], 
                            onPress: send,
                            disabled: !input.trim() || loading
                        },
                            React.createElement(Text, { style: {color: "#fff", fontSize: 20, fontWeight: "bold"} }, "↑")
                        )
                    )
                )
            )
        );
    }

    function DraggableAIButton() {
        const [visible, setVisible] = React.useState(false);
        const pan = React.useRef(new Animated.ValueXY(storage.btnPos)).current;

        const panResponder = React.useMemo(() => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                pan.setOffset({ x: pan.x._value, y: pan.y._value });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                storage.btnPos = { x: pan.x._value, y: pan.y._value };
            }
        }), [pan]);

        const btnStyle = {
            position: 'absolute',
            right: 20,
            bottom: 100,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: '#5865f2',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: "#000",
            shadowOffset: {width:0, height:4},
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 10,
            transform: [{ translateX: pan.x }, { translateY: pan.y }]
        };

        return React.createElement(View, { pointerEvents: "box-none", style: {position: 'absolute', top:0, left:0, right:0, bottom:0, zIndex: 9999} },
            React.createElement(Animated.View, { ...panResponder.panHandlers, style: btnStyle },
                React.createElement(Pressable, { 
                    onPress: () => setVisible(true),
                    style: {width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center'}
                },
                    React.createElement(SparklesIcon, { size: 30, color: "#fff" })
                )
            ),
            React.createElement(AIChatModal, { visible: visible, onClose: () => setVisible(false) })
        );
    }

    // ====================== ПАТЧИНГ ======================

    function patchChatBar() {
        try {
            var ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
            if (!ChatInputGuardWrapper) return false;

            patches.push(after("default", ChatInputGuardWrapper, function (args, ret) {
                if (!ret?.props) return ret;
                let children = ret.props.children;
                if (!Array.isArray(children)) children = [children];
                children.push(React.createElement(DraggableAIButton, { key: "ai-assistant-btn" }));
                ret.props.children = children;
                return ret;
            }));
            return true;
        } catch (e) {
            console.error("[AIChat] Patch failed:", e);
            return false;
        }
    }

    // ====================== НАСТРОЙКИ ======================

    function Settings() {
        const [apiKey, setApiKey] = React.useState(storage.apiKey || "");
        const [model, setModel] = React.useState(storage.model || "gpt-4o-mini");
        const [sysp, setSysp] = React.useState(storage.sysPrompt || "");
        const [modalVisible, setModalVisible] = React.useState(false);

        const save = () => {
            storage.apiKey = apiKey;
            storage.model = model;
            storage.sysPrompt = sysp;
            showToast("✅ Настройки сохранены");
        };

        const currentModelLabel = MODELS.find(m => m.value === model)?.label || model;

        return React.createElement(ScrollView, null,
            React.createElement(Forms.FormSection, { title: "API" },
                React.createElement(Forms.FormInput, {
                    title: "API Key (onlysq.ru)",
                    placeholder: "sk-...",
                    value: apiKey,
                    onChange: setApiKey,
                    secureTextEntry: true
                }),
                React.createElement(Forms.FormRow, {
                    label: "Модель",
                    subLabel: currentModelLabel,
                    trailing: Forms.FormRow.Arrow,
                    onPress: () => setModalVisible(true)
                })
            ),
            React.createElement(Forms.FormSection, { title: "System Prompt" },
                React.createElement(Forms.FormInput, {
                    title: "Инструкция для ИИ",
                    value: sysp,
                    onChange: setSysp,
                    multiline: true,
                    placeholder: "Ты полезный помощник..."
                })
            ),
            React.createElement(Forms.FormSection, null,
                React.createElement(Forms.FormRow, { label: "💾 Сохранить изменения", onPress: save })
            ),

            // Выбор модели
            React.createElement(Modal, { visible: modalVisible, transparent: true, animationType: "fade", onRequestClose: () => setModalVisible(false) },
                React.createElement(Pressable, { style: {flex:1, backgroundColor:"rgba(0,0,0,0.85)", justifyContent:"center"}, onPress: () => setModalVisible(false) },
                    React.createElement(Pressable, { style: {backgroundColor:"#2b2d31", margin:20, borderRadius:16, padding:20, maxHeight:"70%"}, onPress: e => e.stopPropagation() },
                        React.createElement(Text, {style:{color:"#fff", fontSize:20, fontWeight:"700", marginBottom:16}}, "Выберите модель"),
                        React.createElement(ScrollView, null,
                            MODELS.map(m => 
                                React.createElement(Pressable, {
                                    key: m.value,
                                    style: {
                                        padding: 14,
                                        borderBottomWidth: 1,
                                        borderBottomColor: "#3f4147",
                                        backgroundColor: model === m.value ? "#4752c4" : "transparent"
                                    },
                                    onPress: () => { setModel(m.value); setModalVisible(false); }
                                },
                                    React.createElement(Text, { style: {color: model === m.value ? "#fff" : "#b5bac1", fontSize: 16} }, m.label)
                                )
                            )
                        )
                    )
                )
            )
        );
    }

    function onLoad() {
        if (!patchChatBar()) {
            showToast("⚠️ Не удалось добавить кнопку AI");
        } else {
            showToast("✨ AI Assistant загружен");
        }
    }

    function onUnload() {
        patches.forEach(u => { try { u(); } catch(e){} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})()
