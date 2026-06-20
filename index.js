(function () {
    "use strict";

    var common = vendetta.metro.common;
    var React = common.React;
    var RN = common.ReactNative;
    var { View, Text, Modal, Pressable, TextInput, ScrollView, Animated, PanResponder, Clipboard } = RN;

    var metro = vendetta.metro;
    var findByName = metro.findByName;

    var patcher = vendetta.patcher;
    var after = patcher.after;

    var showToast = vendetta.ui.toasts.showToast;
    var Forms = vendetta.ui.components.Forms;

    var storage = vendetta.plugin.storage;

    if (!storage.apiKey) storage.apiKey = "";
    if (!storage.model) storage.model = "gpt-4o-mini";
    if (!storage.sysPrompt) storage.sysPrompt = "Ты полезный помощник. Отвечай кратко и по делу.";

    const MODELS = [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" }
    ];

    var patches = [];

    async function askAI(query, history) {
        if (!storage.apiKey?.trim()) throw new Error("Введите API ключ");

        const messages = [
            { role: "system", content: storage.sysPrompt },
            ...history.slice(-12),
            { role: "user", content: query }
        ];

        const res = await fetch("https://api.onlysq.ru/ai/openai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + storage.apiKey.trim()
            },
            body: JSON.stringify({
                model: storage.model,
                messages: messages,
                max_tokens: 900,
                temperature: 0.7
            })
        });

        if (!res.ok) {
            const err = await res.text().catch(() => "");
            throw new Error(`API ${res.status}: ${err}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "Нет ответа";
    }

    function AIChatModal({ visible, onClose }) {
        const [input, setInput] = React.useState("");
        const [history, setHistory] = React.useState([]);
        const [loading, setLoading] = React.useState(false);
        const scrollRef = React.useRef(null);

        async function send() {
            const q = input.trim();
            if (!q || loading) return;

            const userMsg = { role: "user", content: q };
            setHistory(prev => [...prev, userMsg]);
            setInput("");
            setLoading(true);

            try {
                const answer = await askAI(q, history);
                setHistory(prev => [...prev, { role: "assistant", content: answer }]);
            } catch (e) {
                setHistory(prev => [...prev, { role: "assistant", content: "❌ " + e.message }]);
            } finally {
                setLoading(false);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
            }
        }

        return React.createElement(Modal, { visible, transparent: true, animationType: "slide", onRequestClose: onClose },
            React.createElement(Pressable, { 
                style: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }, 
                onPress: onClose 
            },
                React.createElement(Pressable, { 
                    style: { 
                        backgroundColor: "#1e1f22", 
                        borderTopLeftRadius: 24, 
                        borderTopRightRadius: 24, 
                        maxHeight: "75%", 
                        padding: 16 
                    }, 
                    onPress: e => e.stopPropagation() 
                },

                    React.createElement(Text, { style: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 12 } }, "✨ AI Assistant"),

                    React.createElement(ScrollView, { 
                        ref: scrollRef, 
                        style: { flex: 1, marginBottom: 12 } 
                    },
                        history.length === 0 
                            ? React.createElement(Text, { style: { color: "#80848e", textAlign: "center", marginTop: 40 } }, "Напишите сообщение...")
                            : history.map((m, i) => 
                                React.createElement(View, {
                                    key: i,
                                    style: {
                                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                                        maxWidth: "88%",
                                        backgroundColor: m.role === "user" ? "#5865f2" : "#2b2d31",
                                        padding: 13,
                                        borderRadius: 18,
                                        marginVertical: 5
                                    }
                                },
                                    React.createElement(Text, { style: { color: "#fff", fontSize: 15.5 } }, m.content)
                                )
                            ),
                        loading && React.createElement(View, { style: { alignSelf: "flex-start", backgroundColor: "#2b2d31", padding: 13, borderRadius: 18, marginVertical: 5 } },
                            React.createElement(Text, { style: { color: "#fff", opacity: 0.7 } }, "⏳ Думаю...")
                        )
                    ),

                    React.createElement(View, { style: { flexDirection: "row", alignItems: "flex-end" } },
                        React.createElement(TextInput, {
                            style: { 
                                flex: 1, 
                                backgroundColor: "#2b2d31", 
                                borderRadius: 22, 
                                paddingHorizontal: 16, 
                                paddingVertical: 12, 
                                color: "#fff", 
                                marginRight: 10,
                                maxHeight: 120
                            },
                            placeholder: "Сообщение...",
                            placeholderTextColor: "#72767d",
                            value: input,
                            onChangeText: setInput,
                            multiline: true,
                            onSubmitEditing: send
                        }),
                        React.createElement(Pressable, {
                            style: { 
                                backgroundColor: "#5865f2", 
                                width: 50, 
                                height: 50, 
                                borderRadius: 25, 
                                justifyContent: "center", 
                                alignItems: "center" 
                            },
                            onPress: send
                        },
                            React.createElement(Text, { style: { color: "#fff", fontSize: 26, fontWeight: "bold" } }, "↑")
                        )
                    )
                )
            )
        );
    }

    // Draggable Button
    function DraggableAIButton() {
        const [visible, setVisible] = React.useState(false);
        const pan = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

        const panResponder = React.useMemo(() => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => pan.flattenOffset()
        }), []);

        return React.createElement(View, { style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 } },
            React.createElement(Animated.View, {
                ...panResponder.panHandlers,
                style: {
                    position: "absolute",
                    right: 20,
                    bottom: 100,
                    width: 62,
                    height: 62,
                    borderRadius: 31,
                    backgroundColor: "#5865f2",
                    justifyContent: "center",
                    alignItems: "center",
                    transform: [{ translateX: pan.x }, { translateY: pan.y }]
                }
            },
                React.createElement(Pressable, { onPress: () => setVisible(true) },
                    React.createElement(Text, { style: { fontSize: 28 } }, "✨")
                )
            ),
            React.createElement(AIChatModal, { visible, onClose: () => setVisible(false) })
        );
    }

    function onLoad() {
        try {
            const ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
            if (ChatInputGuardWrapper) {
                patches.push(after("default", ChatInputGuardWrapper, (args, ret) => {
                    if (ret?.props) {
                        let children = ret.props.children || [];
                        if (!Array.isArray(children)) children = [children];
                        children.push(React.createElement(DraggableAIButton));
                        ret.props.children = children;
                    }
                    return ret;
                }));
                showToast("✨ AI Assistant загружен");
            }
        } catch (e) {
            showToast("Ошибка загрузки");
        }
    }

    function onUnload() {
        patches.forEach(u => { try { u(); } catch {} });
    }

    return { onLoad, onUnload, settings: () => React.createElement(Text, null, "Настройки в разработке (временно)") };
})()
