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

    // === НАСТРОЙКИ ===
    if (!storage.apiKey) storage.apiKey = "";
    if (!storage.model) storage.model = "gpt-4o-mini";
    if (!storage.sysPrompt) storage.sysPrompt = "Ты полезный помощник. Отвечай кратко и точно.";

    const MODELS = [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" }
    ];

    var patches = [];

    async function askAI(query, channelId, history) {
        if (!storage.apiKey?.trim()) {
            throw new Error("Введите API ключ в настройках плагина");
        }

        const messages = [
            { role: "system", content: storage.sysPrompt },
            ... (history || []).slice(-10),
            { role: "user", content: query }
        ];

        console.log("[AIChat] Sending request with model:", storage.model);

        const res = await fetch("https://api.onlysq.ru/ai/openai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + storage.apiKey.trim()
            },
            body: JSON.stringify({
                model: storage.model,
                messages: messages,
                max_tokens: 800,
                temperature: 0.7
            })
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "No details");
            console.error("[AIChat] Full error:", res.status, errorText);
            throw new Error(`Ошибка ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "Нет ответа";
    }

    // ==================== UI ====================

    const SparklesIcon = ({ color = "#fff", size = 24 }) => React.createElement(RN.Image, {
        source: { uri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23${color.replace('#','')}"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>` },
        style: { width: size, height: size }
    });

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
            setHistory(prev => [...prev, { role: "user", content: q }]);

            try {
                const answer = await askAI(q, null, history);
                setHistory(prev => [...prev, { role: "assistant", content: answer }]);
            } catch (e) {
                setHistory(prev => [...prev, { role: "assistant", content: "❌ " + e.message }]);
            } finally {
                setLoading(false);
                setTimeout(() => scrollRef.current?.scrollToEnd(), 100);
            }
        }

        return React.createElement(Modal, { visible, transparent: true, animationType: "slide", onRequestClose: onClose },
            React.createElement(Pressable, { style: {flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end"}, onPress: onClose },
                React.createElement(Pressable, { style: {backgroundColor: "#1e1f22", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", padding: 16}, onPress: e => e.stopPropagation() },
                    
                    React.createElement(Text, { style: {color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 12} }, "✨ AI Assistant"),

                    React.createElement(ScrollView, { ref: scrollRef, style: {flex: 1, marginBottom: 12} },
                        history.map((m, i) => React.createElement(View, {
                            key: i,
                            style: { alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: m.role === "user" ? "#5865f2" : "#2b2d31", padding: 12, borderRadius: 18, marginVertical: 6 }
                        },
                            React.createElement(Text, { style: {color: "#fff"} }, m.content)
                        )),
                        loading && React.createElement(Text, { style: {color: "#fff", opacity: 0.6} }, "⏳ Думаю...")
                    ),

                    React.createElement(View, { style: {flexDirection: "row"} },
                        React.createElement(TextInput, {
                            style: {flex: 1, backgroundColor: "#2b2d31", borderRadius: 20, padding: 12, color: "#fff", marginRight: 8},
                            placeholder: "Сообщение...",
                            placeholderTextColor: "#72767d",
                            value: input,
                            onChangeText: setInput,
                            multiline: true
                        }),
                        React.createElement(Pressable, { style: {backgroundColor: "#5865f2", width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center"}, onPress: send },
                            React.createElement(Text, { style: {color: "#fff", fontSize: 24} }, "↑")
                        )
                    )
                )
            )
        );
    }

    function DraggableAIButton() {
        const [visible, setVisible] = React.useState(false);
        const pan = React.useRef(new Animated.ValueXY({x: 0, y: 0})).current;

        const panResponder = React.useMemo(() => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: Animated.event([null, {dx: pan.x, dy: pan.y}], {useNativeDriver: false}),
            onPanResponderRelease: () => pan.flattenOffset()
        }), []);

        return React.createElement(View, {style: {position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999}},
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
                    alignItems: "center",
                    transform: [{translateX: pan.x}, {translateY: pan.y}]
                }
            },
                React.createElement(Pressable, {onPress: () => setVisible(true)},
                    React.createElement(SparklesIcon, {size: 32, color: "#fff"})
                )
            ),
            React.createElement(AIChatModal, {visible, onClose: () => setVisible(false)})
        );
    }

    function onLoad() {
        try {
            var ChatInputGuardWrapper = findByName("ChatInputGuardWrapper", false);
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
            showToast("⚠️ Ошибка загрузки");
        }
    }

    function onUnload() {
        patches.forEach(u => { try { u(); } catch(e){} });
    }

    return { onLoad, onUnload, settings: () => React.createElement(Text, null, "Настройки в разработке") };
})()
