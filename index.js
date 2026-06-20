(function () {
    "use strict";

    const { React, ReactNative } = vendetta.metro.common;
    const { View, Text, Modal, Pressable, TextInput, ScrollView, Animated, PanResponder, Clipboard } = ReactNative;
    const { findByName } = vendetta.metro;
    const { after } = vendetta.patcher;
    const { showToast } = vendetta.ui.toasts;
    const { FormSection, FormInput, FormRow } = vendetta.ui.components.Forms;

    const storage = vendetta.plugin.storage;

    // Дефолтные настройки
    if (!storage.apiKey) storage.apiKey = "";
    if (!storage.model) storage.model = "gpt-4o-mini";
    if (!storage.sysPrompt) storage.sysPrompt = "Ты полезный помощник. Отвечай кратко, точно и по делу.";

    const MODELS = [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Gemini 3.5 Flash", value: "gemini-3.5-flash" }
    ];

    let patches = [];

    async function askAI(query, history) {
        if (!storage.apiKey?.trim()) throw new Error("API ключ не указан");

        const messages = [
            { role: "system", content: storage.sysPrompt },
            ...history.slice(-10),
            { role: "user", content: query }
        ];

        const response = await fetch("https://api.onlysq.ru/ai/openai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${storage.apiKey.trim()}`
            },
            body: JSON.stringify({
                model: storage.model,
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.text().catch(() => "Unknown error");
            throw new Error(`API Error ${response.status}: ${error}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || "Нет ответа от ИИ";
    }

    // ==================== МОДАЛЬНОЕ ОКНО ====================
    function AIChatModal({ visible, onClose }) {
        const [input, setInput] = React.useState("");
        const [history, setHistory] = React.useState([]);
        const [loading, setLoading] = React.useState(false);
        const scrollRef = React.useRef(null);

        const sendMessage = async () => {
            const text = input.trim();
            if (!text || loading) return;

            const userMessage = { role: "user", content: text };
            setHistory(prev => [...prev, userMessage]);
            setInput("");
            setLoading(true);

            try {
                const reply = await askAI(text, history);
                setHistory(prev => [...prev, { role: "assistant", content: reply }]);
            } catch (err) {
                setHistory(prev => [...prev, { role: "assistant", content: `❌ ${err.message}` }]);
            } finally {
                setLoading(false);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            }
        };

        return React.createElement(Modal, {
            visible: visible,
            transparent: true,
            animationType: "slide",
            onRequestClose: onClose
        },
            React.createElement(Pressable, {
                style: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" },
                onPress: onClose
            },
                React.createElement(Pressable, {
                    style: {
                        backgroundColor: "#1e1f22",
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        maxHeight: "80%",
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
                            ? React.createElement(Text, { style: { color: "#80848e", textAlign: "center", marginTop: 50 } }, "Напишите что-нибудь...")
                            : history.map((msg, index) =>
                                React.createElement(View, {
                                    key: index,
                                    style: {
                                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                                        maxWidth: "85%",
                                        backgroundColor: msg.role === "user" ? "#5865f2" : "#2b2d31",
                                        padding: 12,
                                        borderRadius: 18,
                                        marginVertical: 6
                                    }
                                },
                                    React.createElement(Text, { style: { color: "#fff" } }, msg.content)
                                )
                            ),
                        loading && React.createElement(Text, { style: { color: "#fff", opacity: 0.7, marginVertical: 8 } }, "⏳ Думаю...")
                    ),

                    React.createElement(View, { style: { flexDirection: "row" } },
                        React.createElement(TextInput, {
                            style: {
                                flex: 1,
                                backgroundColor: "#2b2d31",
                                color: "#fff",
                                borderRadius: 22,
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                marginRight: 8,
                                maxHeight: 120
                            },
                            placeholder: "Сообщение...",
                            placeholderTextColor: "#72767d",
                            value: input,
                            onChangeText: setInput,
                            multiline: true,
                            onSubmitEditing: sendMessage
                        }),
                        React.createElement(Pressable, {
                            style: {
                                backgroundColor: "#5865f2",
                                width: 52,
                                height: 52,
                                borderRadius: 26,
                                justifyContent: "center",
                                alignItems: "center"
                            },
                            onPress: sendMessage
                        },
                            React.createElement(Text, { style: { color: "#fff", fontSize: 24 } }, "↑")
                        )
                    )
                )
            )
        );
    }

    // Плавающая кнопка
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
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: "#5865f2",
                    justifyContent: "center",
                    alignItems: "center"
                }
            },
                React.createElement(Pressable, { onPress: () => setVisible(true) },
                    React.createElement(Text, { style: { fontSize: 28 } }, "✨")
                )
            ),
            React.createElement(AIChatModal, { visible, onClose: () => setVisible(false) })
        );
    }

    // Патч
    function onLoad() {
        try {
            const ChatInput = findByName("ChatInputGuardWrapper", false);
            if (ChatInput) {
                patches.push(after("default", ChatInput, (_, ret) => {
                    if (ret?.props?.children) {
                        const children = Array.isArray(ret.props.children) ? ret.props.children : [ret.props.children];
                        children.push(React.createElement(DraggableAIButton));
                        ret.props.children = children;
                    }
                    return ret;
                }));
                showToast("AI Assistant загружен");
            }
        } catch (e) {
            showToast("Ошибка загрузки AI");
        }
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
    }

    // ==================== НАСТРОЙКИ ====================
    function Settings() {
        const [apiKey, setApiKey] = React.useState(storage.apiKey || "");
        const [model, setModel] = React.useState(storage.model || "gpt-4o-mini");
        const [sysPrompt, setSysPrompt] = React.useState(storage.sysPrompt || "");
        const [showModelModal, setShowModelModal] = React.useState(false);

        const saveSettings = () => {
            storage.apiKey = apiKey;
            storage.model = model;
            storage.sysPrompt = sysPrompt;
            showToast("✅ Настройки сохранены");
        };

        return React.createElement(ScrollView, { style: { flex: 1, padding: 16 } },
            React.createElement(FormSection, { title: "API" },
                React.createElement(FormInput, {
                    title: "API Key",
                    placeholder: "sk-...",
                    value: apiKey,
                    onChange: setApiKey,
                    secureTextEntry: true
                }),
                React.createElement(FormRow, {
                    label: "Модель",
                    subLabel: MODELS.find(m => m.value === model)?.label || model,
                    trailing: FormRow.Arrow,
                    onPress: () => setShowModelModal(true)
                })
            ),
            React.createElement(FormSection, { title: "System Prompt" },
                React.createElement(FormInput, {
                    title: "Инструкция ИИ",
                    value: sysPrompt,
                    onChange: setSysPrompt,
                    multiline: true
                })
            ),
            React.createElement(FormRow, {
                label: "💾 Сохранить настройки",
                onPress: saveSettings
            }),

            // Модальное окно моделей
            React.createElement(Modal, {
                visible: showModelModal,
                transparent: true,
                animationType: "fade",
                onRequestClose: () => setShowModelModal(false)
            },
                React.createElement(Pressable, {
                    style: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
                    onPress: () => setShowModelModal(false)
                },
                    React.createElement(View, {
                        style: { backgroundColor: "#2b2d31", borderRadius: 16, padding: 20, width: "80%" }
                    },
                        React.createElement(Text, { style: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 } }, "Выберите модель"),
                        ...MODELS.map(m =>
                            React.createElement(Pressable, {
                                key: m.value,
                                style: {
                                    padding: 14,
                                    backgroundColor: model === m.value ? "#4752c4" : "transparent",
                                    borderRadius: 8,
                                    marginBottom: 6
                                },
                                onPress: () => {
                                    setModel(m.value);
                                    setShowModelModal(false);
                                }
                            },
                                React.createElement(Text, { style: { color: "#fff" } }, m.label)
                            )
                        )
                    )
                )
            )
        );
    }

    return { onLoad, onUnload, settings: Settings };
})();
