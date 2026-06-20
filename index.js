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
    if (!storage.sysPrompt) storage.sysPrompt = "Ты полезный помощник. Отвечай кратко и точно.";
    if (!storage.btnPos) storage.btnPos = { x: -20, y: -100 };

    const MODELS = [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" }
    ];

    var patches = [];

    // --- Логика ИИ ---
    async function askAI(query, history) {
        if (!storage.apiKey) throw new Error("Укажите API ключ в настройках");

        var messages = [{ role: "system", content: storage.sysPrompt }];
        (history || []).slice(-15).forEach(m => messages.push({ role: m.role, content: m.content }));
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
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!res.ok) {
            var errorText = await res.text().catch(() => "");
            throw new Error(`API Error ${res.status}: ${errorText}`);
        }
        
        var data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "(пустой ответ)";
    }

    // --- UI ---
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
            const newHistory = [...history, { role: "user", content: q }];
            setHistory(newHistory);

            try {
                const answer = await askAI(q, newHistory);
                setHistory(prev => [...prev, { role: "assistant", content: answer }]);
            } catch (e) {
                setHistory(prev => [...prev, { role: "assistant", content: "❌ " + e.message }]);
            } finally {
                setLoading(false);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            }
        }

        const s = {
            overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
            sheet: { backgroundColor: "#1e1f22", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", padding: 16 },
            header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
            title: { color: "#fff", fontSize: 20, fontWeight: "700" },
            bubbleUser: { alignSelf: "flex-end", backgroundColor: "#5865f2", borderRadius: 18, padding: 12, maxWidth: "85%" },
            bubbleAi: { alignSelf: "flex-start", backgroundColor: "#2b2d31", borderRadius: 18, padding: 12, maxWidth: "85%" },
            text: { color: "#dbdee1", fontSize: 15.5, lineHeight: 22 },
            inputArea: { flexDirection: "row", alignItems: "flex-end", marginTop: 12 },
            input: { flex: 1, backgroundColor: "#2b2d31", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: "#fff", marginRight: 10 },
            sendBtn: { backgroundColor: "#5865f2", width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" }
        };

        return React.createElement(Modal, { visible, transparent: true, animationType: "slide", onRequestClose: onClose },
            React.createElement(Pressable, { style: s.overlay, onPress: onClose },
                React.createElement(Pressable, { style: s.sheet, onPress: e => e.stopPropagation() },
                    React.createElement(View, { style: s.header },
                        React.createElement(Text, { style: s.title }, "✨ AI Assistant"),
                        React.createElement(Pressable, { onPress: () => setHistory([]) },
                            React.createElement(Text, { style: { color: "#ed4245" } }, "Очистить")
                        )
                    ),
                    React.createElement(ScrollView, { ref: scrollRef, style: { flex: 1 } },
                        history.map((m, i) => 
                            React.createElement(View, { 
                                key: i, 
                                style: [m.role === "user" ? s.bubbleUser : s.bubbleAi, { marginVertical: 6 }] 
                            },
                                React.createElement(Text, { style: s.text }, m.content)
                            )
                        ),
                        loading && React.createElement(View, { style: s.bubbleAi },
                            React.createElement(Text, { style: s.text }, "⏳ Думаю...")
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
                            onSubmitEditing: send
                        }),
                        React.createElement(Pressable, { style: s.sendBtn, onPress: send },
                            React.createElement(Text, { style: { color: "#fff", fontSize: 22 } }, "↑")
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
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                storage.btnPos = { x: pan.x._value, y: pan.y._value };
            }
        }), [pan]);

        return React.createElement(View, { pointerEvents: "box-none", style: { position: 'absolute', top:0, left:0, right:0, bottom:0, zIndex: 9999 } },
            React.createElement(Animated.View, { ...panResponder.panHandlers, style: {
                position: 'absolute', right: 20, bottom: 100, width: 56, height: 56,
                borderRadius: 28, backgroundColor: '#5865f2', justifyContent: 'center', alignItems: 'center',
                transform: [{ translateX: pan.x }, { translateY: pan.y }]
            }},
                React.createElement(Pressable, { onPress: () => setVisible(true) },
                    React.createElement(SparklesIcon, { size: 28, color: "#fff" })
                )
            ),
            React.createElement(AIChatModal, { visible, onClose: () => setVisible(false) })
        );
    }

    function patchChatBar() {
        try {
            var ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
            if (!ChatInputGuardWrapper) return false;

            patches.push(after("default", ChatInputGuardWrapper, function (args, ret) {
                if (!ret || !ret.props) return ret;
                let children = ret.props.children;
                if (!Array.isArray(children)) children = [children];
                children.push(React.createElement(DraggableAIButton, { key: "ai-btn" }));
                ret.props.children = children;
                return ret;
            }));
            return true;
        } catch (e) { return false; }
    }

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

        return React.createElement(ScrollView, null,
            React.createElement(Forms.FormSection, { title: "API" },
                React.createElement(Forms.FormInput, {
                    title: "API Key",
                    placeholder: "sk-...",
                    value: apiKey,
                    onChange: setApiKey,
                    secureTextEntry: true
                }),
                React.createElement(Forms.FormRow, {
                    label: "Модель",
                    subLabel: MODELS.find(m => m.value === model)?.label || model,
                    trailing: Forms.FormRow.Arrow,
                    onPress: () => setModalVisible(true)
                })
            ),
            React.createElement(Forms.FormSection, { title: "System Prompt" },
                React.createElement(Forms.FormInput, {
                    title: "Инструкция",
                    value: sysp,
                    onChange: setSysp,
                    multiline: true
                })
            ),
            React.createElement(Forms.FormRow, { label: "💾 Сохранить", onPress: save })
        );
    }

    function onLoad() {
        if (patchChatBar()) {
            showToast("✨ AI Assistant загружен");
        } else {
            showToast("⚠️ Не удалось загрузить кнопку");
        }
    }

    function onUnload() {
        patches.forEach(u => { try { u(); } catch(e){} });
    }

    return { onLoad, onUnload, settings: Settings };
})()
