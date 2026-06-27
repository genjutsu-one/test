(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const { after, instead } = vendetta.patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;
    if (typeof storage.fakeRoles === "undefined") storage.fakeRoles = {};

    let patches = [];

    const ADMINISTRATOR       = 0x8n;
    const MANAGE_GUILD        = 0x20n;
    const MANAGE_CHANNELS     = 0x10n;
    const KICK_MEMBERS        = 0x2n;
    const BAN_MEMBERS         = 0x4n;
    const MANAGE_MESSAGES     = 0x2000n;
    const MANAGE_ROLES        = 0x10000000n;
    const MANAGE_WEBHOOKS     = 0x20000000n;
    const MODERATE_MEMBERS    = 0x10000000000n;
    const VIEW_AUDIT_LOG      = 0x80n;
    const VIEW_GUILD_INSIGHTS = 0x80000n;
    const MANAGE_NICKNAMES    = 0x8000000n;
    const MANAGE_EMOJIS       = 0x40000000n;
    const MANAGE_EVENTS       = 0x200000000n;
    const MANAGE_THREADS      = 0x400000000n;

    const ALL_ADMIN_PERMS = [
        ADMINISTRATOR, MANAGE_GUILD, MANAGE_CHANNELS, KICK_MEMBERS,
        BAN_MEMBERS, MANAGE_MESSAGES, MANAGE_ROLES, MANAGE_WEBHOOKS,
        MODERATE_MEMBERS, VIEW_AUDIT_LOG, VIEW_GUILD_INSIGHTS,
        MANAGE_NICKNAMES, MANAGE_EMOJIS, MANAGE_EVENTS, MANAGE_THREADS,
    ];

    const ALL_PERMS_BIGINT = ALL_ADMIN_PERMS.reduce((acc, p) => acc | p, 0n);

    function mergePerms(original) {
        try {
            const combined = BigInt(original || 0) | ALL_PERMS_BIGINT;
            if (typeof original === "bigint") return combined;
            if (typeof original === "string") return combined.toString();
            const asNum = Number(combined);
            return Number.isSafeInteger(asNum) ? asNum : combined.toString();
        } catch {
            return original;
        }
    }

    function getGuildId() {
        try { return findByProps("getGuildId")?.getGuildId?.() || null; } catch { return null; }
    }

    function getGuildData(guildId) {
        try { return findByProps("getGuild", "getGuilds")?.getGuild?.(guildId) || null; } catch { return null; }
    }

    function getMembers(guildId) {
        try {
            const MemberStore = findByProps("getMembers", "getMember");
            const UserStore = findByProps("getUser", "getCurrentUser");
            return (MemberStore?.getMembers?.(guildId) || []).map(m => {
                const user = UserStore?.getUser?.(m.userId) || {};
                return { ...m, username: user.username || m.userId };
            });
        } catch {
            return [];
        }
    }

    function getRoles(guildId) {
        try {
            return Object.values(findByProps("getRoles")?.getRoles?.(guildId) || {})
                .sort((a, b) => b.position - a.position);
        } catch {
            return [];
        }
    }

    function getBans(guildId) {
        try {
            return Object.values(findByProps("getBans", "isBanned")?.getBans?.(guildId) || {});
        } catch {
            return [];
        }
    }

    function getSelfUserId() {
        try { return findByProps("getUser", "getCurrentUser")?.getCurrentUser?.()?.id || null; } catch { return null; }
    }

    function intToHex(color) {
        if (!color) return "#99aab5";
        return "#" + color.toString(16).padStart(6, "0");
    }

    function hasFakeOverride(guildId, userId) {
        return Array.isArray(storage.fakeRoles?.[guildId]?.[userId]);
    }

    function getFakeRolesForUser(guildId, userId) {
        return storage.fakeRoles?.[guildId]?.[userId] || [];
    }

    function setFakeRolesForUser(guildId, userId, roleIds) {
        if (!storage.fakeRoles[guildId]) storage.fakeRoles[guildId] = {};
        storage.fakeRoles[guildId][userId] = roleIds;
    }

    const FAKE_OWNER_ROLE_ID = "999999999999999999";
    const FAKE_OWNER_ROLE = {
        id: FAKE_OWNER_ROLE_ID,
        name: "Fake Admin",
        color: 0x5865f2,
        position: 9999,
        permissions: ALL_PERMS_BIGINT.toString(),
        hoist: false, managed: false,
    };

    function getTopRealRoleId(guildId) {
        try {
            const roles = getRoles(guildId);
            const real = roles.filter(r => r.id !== guildId);
            if (!real.length) return null;
            const withAdmin = real.find(r => {
                try { return (BigInt(r.permissions || 0) & ADMINISTRATOR) === ADMINISTRATOR; }
                catch { return false; }
            });
            return (withAdmin || real[0]).id;
        } catch {
            return null;
        }
    }

    const S = {
        screen:          { flex: 1, backgroundColor: "#111214" },
        header:          { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1f22", padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        headerTitle:     { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
        backBtn:         { color: "#5865f2", fontSize: 16, fontWeight: "600", minWidth: 60 },
        closeBtn:        { color: "#b5bac1", fontSize: 22, minWidth: 40, textAlign: "right" },
        section:         { marginTop: 20, marginHorizontal: 16, marginBottom: 4 },
        sectionLabel:    { color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
        card:            { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, overflow: "hidden" },
        row:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        rowLast:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
        rowLabel:        { color: "#dbdee1", fontSize: 16, flex: 1 },
        rowIcon:         { fontSize: 20, marginRight: 14 },
        rowArrow:        { color: "#b5bac1", fontSize: 18 },
        badge:           { backgroundColor: "#5865f2", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
        badgeText:       { color: "#fff", fontSize: 11, fontWeight: "700" },
        avatar:          { width: 36, height: 36, borderRadius: 18, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center", marginRight: 12 },
        avatarText:      { color: "#fff", fontSize: 14, fontWeight: "700" },
        memberName:      { color: "#dbdee1", fontSize: 15, fontWeight: "600" },
        memberSub:       { color: "#b5bac1", fontSize: 12, marginTop: 1 },
        roleDot:         { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
        roleName:        { color: "#dbdee1", fontSize: 15, flex: 1 },
        roleMeta:        { color: "#b5bac1", fontSize: 12 },
        serverIconBox:   { width: 72, height: 72, borderRadius: 18, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center" },
        serverIconText:  { color: "#fff", fontSize: 26, fontWeight: "700" },
        overviewName:    { color: "#fff", fontSize: 20, fontWeight: "700" },
        overviewSub:     { color: "#b5bac1", fontSize: 13, marginTop: 2 },
        statsRow:        { flexDirection: "row", marginTop: 16, gap: 10 },
        statBox:         { flex: 1, backgroundColor: "#1e1f22", borderRadius: 8, padding: 12, alignItems: "center" },
        statNum:         { color: "#fff", fontSize: 22, fontWeight: "700" },
        statLabel:       { color: "#b5bac1", fontSize: 11, marginTop: 2 },
        emptyText:       { color: "#b5bac1", textAlign: "center", marginTop: 40, fontSize: 15 },
        searchBox:       { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 10, color: "#dbdee1", fontSize: 15, borderWidth: 1, borderColor: "#2b2d31" },
        fakeTag:         { backgroundColor: "#ed4245", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
        fakeTagText:     { color: "#fff", fontSize: 9, fontWeight: "700" },
        auditRow:        { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        auditAction:     { color: "#dbdee1", fontSize: 14, fontWeight: "600" },
        auditMeta:       { color: "#b5bac1", fontSize: 12, marginTop: 2 },
        warnBox:         { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, backgroundColor: "#2b2d31", borderRadius: 6, padding: 10 },
        warnText:        { color: "#faa61a", fontSize: 12, flex: 1, marginLeft: 6 },
        lockBox:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
        nativeBtn:       { alignItems: "center", marginHorizontal: 12 },
        nativeBtnCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center" },
        nativeBtnLabel:  { color: "#dbdee1", fontSize: 12, marginTop: 6 },
    };

    function Header({ title, onBack, onClose }) {
        return React.createElement(RN.View, { style: S.header },
            onBack
                ? React.createElement(RN.TouchableOpacity, { onPress: onBack, hitSlop: { top:10,bottom:10,left:10,right:10 } },
                    React.createElement(RN.Text, { style: S.backBtn }, "‹ Назад"))
                : React.createElement(RN.View, { style: { minWidth: 60 } }),
            React.createElement(RN.Text, { style: S.headerTitle }, title),
            onClose
                ? React.createElement(RN.TouchableOpacity, { onPress: onClose, hitSlop: { top:10,bottom:10,left:10,right:10 } },
                    React.createElement(RN.Text, { style: S.closeBtn }, "✕"))
                : React.createElement(RN.View, { style: { minWidth: 40 } })
        );
    }

    function MembersScreen({ guildId, onBack }) {
        const [search, setSearch] = React.useState("");
        const allMembers = React.useMemo(() => getMembers(guildId), [guildId]);
        const allRoles   = React.useMemo(() => getRoles(guildId), [guildId]);
        const selfId     = getSelfUserId();
        const filtered   = allMembers.filter(m =>
            !search || (m.username||"").toLowerCase().includes(search.toLowerCase())
        );

        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title: `Участники (${allMembers.length})`, onBack }),
            React.createElement(RN.TextInput, { style: S.searchBox, placeholder: "Поиск...", placeholderTextColor: "#72767d", value: search, onChangeText: setSearch }),
            filtered.length === 0
                ? React.createElement(RN.Text, { style: S.emptyText }, "Нет участников")
                : React.createElement(RN.FlatList, {
                    data: filtered,
                    keyExtractor: (m,i) => m.userId||String(i),
                    renderItem: ({ item: m }) => {
                        const isSelf      = m.userId === selfId;
                        const fakeIds     = getFakeRolesForUser(guildId, m.userId);
                        const mergedIds   = [...new Set([...(m.roles||[]), ...fakeIds])];
                        const topRole     = mergedIds.length ? allRoles.find(r => mergedIds.includes(r.id)) : null;
                        const hasFake     = fakeIds.length > 0;
                        const initials    = (m.username||"?").slice(0,2).toUpperCase();
                        return React.createElement(RN.View, {
                            style: { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1, borderBottomColor:"#2b2d31" }
                        },
                            React.createElement(RN.View, { style: [S.avatar, topRole?.color ? { backgroundColor: intToHex(topRole.color) } : {}] },
                                React.createElement(RN.Text, { style: S.avatarText }, initials)),
                            React.createElement(RN.View, { style: { flex:1 } },
                                React.createElement(RN.View, { style: { flexDirection:"row", alignItems:"center" } },
                                    React.createElement(RN.Text, { style: S.memberName }, m.username||m.userId),
                                    isSelf && React.createElement(RN.View, { style: [S.fakeTag, { backgroundColor:"#5865f2", marginLeft:6 }] },
                                        React.createElement(RN.Text, { style: S.fakeTagText }, "ВЫ")),
                                    hasFake && React.createElement(RN.View, { style: [S.fakeTag, { marginLeft:4 }] },
                                        React.createElement(RN.Text, { style: S.fakeTagText }, `+${fakeIds.length} fake`))
                                ),
                                React.createElement(RN.Text, { style: S.memberSub }, topRole ? topRole.name : "Нет ролей")
                            )
                        );
                    }
                })
        );
    }

    function RolesScreen({ guildId, onBack }) {
        const roles = React.useMemo(() => getRoles(guildId), [guildId]);
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title: `Роли (${roles.length})`, onBack }),
            roles.length === 0
                ? React.createElement(RN.Text, { style: S.emptyText }, "Роли не найдены")
                : React.createElement(RN.FlatList, {
                    style: { marginTop: 8 }, data: roles, keyExtractor: r => r.id,
                    renderItem: ({ item: r }) =>
                        React.createElement(RN.View, { style: S.row },
                            React.createElement(RN.View, { style: [S.roleDot, { backgroundColor: intToHex(r.color) }] }),
                            React.createElement(RN.Text, { style: S.roleName }, r.name),
                            React.createElement(RN.Text, { style: S.roleMeta }, `поз. ${r.position}`)
                        )
                })
        );
    }

    function BansScreen({ guildId, onBack }) {
        const bans = React.useMemo(() => getBans(guildId), [guildId]);
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title: "Баны", onBack }),
            bans.length === 0
                ? React.createElement(RN.View, { style: S.lockBox },
                    React.createElement(RN.Text, { style: { fontSize:36,marginBottom:12 } }, "🔨"),
                    React.createElement(RN.Text, { style: { color:"#dbdee1",fontSize:15,fontWeight:"700" } }, "Список банов пуст"),
                    React.createElement(RN.Text, { style: { color:"#b5bac1",fontSize:13,textAlign:"center",marginTop:6 } }, "Нет кешированных данных.")
                  )
                : React.createElement(RN.FlatList, {
                    style: { marginTop: 8 }, data: bans, keyExtractor: (b,i) => b.user?.id||String(i),
                    renderItem: ({ item: b }) =>
                        React.createElement(RN.View, { style: S.row },
                            React.createElement(RN.View, { style: [S.avatar, { backgroundColor:"#ed4245" }] },
                                React.createElement(RN.Text, { style: S.avatarText }, (b.user?.username||"?").slice(0,2).toUpperCase())),
                            React.createElement(RN.View, { style: { flex:1 } },
                                React.createElement(RN.Text, { style: S.memberName }, b.user?.username||"Неизвестно"),
                                React.createElement(RN.Text, { style: S.memberSub }, b.reason||"Причина не указана"))
                        )
                })
        );
    }

    const FAKE_AUDIT = [
        { icon:"🔨", action:"Пользователь забанен",  who:"Модератор",     target:"user#0001", time:"Только что" },
        { icon:"👢", action:"Пользователь кикнут",   who:"Модератор",     target:"user#0002", time:"5 мин. назад" },
        { icon:"⏱️", action:"Выдан тайм-аут 10м",   who:"Модератор",     target:"user#0003", time:"20 мин. назад" },
        { icon:"✏️", action:"Канал изменён",          who:"Администратор", target:"#general",  time:"1 час назад" },
        { icon:"🔑", action:"Роль создана",            who:"Администратор", target:"Muted",     time:"3 часа назад" },
        { icon:"🗑️", action:"Сообщение удалено",       who:"Модератор",     target:"#chat",     time:"Вчера" },
    ];

    function AuditLogScreen({ guildId, onBack }) {
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title: "Журнал аудита", onBack }),
            React.createElement(RN.View, { style: S.warnBox },
                React.createElement(RN.Text, null, "⚠️"),
                React.createElement(RN.Text, { style: S.warnText }, "Демо-данные. Реальный журнал требует прав администратора.")
            ),
            React.createElement(RN.FlatList, {
                style: { marginTop: 8 }, data: FAKE_AUDIT, keyExtractor: (_,i) => String(i),
                renderItem: ({ item }) =>
                    React.createElement(RN.View, { style: S.auditRow },
                        React.createElement(RN.View, { style: { flexDirection:"row",alignItems:"flex-start" } },
                            React.createElement(RN.Text, { style: { fontSize:18,marginRight:10,marginTop:1 } }, item.icon),
                            React.createElement(RN.View, null,
                                React.createElement(RN.Text, { style: S.auditAction }, item.action),
                                React.createElement(RN.Text, { style: S.auditMeta }, `${item.who} → ${item.target}`),
                                React.createElement(RN.Text, { style: S.auditMeta }, item.time))
                        )
                    )
            })
        );
    }

    function OverviewScreen({ guildId, onBack }) {
        const guild   = getGuildData(guildId);
        const members = React.useMemo(() => getMembers(guildId), [guildId]);
        const roles   = React.useMemo(() => getRoles(guildId), [guildId]);
        const name     = guild?.name || "Сервер";
        const initials = name.split(" ").map(w=>w[0]).filter(Boolean).join("").slice(0,3).toUpperCase();
        return React.createElement(RN.ScrollView, { style: S.screen },
            React.createElement(Header, { title: "Обзор", onBack }),
            React.createElement(RN.View, { style: { padding:16 } },
                React.createElement(RN.View, { style: { alignItems:"center",marginBottom:16 } },
                    React.createElement(RN.View, { style: S.serverIconBox },
                        React.createElement(RN.Text, { style: S.serverIconText }, initials)),
                    React.createElement(RN.Text, { style: [S.overviewName,{marginTop:10,textAlign:"center"}] }, name),
                    React.createElement(RN.Text, { style: [S.overviewSub,{textAlign:"center"}] }, `ID: ${guildId||"—"}`)
                ),
                React.createElement(RN.View, { style: S.statsRow },
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, members.length||"—"),
                        React.createElement(RN.Text, { style: S.statLabel }, "Участников")),
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, roles.length||"—"),
                        React.createElement(RN.Text, { style: S.statLabel }, "Ролей")),
                    React.createElement(RN.View, { style: S.statBox },
                        React.createElement(RN.Text, { style: S.statNum }, `${guild?.premiumTier??0}`),
                        React.createElement(RN.Text, { style: S.statLabel }, "Буст ур."))
                ),
                React.createElement(RN.View, { style: [S.card,{marginTop:16,marginHorizontal:0}] },
                    React.createElement(RN.View, { style: S.row },
                        React.createElement(RN.Text, { style: S.rowIcon }, "✅"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Уровень верификации"),
                        React.createElement(RN.Text, { style: S.roleMeta }, String(guild?.verificationLevel??"—"))),
                    React.createElement(RN.View, { style: S.row },
                        React.createElement(RN.Text, { style: S.rowIcon }, "🌍"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Регион"),
                        React.createElement(RN.Text, { style: S.roleMeta }, guild?.region||"auto")),
                    React.createElement(RN.View, { style: S.rowLast },
                        React.createElement(RN.Text, { style: S.rowIcon }, "🚀"),
                        React.createElement(RN.Text, { style: S.rowLabel }, "Буст-уровень"),
                        React.createElement(RN.Text, { style: S.roleMeta }, `Уровень ${guild?.premiumTier??0}`))
                )
            )
        );
    }

    function StubScreen({ title, onBack }) {
        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title, onBack }),
            React.createElement(RN.View, { style: S.lockBox },
                React.createElement(RN.Text, { style: { fontSize:40,marginBottom:14 } }, "🔒"),
                React.createElement(RN.Text, { style: { color:"#dbdee1",fontSize:16,fontWeight:"700" } }, "Нет данных"),
                React.createElement(RN.Text, { style: { color:"#b5bac1",fontSize:13,textAlign:"center",marginTop:8,lineHeight:20 } },
                    "Этот раздел требует реальных прав.\nДанные не кешированы на клиенте.")
            )
        );
    }

    function FakeServerSettings({ guildId, onClose }) {
        const [screen, setScreen] = React.useState(null);

        if (screen === "overview") return React.createElement(OverviewScreen, { guildId, onBack: () => setScreen(null) });
        if (screen === "members") return React.createElement(MembersScreen,  { guildId, onBack: () => setScreen(null) });
        if (screen === "roles")   return React.createElement(RolesScreen,    { guildId, onBack: () => setScreen(null) });
        if (screen === "bans")    return React.createElement(BansScreen,     { guildId, onBack: () => setScreen(null) });
        if (screen === "audit")   return React.createElement(AuditLogScreen, { guildId, onBack: () => setScreen(null) });
        if (screen)               return React.createElement(StubScreen,     { title: screen, onBack: () => setScreen(null) });

        const guild    = getGuildData(guildId);
        const name     = guild?.name || "Сервер";
        const initials = name.split(" ").map(w=>w[0]).filter(Boolean).join("").slice(0,3).toUpperCase();
        const members  = React.useMemo(() => getMembers(guildId), [guildId]);
        const roles    = React.useMemo(() => getRoles(guildId), [guildId]);

        function Row({ icon, label, count, last, onPress }) {
            return React.createElement(RN.TouchableOpacity, { onPress: onPress||(() => setScreen(label)), activeOpacity: 0.65 },
                React.createElement(RN.View, { style: last ? S.rowLast : S.row },
                    React.createElement(RN.Text, { style: S.rowIcon }, icon),
                    React.createElement(RN.Text, { style: S.rowLabel }, label),
                    count != null && React.createElement(RN.View, { style: S.badge },
                        React.createElement(RN.Text, { style: S.badgeText }, String(count))),
                    React.createElement(RN.Text, { style: S.rowArrow }, "›")
                )
            );
        }

        return React.createElement(RN.View, { style: S.screen },
            React.createElement(Header, { title: "Настройки сервера", onClose }),
            React.createElement(RN.ScrollView, null,
                React.createElement(RN.View, { style: { alignItems:"center",paddingVertical:24 } },
                    React.createElement(RN.View, { style: S.serverIconBox },
                        React.createElement(RN.Text, { style: S.serverIconText }, initials)),
                    React.createElement(RN.Text, { style: [S.overviewName,{marginTop:10}] }, name),
                    React.createElement(RN.View, { style: { flexDirection:"row",alignItems:"center",marginTop:4 } },
                        React.createElement(RN.View, { style: S.fakeTag },
                            React.createElement(RN.Text, { style: S.fakeTagText }, "FAKE ADMIN")))
                ),
                React.createElement(RN.View, { style: S.section }, React.createElement(RN.Text, { style: S.sectionLabel }, "Настройки")),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon:"ℹ️",  label:"Обзор",         onPress: () => setScreen("overview") }),
                    React.createElement(Row, { icon:"🛡️", label:"Модерация" }),
                    React.createElement(Row, { icon:"📋", label:"Журнал аудита", onPress: () => setScreen("audit") }),
                    React.createElement(Row, { icon:"📁", label:"Каналы" }),
                    React.createElement(Row, { icon:"🔗", label:"Интеграции" }),
                    React.createElement(Row, { icon:"😀", label:"Emoji" }),
                    React.createElement(Row, { icon:"🎨", label:"Стикеры" }),
                    React.createElement(Row, { icon:"🔐", label:"Безопасность", last: true })
                ),
                React.createElement(RN.View, { style: S.section }, React.createElement(RN.Text, { style: S.sectionLabel }, "Сообщество")),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon:"🏘️", label:"Включить сообщество", last: true })
                ),
                React.createElement(RN.View, { style: S.section }, React.createElement(RN.Text, { style: S.sectionLabel }, "Управление пользователями")),
                React.createElement(RN.View, { style: S.card },
                    React.createElement(Row, { icon:"👥", label:"Участники",  count: members.length||null, onPress: () => setScreen("members") }),
                    React.createElement(Row, { icon:"🏷️", label:"Роли",       count: roles.length||null,   onPress: () => setScreen("roles") }),
                    React.createElement(Row, { icon:"🔗", label:"Приглашения" }),
                    React.createElement(Row, { icon:"🔨", label:"Баны", last: true, onPress: () => setScreen("bans") })
                ),
                React.createElement(RN.View, { style: { height: 50 } })
            )
        );
    }

    const modalState = { show: null };

    function RootModal() {
        const [visible, setVisible] = React.useState(false);
        const [guildId, setGuildId] = React.useState(null);
        React.useEffect(() => {
            modalState.show = (gid) => { setGuildId(gid); setVisible(true); };
            return () => { modalState.show = null; };
        }, []);
        if (!visible) return null;
        return React.createElement(RN.Modal, {
            visible: true, animationType: "slide", presentationStyle: "pageSheet",
            onRequestClose: () => setVisible(false)
        }, React.createElement(FakeServerSettings, { guildId, onClose: () => setVisible(false) }));
    }

    function openSettings(guildId) {
        setTimeout(() => {
            if (modalState.show) modalState.show(guildId || getGuildId());
            else showToast("❌ Модал не готов, перезагрузи Discord");
        }, 80);
    }

    function NativeSettingsButton({ guildId }) {
        return React.createElement(RN.TouchableOpacity, {
            style: S.nativeBtn,
            onPress: () => openSettings(guildId || getGuildId()),
            activeOpacity: 0.7,
        },
            React.createElement(RN.View, { style: S.nativeBtnCircle },
                React.createElement(RN.Text, { style: { fontSize: 26 } }, "⚙️")
            ),
            React.createElement(RN.Text, { style: S.nativeBtnLabel }, "Настройки")
        );
    }

    function patchAllPermissions() {
        const PermissionStore = findByProps("can", "getGuildPermissions", "getChannelPermissions");
        if (PermissionStore) {
            ["can", "canWithPartialContext", "canEveryone", "canManageUser"].forEach(fn => {
                if (typeof PermissionStore[fn] === "function") {
                    patches.push(instead(fn, PermissionStore, ([perm, context], orig) => {
                        try {
                            const p = BigInt(perm || 0);
                            if (ALL_ADMIN_PERMS.some(ap => p === ap)) return true;
                        } catch {}
                        return orig(perm, context);
                    }));
                }
            });
            if (typeof PermissionStore.getGuildPermissions === "function")
                patches.push(after("getGuildPermissions", PermissionStore, (_, ret) => mergePerms(ret)));
            if (typeof PermissionStore.getChannelPermissions === "function")
                patches.push(after("getChannelPermissions", PermissionStore, (_, ret) => mergePerms(ret)));
        }

        const PermUtils = findByProps("canManageUser", "canKick", "canBan") || findByProps("canKick", "canBan");
        if (PermUtils) {
            ["canManageUser","canKick","canBan","canTimeout","canManageChannel",
             "canManageGuild","canManageRoles","canManageMessages","canViewAuditLog"].forEach(fn => {
                if (typeof PermUtils[fn] === "function")
                    patches.push(instead(fn, PermUtils, () => true));
            });
        }

        const GuildPerms = findByProps("canManageGuild", "isOwner") || findByProps("canManageGuild");
        if (GuildPerms) {
            ["canManageGuild","isOwner","isAdmin"].forEach(fn => {
                if (typeof GuildPerms[fn] === "function")
                    patches.push(instead(fn, GuildPerms, () => true));
            });
        }

        const computed = findByProps("getGuildPermissions", "makeEveryonePermissions");
        if (computed) {
            ["makeEveryonePermissions","computePermissions"].forEach(fn => {
                if (typeof computed[fn] === "function") {
                    patches.push(instead(fn, computed, (args, orig) => {
                        try { return mergePerms(orig(...args)); }
                        catch { return ALL_PERMS_BIGINT.toString(); }
                    }));
                }
            });
        }

        const memberCloneCache = new WeakMap();
        const guildCloneCache  = new WeakMap();

        const MemberStore = findByProps("getSelfMember");
        if (MemberStore?.getSelfMember) {
            patches.push(after("getSelfMember", MemberStore, ([guildId], member) => {
                if (!member) return member;
                if (memberCloneCache.has(member)) return memberCloneCache.get(member);
                try {
                    const userId = member.userId || getSelfUserId();
                    const base = hasFakeOverride(guildId, userId) ? getFakeRolesForUser(guildId, userId) : (member.roles || []);
                    const topRoleId = getTopRealRoleId(guildId) || FAKE_OWNER_ROLE_ID;
                    const roles = base.includes(topRoleId) ? base : [topRoleId, ...base];
                    const clone = Object.assign(Object.create(Object.getPrototypeOf(member)), member, {
                        roles,
                        permissions: mergePerms(member.permissions),
                    });
                    memberCloneCache.set(member, clone);
                    return clone;
                } catch {
                    return member;
                }
            }));
        }

        const MemberStoreSingle = findByProps("getMember", "getMembers");
        if (MemberStoreSingle?.getMember) {
            patches.push(after("getMember", MemberStoreSingle, ([guildId, userId], member) => {
                if (!member) return member;
                const selfId = getSelfUserId();
                const isSelf = userId === selfId;
                const override = hasFakeOverride(guildId, userId);
                if (!isSelf && !override) return member;
                if (memberCloneCache.has(member)) return memberCloneCache.get(member);
                try {
                    let roles = override ? getFakeRolesForUser(guildId, userId) : (Array.isArray(member.roles) ? member.roles : []);
                    if (isSelf) {
                        const topRoleId = getTopRealRoleId(guildId) || FAKE_OWNER_ROLE_ID;
                        if (!roles.includes(topRoleId)) roles = [topRoleId, ...roles];
                    }
                    const clone = Object.assign(Object.create(Object.getPrototypeOf(member)), member, {
                        roles,
                        permissions: isSelf ? mergePerms(member.permissions) : member.permissions,
                    });
                    memberCloneCache.set(member, clone);
                    return clone;
                } catch {
                    return member;
                }
            }));
        }

        const RoleStore = findByProps("getRoles");
        if (RoleStore?.getRoles) {
            patches.push(after("getRoles", RoleStore, ([gId], ret) => {
                if (!ret) return ret;
                if (!getTopRealRoleId(gId) && !ret[FAKE_OWNER_ROLE_ID]) {
                    ret[FAKE_OWNER_ROLE_ID] = { ...FAKE_OWNER_ROLE };
                }
                return ret;
            }));
        }

        const GuildStore = findByProps("getGuild", "getGuilds");
        if (GuildStore?.getGuild) {
            patches.push(after("getGuild", GuildStore, (_, guild) => {
                if (!guild) return guild;
                if (guildCloneCache.has(guild)) return guildCloneCache.get(guild);
                try {
                    const selfId = getSelfUserId();
                    if (guild.ownerId === selfId) return guild;
                    const clone = Object.assign(Object.create(Object.getPrototypeOf(guild)), guild, { ownerId: selfId });
                    guildCloneCache.set(guild, clone);
                    return clone;
                } catch {
                    return guild;
                }
            }));
        }

        const hasAnyMod = findByProps("hasAny", "hasPermission");
        if (hasAnyMod) {
            ["hasAny","hasPermission","has"].forEach(fn => {
                if (typeof hasAnyMod[fn] === "function") {
                    patches.push(instead(fn, hasAnyMod, ([perms, flag], orig) => {
                        try {
                            const p = BigInt(perms || 0);
                            const f = BigInt(flag  || 0);
                            if (ALL_ADMIN_PERMS.some(ap => f === ap)) return true;
                            return Boolean(p & f);
                        } catch {}
                        return orig(perms, flag);
                    }));
                }
            });
        }
    }

    function patchNativeRoleEdit() {
        const GuildMemberActions = findByProps("editGuildMember") ||
                                   findByProps("updateMember") ||
                                   findByProps("setMemberRoles");

        if (GuildMemberActions) {
            const fnName = GuildMemberActions.editGuildMember ? "editGuildMember"
                         : GuildMemberActions.updateMember ? "updateMember"
                         : "setMemberRoles";
            patches.push(instead(fnName, GuildMemberActions, (args, orig) => {
                try {
                    const guildId = args[0];
                    const userId  = args[1];
                    const data    = args[2];

                    const raw = Array.isArray(data?.roles) ? data.roles
                              : data instanceof Set ? [...data]
                              : Array.isArray(data) ? data
                              : null;

                    if (raw && guildId && userId) {
                        const ids = raw.map(r => typeof r === "string" ? r : r?.id).filter(Boolean);
                        setFakeRolesForUser(guildId, userId, ids);
                        showToast("✅ Роли сохранены локально (fake)");
                        return Promise.resolve();
                    }
                } catch {}
                return orig(...args);
            }));
        }

        const APIModule = findByProps("patch", "put") || findByProps("makeRequest");
        if (APIModule?.patch) {
            patches.push(instead("patch", APIModule, (args, orig) => {
                try {
                    const url = args[0]?.url || args[0];
                    if (typeof url === "string" && /\/guilds\/\d+\/members\/\d+/.test(url)) {
                        const body = args[0]?.body || args[1];
                        if (body?.roles) {
                            const parts  = url.split("/");
                            const guildId = parts[parts.indexOf("guilds") + 1];
                            const userId  = parts[parts.indexOf("members") + 1];
                            if (guildId && userId) {
                                setFakeRolesForUser(guildId, userId, body.roles);
                                showToast("✅ Роли перехвачены и сохранены локально");
                                return Promise.resolve({ body: {}, ok: true });
                            }
                        }
                    }
                } catch {}
                return orig(...args);
            }));
        }
    }

    function patchUserProfileSheet() {
        const mod = findByName("UserProfileSheet") || findByProps("useUserProfileSheetActions");
        if (!mod) return;
        patches.push(after("default", mod, (args, ret) => {
            try {
                let children = ret?.props?.children || [];
                if (!Array.isArray(children)) children = [children];
                [
                    { label: "⏱️  Тайм-аут", key: "timeout" },
                    { label: "👢  Выгнать",   key: "kick" },
                    { label: "🔨  Забанить",  key: "ban" },
                ].forEach(act => {
                    children.push(React.createElement(Forms.FormRow, {
                        key: act.key,
                        label: act.label,
                        onPress: () => showToast(`⚠️ ${act.label.trim()} — только визуал, API вернёт 403`)
                    }));
                });
                if (ret?.props) ret.props.children = children;
            } catch {}
            return ret;
        }));
    }

    function injectModal() {
        const candidates = [
            findByName("AppContainer"),
            findByProps("AppContainer")?.AppContainer,
            findByProps("ConnectedApp"),
            findByProps("DiscordApp"),
        ].filter(Boolean);
        for (const target of candidates) {
            const key = target.default ? "default" :
                        Object.keys(target).find(k => typeof target[k] === "function");
            if (!key) continue;
            patches.push(after(key, target, (_, ret) => {
                try {
                    const overlay = React.createElement(RootModal, { key: "__fa_modal" });
                    if (Array.isArray(ret?.props?.children)) ret.props.children.push(overlay);
                    else if (ret?.props) ret.props.children = [ret.props.children, overlay].filter(Boolean);
                } catch {}
                return ret;
            }));
            break;
        }
    }

    function injectIntoButtonRow(element, guildId) {
        if (!element || typeof element !== "object") return false;
        const props = element.props;
        if (!props) return false;
        const children = props.children;
        if (!children) return false;
        const arr = Array.isArray(children) ? children : [children];

        if (arr.length >= 2 && arr.length <= 6) {
            const style = props.style;
            const isRow = style?.flexDirection === "row" ||
                          (Array.isArray(style) && style.some(s => s?.flexDirection === "row"));
            const str = JSON.stringify(arr);
            const hasBoosts = str.includes("бусто") || str.includes("boost") || str.includes("Boost");
            const hasNotif  = str.includes("ведомлени") || str.includes("Notif") || str.includes("otif");
            const hasInvite = str.includes("ригласи") || str.includes("nvit");

            if (isRow && (hasBoosts || hasNotif || hasInvite)) {
                if (!arr.some(el => el?.key === "__fa_settings_native")) {
                    arr.push(React.createElement(NativeSettingsButton, { key: "__fa_settings_native", guildId }));
                    props.children = arr;
                }
                return true;
            }
        }

        for (const child of arr) {
            if (injectIntoButtonRow(child, guildId)) return true;
        }
        return false;
    }

    function patchGuildProfileButtons() {
        const hookNames = [
            "useGuildProfileSheetSections", "useGuildProfileSheetActions",
            "useGuildHeaderActions", "useGuildHeaderButtons",
            "useGuildContextMenuItems", "useServerContextMenuItems",
        ];
        for (const hookName of hookNames) {
            const mod = findByProps(hookName);
            if (!mod || typeof mod[hookName] !== "function") continue;
            patches.push(after(hookName, mod, (args, ret) => {
                try {
                    const guildId = args?.[0]?.guildId || args?.[0] || getGuildId();
                    const btn = { label: "Настройки", icon: "⚙️", onPress: () => openSettings(guildId) };
                    if (Array.isArray(ret)) return [...ret, btn];
                    if (ret && typeof ret === "object") {
                        for (const k of Object.keys(ret)) {
                            if (Array.isArray(ret[k])) { ret[k] = [...ret[k], btn]; break; }
                        }
                    }
                } catch {}
                return ret;
            }));
        }

        const sheetCandidates = [
            findByName("GuildProfileSheet"),
            findByProps("GuildProfileSheet")?.GuildProfileSheet,
            findByProps("GuildProfileSheet")?.default,
        ].filter(Boolean);

        for (const target of sheetCandidates) {
            const key = typeof target === "function" ? "__self" :
                        (target.default ? "default" : Object.keys(target).find(k => typeof target[k] === "function"));
            const pObj = key === "__self" ? { __self: target } : target;
            const pKey = key === "__self" ? "__self" : key;
            if (!pObj[pKey]) continue;

            patches.push(after(pKey, pObj, (args, ret) => {
                try {
                    const guildId = args?.[0]?.guildId || getGuildId();
                    injectIntoButtonRow(ret, guildId);
                } catch {}
                return ret;
            }));
        }

        const actionSheetNames = [
            "GuildContextMenu", "ServerActionSheet", "NativeGuildContextMenu",
        ];
        for (const name of actionSheetNames) {
            const target = findByName(name) || findByProps(name)?.[name] || findByProps(name)?.default;
            if (!target) continue;
            const key = typeof target === "function" ? "__self" :
                        (target.default ? "default" : Object.keys(target).find(k => typeof target[k] === "function"));
            const pObj = key === "__self" ? { __self: target } : target;
            const pKey = key === "__self" ? "__self" : key;
            if (!pObj[pKey]) continue;

            patches.push(after(pKey, pObj, (args, ret) => {
                try {
                    const guildId = args?.[0]?.guildId || getGuildId();
                    const row = React.createElement(Forms.FormRow, {
                        key: "__fa_settings_row",
                        label: "⚙️  Фейк настройки сервера",
                        onPress: () => openSettings(guildId),
                    });
                    const ch = ret?.props?.children;
                    if (Array.isArray(ch)) ch.push(row);
                    else if (ret?.props) ret.props.children = [ch, row].filter(Boolean);
                } catch {}
                return ret;
            }));
        }
    }

    function resolveCommandArg(args, name, index) {
        if (!Array.isArray(args)) return undefined;
        const byName = args.find(a => a && typeof a === "object" && a.name === name);
        if (byName) return byName.value ?? byName;
        const raw = args[index];
        if (raw && typeof raw === "object" && "value" in raw) return raw.value;
        return raw;
    }

    function giveRoleLocally(guildId, userId, roleId) {
        if (!guildId) {
            showToast("❌ Команда работает только на сервере");
            return;
        }
        userId = userId != null ? String(userId) : "";
        roleId = roleId != null ? String(roleId) : "";
        if (!userId || !roleId) {
            showToast("❌ Использование: /giverole <user id> <role id>");
            return;
        }

        const role = getRoles(guildId).find(r => r.id === roleId);
        if (!role) {
            showToast("❌ Роль с таким ID не найдена на этом сервере");
            return;
        }

        const MemberStoreSingle = findByProps("getMember", "getMembers");
        const realMember = MemberStoreSingle?.getMember?.(guildId, userId);
        if (!realMember) {
            showToast("❌ Участник с таким ID не найден");
            return;
        }

        const base = hasFakeOverride(guildId, userId)
            ? getFakeRolesForUser(guildId, userId)
            : (Array.isArray(realMember.roles) ? realMember.roles : []);

        if (!base.includes(roleId)) {
            setFakeRolesForUser(guildId, userId, [...base, roleId]);
        }

        showToast(`✅ Роль "${role.name}" выдана локально, ник перекрасится`);
    }

    function registerGiveRoleCommand() {
        const commandsApi = vendetta.commands;
        if (!commandsApi?.registerCommand) {
            showToast("❌ API команд недоступно в этом загрузчике");
            return;
        }

        try {
            const unregister = commandsApi.registerCommand({
                name: "giverole",
                displayName: "giverole",
                description: "Выдать роль участнику локально (видно только тебе)",
                displayDescription: "Выдать роль участнику локально (видно только тебе)",
                applicationId: "-1",
                inputType: 1,  // ApplicationCommandInputType.BUILT_IN_TEXT
                type: 1,       // ApplicationCommandType.CHAT
                options: [
                    {
                        name: "user_id",
                        displayName: "user_id",
                        description: "ID пользователя",
                        displayDescription: "ID пользователя",
                        type: 3,  // ApplicationCommandOptionType.STRING
                        required: true,
                    },
                    {
                        name: "role_id",
                        displayName: "role_id",
                        description: "ID роли",
                        displayDescription: "ID роли",
                        type: 3,
                        required: true,
                    },
                ],
                execute: (args, ctx) => {
                    try {
                        const guildId = ctx?.guild?.id || getGuildId();
                        const userId  = resolveCommandArg(args, "user_id", 0);
                        const roleId  = resolveCommandArg(args, "role_id", 1);
                        giveRoleLocally(guildId, userId, roleId);
                    } catch {
                        showToast("❌ Не вышло выдать роль");
                    }
                },
            });
            if (typeof unregister === "function") patches.push(unregister);
        } catch {
            showToast("❌ Не удалось зарегистрировать /giverole");
        }
    }

    function onLoad() {
        patchAllPermissions();
        patchNativeRoleEdit();
        registerGiveRoleCommand();
        patchUserProfileSheet();
        patchGuildProfileButtons();
        injectModal();
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
        modalState.show = null;
    }

    return { onLoad, onUnload };
})();
