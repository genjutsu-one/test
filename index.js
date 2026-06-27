(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName, findByStoreName } = vendetta.metro;
    const { after, instead, before } = vendetta.patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms, General } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;
    if (typeof storage.enabled === "undefined") storage.enabled = true;
    if (typeof storage.showFakeToast === "undefined") storage.showFakeToast = true;

    let patches = [];

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function getGuildId() {
        try { return findByProps("getGuildId")?.getGuildId?.() || null; } catch { return null; }
    }

    function hasRealPermissions(guildId) {
        try {
            const MemberStore = findByProps("getSelfMember");
            const Perms = findByProps("Permissions");
            if (!MemberStore || !Perms || !guildId) return false;
            const member = MemberStore.getSelfMember(guildId);
            if (!member?.permissions) return false;
            const p = BigInt(member.permissions);
            return !!(p & BigInt(Perms.MODERATE_MEMBERS || 0n)) ||
                   !!(p & BigInt(Perms.KICK_MEMBERS || 0n)) ||
                   !!(p & BigInt(Perms.BAN_MEMBERS || 0n)) ||
                   !!(p & BigInt(Perms.MANAGE_MESSAGES || 0n)) ||
                   !!(p & BigInt(Perms.ADMINISTRATOR || 0n));
        } catch { return false; }
    }

    function getGuildData(guildId) {
        try {
            const GuildStore = findByProps("getGuild", "getGuilds");
            return GuildStore?.getGuild?.(guildId) || null;
        } catch { return null; }
    }

    function getMembers(guildId) {
        try {
            const MemberStore = findByProps("getMembers", "getMember");
            const members = MemberStore?.getMembers?.(guildId) || [];
            const UserStore = findByProps("getUser", "getCurrentUser");
            return members.map(m => {
                const user = UserStore?.getUser?.(m.userId) || {};
                return { ...m, username: user.username || m.userId, avatar: user.avatar, discriminator: user.discriminator };
            });
        } catch { return []; }
    }

    function getRoles(guildId) {
        try {
            const RoleStore = findByProps("getRoles");
            const roles = RoleStore?.getRoles?.(guildId) || {};
            return Object.values(roles).sort((a, b) => b.position - a.position);
        } catch { return []; }
    }

    function getBans(guildId) {
        try {
            const BanStore = findByProps("getBans", "isBanned");
            return Object.values(BanStore?.getBans?.(guildId) || {});
        } catch { return []; }
    }

    function getInvites(guildId) {
        try {
            const InviteStore = findByProps("getInvites", "getGuildInvites");
            return Object.values(InviteStore?.getInvites?.(guildId) || InviteStore?.getGuildInvites?.(guildId) || {});
        } catch { return []; }
    }

    // ─── Colour utils ──────────────────────────────────────────────────────────

    function intToHex(color) {
        if (!color) return "#99aab5";
        return "#" + color.toString(16).padStart(6, "0");
    }

    // ─── Shared styles ─────────────────────────────────────────────────────────

    const S = {
        screen: { flex: 1, backgroundColor: "#111214" },
        header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1f22", padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
        backBtn: { color: "#5865f2", fontSize: 16, fontWeight: "600", paddingRight: 8 },
        section: { marginTop: 20, marginHorizontal: 16, marginBottom: 4 },
        sectionLabel: { color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
        card: { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, overflow: "hidden" },
        row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        rowLast: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
        rowLabel: { color: "#dbdee1", fontSize: 16, flex: 1 },
        rowIcon: { fontSize: 20, marginRight: 14 },
        rowArrow: { color: "#b5bac1", fontSize: 18 },
        badge: { backgroundColor: "#5865f2", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
        badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
        avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center", marginRight: 12 },
        avatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
        memberName: { color: "#dbdee1", fontSize: 15, fontWeight: "600" },
        memberSub: { color: "#b5bac1", fontSize: 12, marginTop: 1 },
        roleDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
        roleName: { color: "#dbdee1", fontSize: 15, flex: 1 },
        roleMeta: { color: "#b5bac1", fontSize: 12 },
        serverIconBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center", marginRight: 16 },
        serverIconText: { color: "#fff", fontSize: 22, fontWeight: "700" },
        overviewName: { color: "#fff", fontSize: 20, fontWeight: "700" },
        overviewSub: { color: "#b5bac1", fontSize: 13, marginTop: 2 },
        statsRow: { flexDirection: "row", marginTop: 16, gap: 12 },
        statBox: { flex: 1, backgroundColor: "#1e1f22", borderRadius: 8, padding: 12, alignItems: "center" },
        statNum: { color: "#fff", fontSize: 22, fontWeight: "700" },
        statLabel: { color: "#b5bac1", fontSize: 11, marginTop: 2 },
        emptyText: { color: "#b5bac1", textAlign: "center", marginTop: 32, fontSize: 15 },
        searchBox: { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, color: "#dbdee1", fontSize: 15, borderWidth: 1, borderColor: "#2b2d31" },
        fakeTag: { backgroundColor: "#ed4245", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
        fakeTagText: { color: "#fff", fontSize: 9, fontWeight: "700" },
        auditRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        auditAction: { color: "#dbdee1", fontSize: 14, fontWeight: "600" },
        auditMeta: { color: "#b5bac1", fontSize: 12, marginTop: 2 },
    };

    // ─── Sub-screens ───────────────────────────────────────────────────────────

    // Members list
    function MembersScreen({ guildId, onBack }) {
        const [search, setSearch] = React.useState("");
        const allMembers = React.useMemo(() => getMembers(guildId), [guildId]);
        const filtered = allMembers.filter(m =>
            !search || (m.username || "").toLowerCase().includes(search.toLowerCase())
        );

        return React.createElement(RN.View, { style: S.screen },
            // Header
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Участники"),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            // Search
            React.createElement(RN.TextInput, {
                style: [S.searchBox, { marginTop: 12 }],
                placeholder: "Поиск участников...",
                placeholderTextColor: "#72767d",
                value: search,
                onChangeText: setSearch
            }),
            // List
            filtered.length === 0
                ? React.createElement(RN.Text, { style: S.emptyText }, "Нет участников")
                : React.createElement(RN.FlatList, {
                    data: filtered,
                    keyExtractor: (m, i) => m.userId || String(i),
                    renderItem: ({ item: m }) => {
                        const initials = (m.username || "?").slice(0, 2).toUpperCase();
                        const topRole = m.roles && m.roles.length > 0
                            ? getRoles(guildId).find(r => m.roles.includes(r.id))
                            : null;
                        return React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2b2d31" } },
                            React.createElement(RN.View, { style: [S.avatar, topRole ? { backgroundColor: intToHex(topRole.color) } : {}] },
                                React.createElement(RN.Text, { style: S.avatarText }, initials)
                            ),
                            React.createElement(RN.View, { style: { flex: 1 } },
                                React.createElement(RN.Text, { style: S.memberName }, m.username || m.userId),
                                topRole
                                    ? React.createElement(RN.Text, { style: S.memberSub }, topRole.name)
                                    : React.createElement(RN.Text, { style: S.memberSub }, "Нет ролей")
                            )
                        );
                    }
                })
        );
    }

    // Roles list
    function RolesScreen({ guildId, onBack }) {
        const roles = React.useMemo(() => getRoles(guildId), [guildId]);

        return React.createElement(RN.View, { style: S.screen },
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Роли"),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            roles.length === 0
                ? React.createElement(RN.Text, { style: S.emptyText }, "Роли не найдены")
                : React.createElement(RN.FlatList, {
                    style: { marginTop: 8 },
                    data: roles,
                    keyExtractor: r => r.id,
                    renderItem: ({ item: r }) =>
                        React.createElement(RN.View, { style: S.row },
                            React.createElement(RN.View, { style: [S.roleDot, { backgroundColor: intToHex(r.color) }] }),
                            React.createElement(RN.Text, { style: S.roleName }, r.name),
                            React.createElement(RN.Text, { style: S.roleMeta }, `Поз. ${r.position}`)
                        )
                })
        );
    }

    // Bans list
    function BansScreen({ guildId, onBack }) {
        const bans = React.useMemo(() => getBans(guildId), [guildId]);

        return React.createElement(RN.View, { style: S.screen },
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Баны"),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            bans.length === 0
                ? React.createElement(RN.Text, { style: S.emptyText }, "Список банов пуст\n(или нет прав для просмотра)")
                : React.createElement(RN.FlatList, {
                    style: { marginTop: 8 },
                    data: bans,
                    keyExtractor: (b, i) => b.user?.id || String(i),
                    renderItem: ({ item: b }) => {
                        const initials = (b.user?.username || "?").slice(0, 2).toUpperCase();
                        return React.createElement(RN.View, { style: S.row },
                            React.createElement(RN.View, { style: S.avatar },
                                React.createElement(RN.Text, { style: S.avatarText }, initials)
                            ),
                            React.createElement(RN.View, { style: { flex: 1 } },
                                React.createElement(RN.Text, { style: S.memberName }, b.user?.username || b.user?.id || "Неизвестно"),
                                b.reason
                                    ? React.createElement(RN.Text, { style: S.memberSub }, `Причина: ${b.reason}`)
                                    : React.createElement(RN.Text, { style: S.memberSub }, "Причина не указана")
                            )
                        );
                    }
                })
        );
    }

    // Fake Audit Log
    const FAKE_AUDIT = [
        { icon: "🔨", action: "Пользователь забанен", who: "Модератор #1", target: "user#1234", time: "Только что" },
        { icon: "👢", action: "Пользователь кикнут", who: "Модератор #2", target: "user#5678", time: "2 мин. назад" },
        { icon: "⏱️", action: "Выдан тайм-аут", who: "Модератор #1", target: "user#9012", time: "10 мин. назад" },
        { icon: "✏️", action: "Канал изменён", who: "Администратор", target: "#general", time: "1 час назад" },
        { icon: "🔑", action: "Роль создана", who: "Администратор", target: "Muted", time: "3 часа назад" },
        { icon: "📌", action: "Сообщение закреплено", who: "Модератор #3", target: "#announcements", time: "Вчера" },
        { icon: "🗑️", action: "Сообщение удалено", who: "Модератор #1", target: "#general", time: "Вчера" },
    ];

    function AuditLogScreen({ guildId, onBack }) {
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Журнал аудита"),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            // Fake badge
            React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, backgroundColor: "#2b2d31", borderRadius: 6, padding: 8 } },
                React.createElement(RN.Text, { style: { color: "#faa61a", fontSize: 13 } }, "⚠️  Это демо-данные. Реальный журнал требует прав администратора.")
            ),
            React.createElement(RN.FlatList, {
                style: { marginTop: 8 },
                data: FAKE_AUDIT,
                keyExtractor: (_, i) => String(i),
                renderItem: ({ item }) =>
                    React.createElement(RN.View, { style: S.auditRow },
                        React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center" } },
                            React.createElement(RN.Text, { style: { fontSize: 18, marginRight: 10 } }, item.icon),
                            React.createElement(RN.View, null,
                                React.createElement(RN.Text, { style: S.auditAction }, item.action),
                                React.createElement(RN.Text, { style: S.auditMeta }, `${item.who} → ${item.target}`),
                                React.createElement(RN.Text, { style: [S.auditMeta, { marginTop: 1 }] }, item.time)
                            )
                        )
                    )
            })
        );
    }

    // Overview screen
    function OverviewScreen({ guildId, onBack }) {
        const guild = getGuildData(guildId);
        const members = getMembers(guildId);
        const roles = getRoles(guildId);
        const name = guild?.name || "Сервер";
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();

        return React.createElement(RN.ScrollView, { style: S.screen },
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Обзор"),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            React.createElement(RN.View, { style: { padding: 16 } },
                // Server info block
                React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 16 } },
                    React.createElement(RN.View, { style: S.serverIconBox },
                        React.createElement(RN.Text, { style: S.serverIconText }, initials)
                    ),
                    React.createElement(RN.View, null,
                        React.createElement(RN.Text, { style: S.overviewName }, name),
                        React.createElement(RN.Text, { style: S.overviewSub }, `ID: ${guildId || "—"}`),
                        guild?.description
                            ? React.createElement(RN.Text, { style: [S.overviewSub, { marginTop: 4 }] }, guild.description)
                            : null
                    )
                ),
                // Stats
                React.createElement(RN.View, { style: S.statsRow },
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, members.length || "—"),
                        React.createElement(RN.Text, { style: S.statLabel }, "Участников")
                    ),
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, roles.length || "—"),
                        React.createElement(RN.Text, { style: S.statLabel }, "Ролей")
                    ),
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, guild?.approximatePresenceCount || "—"),
                        React.createElement(RN.Text, { style: S.statLabel }, "Онлайн")
                    )
                ),
                // Extra info
                React.createElement(RN.View, { style: [S.card, { marginTop: 16, marginHorizontal: 0 }] },
                    React.createElement(RN.View, { style: S.row },
                        React.createElement(RN.Text, { style: { fontSize: 18, marginRight: 12 } }, "🌍"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Регион"),
                        React.createElement(RN.Text, { style: S.roleMeta }, guild?.region || "auto")
                    ),
                    React.createElement(RN.View, { style: S.row },
                        React.createElement(RN.Text, { style: { fontSize: 18, marginRight: 12 } }, "✅"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Уровень верификации"),
                        React.createElement(RN.Text, { style: S.roleMeta }, guild?.verificationLevel ?? "—")
                    ),
                    React.createElement(RN.View, { style: S.rowLast },
                        React.createElement(RN.Text, { style: { fontSize: 18, marginRight: 12 } }, "🚀"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Буст-уровень"),
                        React.createElement(RN.Text, { style: S.roleMeta }, `Уровень ${guild?.premiumTier ?? 0}`)
                    )
                )
            )
        );
    }

    // Stub screen for unimplemented sections
    function StubScreen({ title, onBack }) {
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onBack },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, title),
                React.createElement(RN.View, { style: { width: 60 } })
            ),
            React.createElement(RN.View, { style: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 } },
                React.createElement(RN.Text, { style: { fontSize: 40, marginBottom: 16 } }, "🔒"),
                React.createElement(RN.Text, { style: { color: "#dbdee1", fontSize: 16, fontWeight: "700", marginBottom: 8 } }, "Нет доступа"),
                React.createElement(RN.Text, { style: { color: "#b5bac1", fontSize: 14, textAlign: "center", lineHeight: 20 } }, "Для просмотра этого раздела нужны права администратора на сервере. Визуал доступен, реальных прав нет.")
            )
        );
    }

    // ─── Main Server Settings Screen ───────────────────────────────────────────

    function FakeServerSettings({ guildId, onClose }) {
        const [screen, setScreen] = React.useState(null); // null = main menu

        const guild = getGuildData(guildId);
        const name = guild?.name || "Сервер";
        const members = getMembers(guildId);
        const roles = getRoles(guildId);
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();

        // Route to sub-screen
        if (screen === "members") return React.createElement(MembersScreen, { guildId, onBack: () => setScreen(null) });
        if (screen === "roles") return React.createElement(RolesScreen, { guildId, onBack: () => setScreen(null) });
        if (screen === "bans") return React.createElement(BansScreen, { guildId, onBack: () => setScreen(null) });
        if (screen === "audit") return React.createElement(AuditLogScreen, { guildId, onBack: () => setScreen(null) });
        if (screen === "overview") return React.createElement(OverviewScreen, { guildId, onBack: () => setScreen(null) });
        if (screen) return React.createElement(StubScreen, { title: screen, onBack: () => setScreen(null) });

        function Row({ icon, label, count, last, onPress }) {
            return React.createElement(RN.TouchableOpacity,
                { onPress: onPress || (() => setScreen(label)), activeOpacity: 0.7 },
                React.createElement(RN.View, { style: last ? S.rowLast : S.row },
                    React.createElement(RN.Text, { style: S.rowIcon }, icon),
                    React.createElement(RN.Text, { style: S.rowLabel }, label),
                    count != null && React.createElement(RN.View, { style: S.badge },
                        React.createElement(RN.Text, { style: S.badgeText }, String(count))
                    ),
                    React.createElement(RN.Text, { style: S.rowArrow }, "›")
                )
            );
        }

        return React.createElement(RN.View, { style: S.screen },
            // Header
            React.createElement(RN.View, { style: S.header },
                React.createElement(RN.TouchableOpacity, { onPress: onClose },
                    React.createElement(RN.Text, { style: { color: "#b5bac1", fontSize: 22, lineHeight: 24 } }, "✕")
                ),
                React.createElement(RN.Text, { style: S.headerTitle }, "Настройки сервера"),
                React.createElement(RN.View, { style: { width: 40 } })
            ),
            React.createElement(RN.ScrollView, null,
                // Server hero
                React.createElement(RN.View, { style: { alignItems: "center", paddingVertical: 20 } },
                    React.createElement(RN.View, { style: [S.serverIconBox, { width: 80, height: 80, borderRadius: 20 }] },
                        React.createElement(RN.Text, { style: [S.serverIconText, { fontSize: 28 }] }, initials)
                    ),
                    React.createElement(RN.Text, { style: [S.overviewName, { marginTop: 10, textAlign: "center" }] }, name),
                    // Fake Admin badge
                    React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center", marginTop: 6 } },
                        React.createElement(RN.View, { style: S.fakeTag },
                            React.createElement(RN.Text, { style: S.fakeTagText }, "FAKE ADMIN")
                        )
                    )
                ),

                // Settings section
                React.createElement(RN.View, { style: S.section },
                    React.createElement(RN.Text, { style: S.sectionLabel }, "Настройки")
                ),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon: "ℹ️", label: "Обзор", onPress: () => setScreen("overview") }),
                    React.createElement(Row, { icon: "🛡️", label: "Модерация" }),
                    React.createElement(Row, { icon: "📋", label: "Журнал аудита", onPress: () => setScreen("audit") }),
                    React.createElement(Row, { icon: "📁", label: "Каналы" }),
                    React.createElement(Row, { icon: "🔗", label: "Интеграции" }),
                    React.createElement(Row, { icon: "😀", label: "Emoji" }),
                    React.createElement(Row, { icon: "🎨", label: "Стикеры" }),
                    React.createElement(Row, { icon: "🔐", label: "Безопасность", last: true })
                ),

                // Community section
                React.createElement(RN.View, { style: S.section },
                    React.createElement(RN.Text, { style: S.sectionLabel }, "Сообщество")
                ),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon: "🏘️", label: "Включить сообщество", last: true })
                ),

                // User management
                React.createElement(RN.View, { style: S.section },
                    React.createElement(RN.Text, { style: S.sectionLabel }, "Управление пользователями")
                ),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon: "👥", label: "Участники", count: members.length || null, onPress: () => setScreen("members") }),
                    React.createElement(Row, { icon: "🏷️", label: "Роли", count: roles.length || null, onPress: () => setScreen("roles") }),
                    React.createElement(Row, { icon: "🔗", label: "Приглашения" }),
                    React.createElement(Row, { icon: "🔨", label: "Баны", last: true, onPress: () => setScreen("bans") })
                ),

                React.createElement(RN.View, { style: { height: 40 } })
            )
        );
    }

    // ─── Modal wrapper ─────────────────────────────────────────────────────────

    function FakeAdminModal({ guildId, visible, onClose }) {
        return React.createElement(RN.Modal, {
            visible,
            animationType: "slide",
            presentationStyle: "pageSheet",
            onRequestClose: onClose
        },
            React.createElement(FakeServerSettings, { guildId, onClose })
        );
    }

    // ─── Permission patches ────────────────────────────────────────────────────

    function patchPermissionChecks() {
        const PermUtils = findByProps("canManageUser", "canKick", "canBan");
        if (PermUtils) {
            ["canManageUser", "canKick", "canBan", "canTimeout", "canManageChannel"].forEach(fn => {
                if (typeof PermUtils[fn] === "function") {
                    patches.push(instead(fn, PermUtils, () => true));
                }
            });
        }
    }

    // ─── Inject "Настройки сервера" button into server context menu ───────────

    function patchServerContextMenu() {
        // We'll inject a custom trigger into the GuildContextMenu
        const GuildContextMenu = findByProps("GuildContextMenu") ||
                                 findByName("GuildContextMenu") ||
                                 findByProps("useGuildContextMenu");

        if (!GuildContextMenu) return false;

        const target = GuildContextMenu.default || GuildContextMenu;
        if (!target) return false;

        patches.push(after("default", GuildContextMenu, (args, ret) => {
            // Store guildId for modal use
            const guildId = args?.[0]?.guildId || getGuildId();
            if (guildId) window.__fakeAdminGuildId = guildId;
            return ret;
        }));

        return true;
    }

    // ─── Patch UserProfileSheet for mod buttons ────────────────────────────────

    function patchUserProfileSheet() {
        const UserProfileSheet = findByName("UserProfileSheet") ||
                                 findByProps("UserProfileSheet")?.default ||
                                 findByProps("useUserProfileSheetActions");
        if (!UserProfileSheet) return false;

        patches.push(after("default", UserProfileSheet, (args, ret) => {
            try {
                const guildId = args[0]?.guildId || getGuildId();
                const isReal = hasRealPermissions(guildId);
                let actions = ret?.props?.children || [];
                if (!Array.isArray(actions)) actions = [actions];

                const modActions = [
                    { label: "⏱️  Тайм-аут", color: "#faa61a", key: "timeout" },
                    { label: "👢  Выгнать", color: "#f04747", key: "kick" },
                    { label: "🔨  Забанить", color: "#f04747", key: "ban" },
                ];

                modActions.forEach(act => {
                    actions.push(React.createElement(Forms.FormRow, {
                        key: act.key,
                        label: act.label,
                        onPress: () => {
                            if (!isReal && storage.showFakeToast) {
                                showToast(`❌ Нет прав. Это только визуал.`, { variant: "error" });
                            } else if (isReal) {
                                showToast(`✅ ${act.label.trim()} выполнен`);
                            }
                        },
                        style: { opacity: isReal ? 1 : 0.8 }
                    }));
                });

                if (ret?.props) ret.props.children = actions;
            } catch (e) { console.error("[FakeAdmin] sheet patch error:", e); }
            return ret;
        }));

        return true;
    }

    // ─── Settings UI ───────────────────────────────────────────────────────────

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);
        const [toast, setToast] = React.useState(storage.showFakeToast);
        const [modalVisible, setModalVisible] = React.useState(false);
        const guildId = getGuildId();

        const save = () => {
            storage.enabled = enabled;
            storage.showFakeToast = toast;
            showToast("✅ Сохранено");
        };

        return React.createElement(RN.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Admin Panel" },
                React.createElement(Forms.FormSwitch, { label: "Включить плагин", value: enabled, onValueChange: setEnabled }),
                React.createElement(Forms.FormSwitch, { label: "Показывать тосты об отсутствии прав", value: toast, onValueChange: setToast })
            ),
            React.createElement(Forms.FormSection, { title: "Тест" },
                React.createElement(Forms.FormRow, {
                    label: "🖥️  Открыть фейк Server Settings",
                    subLabel: guildId ? `Текущий сервер: ${guildId}` : "Зайди на сервер",
                    onPress: () => {
                        if (!guildId) { showToast("❌ Сначала зайди на сервер"); return; }
                        setModalVisible(true);
                    }
                })
            ),
            React.createElement(Forms.FormRow, { label: "💾  Сохранить настройки", onPress: save }),
            React.createElement(FakeAdminModal, {
                guildId,
                visible: modalVisible,
                onClose: () => setModalVisible(false)
            })
        );
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    function onLoad() {
        if (!storage.enabled) return;
        patchPermissionChecks();
        patchUserProfileSheet();
        patchServerContextMenu();
        showToast("✅ FakeAdmin загружен");
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
