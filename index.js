(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName, findByStoreName } = vendetta.metro;
    const { after, instead } = vendetta.patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;
    if (typeof storage.enabled === "undefined") storage.enabled = true;
    if (typeof storage.showFakeToast === "undefined") storage.showFakeToast = true;
    // fakeRoles: { [guildId]: { [userId]: string[] } }
    if (typeof storage.fakeRoles === "undefined") storage.fakeRoles = {};

    let patches = [];

    // ─── Permission bits ───────────────────────────────────────────────────────
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
        } catch { return original; }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function getGuildId() {
        try { return findByProps("getGuildId")?.getGuildId?.() || null; } catch { return null; }
    }

    function getGuildData(guildId) {
        try { return findByProps("getGuild", "getGuilds")?.getGuild?.(guildId) || null; } catch { return null; }
    }

    function getMembers(guildId) {
        try {
            const MemberStore = findByProps("getMembers", "getMember");
            const UserStore   = findByProps("getUser", "getCurrentUser");
            return (MemberStore?.getMembers?.(guildId) || []).map(m => {
                const user = UserStore?.getUser?.(m.userId) || {};
                return { ...m, username: user.username || m.userId };
            });
        } catch { return []; }
    }

    function getRoles(guildId) {
        try {
            return Object.values(findByProps("getRoles")?.getRoles?.(guildId) || {})
                .sort((a, b) => b.position - a.position);
        } catch { return []; }
    }

    function getBans(guildId) {
        try {
            return Object.values(findByProps("getBans", "isBanned")?.getBans?.(guildId) || {});
        } catch { return []; }
    }

    function intToHex(color) {
        if (!color) return "#99aab5";
        return "#" + color.toString(16).padStart(6, "0");
    }

    // ─── Fake roles helpers ────────────────────────────────────────────────────

    function getSelfUserId() {
        try { return findByProps("getUser", "getCurrentUser")?.getCurrentUser?.()?.id || null; } catch { return null; }
    }

    function getFakeRolesForUser(guildId, userId) {
        return storage.fakeRoles?.[guildId]?.[userId] || [];
    }

    function setFakeRolesForUser(guildId, userId, roleIds) {
        if (!storage.fakeRoles[guildId]) storage.fakeRoles[guildId] = {};
        storage.fakeRoles[guildId][userId] = roleIds;
    }

    function getMergedRoles(member, guildId) {
        const real  = member.roles || [];
        const fake  = getFakeRolesForUser(guildId, member.userId);
        const merged = [...new Set([...real, ...fake])];
        return merged;
    }

    // Создаём виртуальную «фейк-роль» с максимальными правами для себя
    // чтобы Discord думал что у нас высшая роль (для отображения кнопки настроек)
    const FAKE_OWNER_ROLE_ID = "__fa_owner_role__";
    const FAKE_OWNER_ROLE = {
        id: FAKE_OWNER_ROLE_ID,
        name: "Fake Admin",
        color: 0x5865f2,
        position: 9999,
        permissions: ALL_PERMS_BIGINT.toString(),
        hoist: false,
        managed: false,
    };

    // ─── Styles ────────────────────────────────────────────────────────────────
    const S = {
        screen:        { flex: 1, backgroundColor: "#111214" },
        header:        { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1f22", padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        headerTitle:   { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
        backBtn:       { color: "#5865f2", fontSize: 16, fontWeight: "600", minWidth: 60 },
        closeBtn:      { color: "#b5bac1", fontSize: 22, minWidth: 40, textAlign: "right" },
        section:       { marginTop: 20, marginHorizontal: 16, marginBottom: 4 },
        sectionLabel:  { color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
        card:          { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, overflow: "hidden" },
        row:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        rowLast:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
        rowLabel:      { color: "#dbdee1", fontSize: 16, flex: 1 },
        rowIcon:       { fontSize: 20, marginRight: 14 },
        rowArrow:      { color: "#b5bac1", fontSize: 18 },
        badge:         { backgroundColor: "#5865f2", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
        badgeText:     { color: "#fff", fontSize: 11, fontWeight: "700" },
        avatar:        { width: 36, height: 36, borderRadius: 18, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center", marginRight: 12 },
        avatarText:    { color: "#fff", fontSize: 14, fontWeight: "700" },
        memberName:    { color: "#dbdee1", fontSize: 15, fontWeight: "600" },
        memberSub:     { color: "#b5bac1", fontSize: 12, marginTop: 1 },
        roleDot:       { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
        roleName:      { color: "#dbdee1", fontSize: 15, flex: 1 },
        roleMeta:      { color: "#b5bac1", fontSize: 12 },
        serverIconBox: { width: 72, height: 72, borderRadius: 18, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center" },
        serverIconText:{ color: "#fff", fontSize: 26, fontWeight: "700" },
        overviewName:  { color: "#fff", fontSize: 20, fontWeight: "700" },
        overviewSub:   { color: "#b5bac1", fontSize: 13, marginTop: 2 },
        statsRow:      { flexDirection: "row", marginTop: 16, gap: 10 },
        statBox:       { flex: 1, backgroundColor: "#1e1f22", borderRadius: 8, padding: 12, alignItems: "center" },
        statNum:       { color: "#fff", fontSize: 22, fontWeight: "700" },
        statLabel:     { color: "#b5bac1", fontSize: 11, marginTop: 2 },
        emptyText:     { color: "#b5bac1", textAlign: "center", marginTop: 40, fontSize: 15 },
        searchBox:     { backgroundColor: "#1e1f22", borderRadius: 8, marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 10, color: "#dbdee1", fontSize: 15, borderWidth: 1, borderColor: "#2b2d31" },
        fakeTag:       { backgroundColor: "#ed4245", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
        fakeTagText:   { color: "#fff", fontSize: 9, fontWeight: "700" },
        auditRow:      { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2b2d31" },
        auditAction:   { color: "#dbdee1", fontSize: 14, fontWeight: "600" },
        auditMeta:     { color: "#b5bac1", fontSize: 12, marginTop: 2 },
        warnBox:       { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, backgroundColor: "#2b2d31", borderRadius: 6, padding: 10 },
        warnText:      { color: "#faa61a", fontSize: 12, flex: 1, marginLeft: 6 },
        lockBox:       { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
        // Круглая кнопка в стиле нативных Discord кнопок (Бусты / Уведомления)
        nativeBtn:     { alignItems: "center", marginHorizontal: 12 },
        nativeBtnCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center" },
        nativeBtnLabel: { color: "#dbdee1", fontSize: 12, marginTop: 6 },
    };

    // ─── Header ────────────────────────────────────────────────────────────────
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

    // ─── Sub-screens ───────────────────────────────────────────────────────────

    function RolePickerModal({ guildId, member, allRoles, onClose }) {
        const userId   = member.userId;
        const [selected, setSelected] = React.useState(
            () => new Set(getFakeRolesForUser(guildId, userId))
        );

        function toggle(roleId) {
            setSelected(prev => {
                const next = new Set(prev);
                next.has(roleId) ? next.delete(roleId) : next.add(roleId);
                return next;
            });
        }

        function save() {
            setFakeRolesForUser(guildId, userId, [...selected]);
            showToast(`✅ Роли для ${member.username} сохранены (локально)`);
            onClose();
        }

        const selfId = getSelfUserId();
        const isSelf = userId === selfId;

        return React.createElement(RN.Modal, {
            visible: true,
            transparent: true,
            animationType: "slide",
            onRequestClose: onClose,
        },
            React.createElement(RN.View, { style: { flex:1, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"flex-end" } },
                React.createElement(RN.View, { style: { backgroundColor:"#1e1f22", borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:"80%", paddingBottom:32 } },
                    // header
                    React.createElement(RN.View, { style: { flexDirection:"row", alignItems:"center", padding:16, borderBottomWidth:1, borderBottomColor:"#2b2d31" } },
                        React.createElement(RN.Text, { style: { color:"#fff", fontSize:16, fontWeight:"700", flex:1 } },
                            `Фейк-роли: ${member.username}${isSelf ? " (я)" : ""}`),
                        React.createElement(RN.TouchableOpacity, { onPress: onClose },
                            React.createElement(RN.Text, { style: { color:"#b5bac1", fontSize:22 } }, "✕"))
                    ),
                    React.createElement(RN.View, { style: { marginHorizontal:12, marginTop:6, backgroundColor:"#2b2d31", borderRadius:6, padding:8 } },
                        React.createElement(RN.Text, { style: { color:"#faa61a", fontSize:12 } },
                            "⚠️ Только локально. Реально роли не меняются.")
                    ),
                    React.createElement(RN.FlatList, {
                        style: { marginTop:8 },
                        data: allRoles,
                        keyExtractor: r => r.id,
                        renderItem: ({ item: r }) => {
                            const active = selected.has(r.id);
                            return React.createElement(RN.TouchableOpacity, {
                                onPress: () => toggle(r.id),
                                activeOpacity: 0.7,
                                style: { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:12,
                                         borderBottomWidth:1, borderBottomColor:"#2b2d31",
                                         backgroundColor: active ? "#2b2d31" : "transparent" },
                            },
                                React.createElement(RN.View, { style: [S.roleDot, { backgroundColor: intToHex(r.color) }] }),
                                React.createElement(RN.Text, { style: [S.roleName, active && { color:"#fff" }] }, r.name),
                                active && React.createElement(RN.Text, { style: { color:"#5865f2", fontSize:18 } }, "✓")
                            );
                        }
                    }),
                    React.createElement(RN.TouchableOpacity, {
                        onPress: save,
                        activeOpacity: 0.8,
                        style: { marginHorizontal:16, marginTop:12, backgroundColor:"#5865f2", borderRadius:8, paddingVertical:14, alignItems:"center" },
                    },
                        React.createElement(RN.Text, { style: { color:"#fff", fontSize:16, fontWeight:"700" } }, "Сохранить")
                    )
                )
            )
        );
    }

    function MembersScreen({ guildId, onBack }) {
        const [search, setSearch]     = React.useState("");
        const [picker, setPicker]     = React.useState(null); // member object
        const [tick, setTick]         = React.useState(0);    // force re-render after save
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
                    extraData: tick,
                    keyExtractor: (m,i) => m.userId||String(i),
                    renderItem: ({ item: m }) => {
                        const isSelf      = m.userId === selfId;
                        const fakeRoleIds = getFakeRolesForUser(guildId, m.userId);
                        const mergedIds   = [...new Set([...(m.roles||[]), ...fakeRoleIds])];
                        const topRole     = mergedIds.length ? allRoles.find(r => mergedIds.includes(r.id)) : null;
                        const hasFake     = fakeRoleIds.length > 0;
                        const initials    = (m.username||"?").slice(0,2).toUpperCase();
                        return React.createElement(RN.TouchableOpacity, {
                            activeOpacity: 0.7,
                            onPress: () => setPicker(m),
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
                                        React.createElement(RN.Text, { style: S.fakeTagText }, `+${fakeRoleIds.length} fake`))
                                ),
                                React.createElement(RN.Text, { style: S.memberSub }, topRole ? topRole.name : "Нет ролей")
                            ),
                            React.createElement(RN.Text, { style: { color:"#5865f2", fontSize:13 } }, "🏷️")
                        );
                    }
                }),
            picker && React.createElement(RolePickerModal, {
                guildId,
                member: picker,
                allRoles,
                onClose: () => { setPicker(null); setTick(t => t+1); }
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
                    style: { marginTop: 8 },
                    data: roles,
                    keyExtractor: r => r.id,
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
                    React.createElement(RN.Text, { style: { color:"#b5bac1",fontSize:13,textAlign:"center",marginTop:6 } }, "Нет кешированных данных или никто не забанен.")
                  )
                : React.createElement(RN.FlatList, {
                    style: { marginTop: 8 },
                    data: bans,
                    keyExtractor: (b,i) => b.user?.id||String(i),
                    renderItem: ({ item: b }) =>
                        React.createElement(RN.View, { style: S.row },
                            React.createElement(RN.View, { style: [S.avatar, { backgroundColor:"#ed4245" }] },
                                React.createElement(RN.Text, { style: S.avatarText }, (b.user?.username||"?").slice(0,2).toUpperCase())),
                            React.createElement(RN.View, { style: { flex:1 } },
                                React.createElement(RN.Text, { style: S.memberName }, b.user?.username||b.user?.id||"Неизвестно"),
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
                style: { marginTop: 8 },
                data: FAKE_AUDIT,
                keyExtractor: (_,i) => String(i),
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
        const name    = guild?.name || "Сервер";
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

    // ─── FakeServerSettings ────────────────────────────────────────────────────

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

    // ─── Modal wrapper ─────────────────────────────────────────────────────────

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
            visible: true,
            animationType: "slide",
            presentationStyle: "pageSheet",
            onRequestClose: () => setVisible(false)
        }, React.createElement(FakeServerSettings, { guildId, onClose: () => setVisible(false) }));
    }

    // ─── Нативная круглая кнопка "Настройки" в стиле Discord ─────────────────
    // Рендерится так же как кнопки Бусты/Уведомления/Пригласить

    function NativeSettingsButton({ guildId }) {
        return React.createElement(RN.TouchableOpacity, {
            style: S.nativeBtn,
            onPress: () => {
                if (modalState.show) modalState.show(guildId || getGuildId());
                else showToast("❌ Модал не готов, перезагрузи Discord");
            },
            activeOpacity: 0.7,
        },
            React.createElement(RN.View, { style: S.nativeBtnCircle },
                React.createElement(RN.Text, { style: { fontSize: 26 } }, "⚙️")
            ),
            React.createElement(RN.Text, { style: S.nativeBtnLabel }, "Настройки")
        );
    }

    // ─── Permission patches ────────────────────────────────────────────────────

    function patchAllPermissions() {
        const PermissionStore = findByStoreName?.("PermissionStore") ||
                                findByProps("can", "getGuildPermissions", "getChannelPermissions");
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

        const MemberStore = findByProps("getSelfMember");
        if (MemberStore?.getSelfMember) {
            patches.push(after("getSelfMember", MemberStore, (_, member) => {
                if (!member) return member;
                try { member.permissions = mergePerms(member.permissions); } catch {}
                // Безусловно добавляем фейковую роль с макс. правами
                // чтобы Discord показывал кнопку настроек даже без прав
                try {
                    if (!Array.isArray(member.roles)) member.roles = [];
                    if (!member.roles.includes(FAKE_OWNER_ROLE_ID))
                        member.roles = [FAKE_OWNER_ROLE_ID, ...member.roles];
                } catch {}
                return member;
            }));
        }

        // Патчим getRoles чтобы фейк-роль была в сторе и Discord учитывал её permissions
        const RoleStore = findByProps("getRoles");
        if (RoleStore?.getRoles) {
            patches.push(after("getRoles", RoleStore, ([guildId], ret) => {
                if (!ret) return ret;
                if (!ret[FAKE_OWNER_ROLE_ID]) {
                    ret[FAKE_OWNER_ROLE_ID] = { ...FAKE_OWNER_ROLE };
                }
                return ret;
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
            } catch(e) { console.error("[FakeAdmin] profile patch:", e); }
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

    // ─── Главный патч: кнопка Настройки в шите сервера ────────────────────────
    //
    // Discord рендерит кнопки [Бусты, Пригласить, Уведомления, (Настройки если владелец)]
    // через компонент GuildProfileSheet → внутри есть View с горизонтальным рядом кнопок.
    // Мы патчим компоненты которые рендерят этот ряд и добавляем свою кнопку.

    function patchGuildProfileButtons() {

        function openSettings(guildId) {
            setTimeout(() => {
                if (modalState.show) modalState.show(guildId || getGuildId());
                else showToast("❌ Модал не готов, перезагрузи Discord");
            }, 80);
        }

        // ── Способ 1: хук useGuildProfileSheetSections / useGuildHeaderActions ──
        // Возвращает массив { label, icon, onPress } — точно такой же формат как нативные кнопки
        const hookNames = [
            "useGuildProfileSheetSections",
            "useGuildProfileSheetActions",
            "useGuildHeaderActions",
            "useGuildHeaderButtons",
            "useGuildContextMenuItems",
            "useServerContextMenuItems",
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
                        // Ищем любой массив внутри объекта
                        for (const k of Object.keys(ret)) {
                            if (Array.isArray(ret[k])) { ret[k] = [...ret[k], btn]; break; }
                        }
                    }
                } catch(e) { console.error("[FakeAdmin] hook:", hookName, e); }
                return ret;
            }));
        }

        // ── Способ 2: компонент GuildProfileSheet — патчим render, ищем ряд кнопок ──
        // Кнопки рендерятся в горизонтальном ScrollView/View.
        // Мы deep-walk по children и инжектим свою кнопку в тот же ряд.
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
                    // Ищем горизонтальный ряд кнопок рекурсивно и добавляем нашу
                    injectIntoButtonRow(ret, guildId);
                } catch(e) { console.error("[FakeAdmin] sheet patch:", e); }
                return ret;
            }));
        }

        // ── Способ 3: action sheet кнопки (FormRow в списке) ──────────────────
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
                } catch(e) { console.error("[FakeAdmin] action sheet:", name, e); }
                return ret;
            }));
        }
    }

    // Рекурсивно ищем горизонтальный ряд с кнопками и добавляем нашу
    function injectIntoButtonRow(element, guildId) {
        if (!element || typeof element !== "object") return false;
        const props = element.props;
        if (!props) return false;

        const children = props.children;
        if (!children) return false;

        const arr = Array.isArray(children) ? children : [children];

        // Ряд кнопок: горизонтальный View/ScrollView содержащий 2-4 дочерних View с label "Бусты"/"Уведомления" и т.п.
        // Эвристика: если массив из 2-5 элементов и стиль flexDirection:row — это наш ряд
        if (arr.length >= 2 && arr.length <= 5) {
            const style = props.style;
            const isRow = style?.flexDirection === "row" ||
                          (Array.isArray(style) && style.some(s => s?.flexDirection === "row"));
            // Ещё одна эвристика: ищем элементы у которых есть дочерний Text с нужными словами
            const hasBoosts = arr.some(el => JSON.stringify(el)?.includes("бусто") || JSON.stringify(el)?.includes("boost") || JSON.stringify(el)?.includes("Boost"));
            const hasNotif  = arr.some(el => JSON.stringify(el)?.includes("ведомлени") || JSON.stringify(el)?.includes("Notif"));

            if (isRow && (hasBoosts || hasNotif)) {
                // Добавляем нашу кнопку если её ещё нет
                if (!arr.some(el => el?.key === "__fa_settings_native")) {
                    arr.push(React.createElement(NativeSettingsButton, { key: "__fa_settings_native", guildId }));
                    props.children = arr;
                }
                return true;
            }
        }

        // Рекурсия по дочерним элементам
        for (const child of arr) {
            if (injectIntoButtonRow(child, guildId)) return true;
        }
        return false;
    }

    // ─── Settings UI ───────────────────────────────────────────────────────────

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);
        const [toast,   setToast  ] = React.useState(storage.showFakeToast);
        const [tick,    setTick   ] = React.useState(0);

        function resetFakeRoles() {
            storage.fakeRoles = {};
            setTick(t => t+1);
            showToast("🗑️ Все фейк-роли сброшены");
        }

        const totalFakeRoles = Object.values(storage.fakeRoles || {})
            .flatMap(guild => Object.values(guild))
            .reduce((acc, arr) => acc + arr.length, 0);

        return React.createElement(RN.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Admin Panel" },
                React.createElement(Forms.FormSwitch, {
                    label: "Включить плагин",
                    subLabel: "Патчит все проверки прав + добавляет кнопку Настройки",
                    value: enabled,
                    onValueChange: v => { setEnabled(v); storage.enabled = v; }
                }),
                React.createElement(Forms.FormSwitch, {
                    label: "Показывать тосты",
                    value: toast,
                    onValueChange: v => { setToast(v); storage.showFakeToast = v; }
                })
            ),
            React.createElement(Forms.FormSection, { title: "Фейк-роли" },
                React.createElement(Forms.FormRow, {
                    label: "Локально выдано ролей",
                    subLabel: `${totalFakeRoles} назначений сохранено в storage`,
                }),
                React.createElement(Forms.FormRow, {
                    label: "🗑️ Сбросить все фейк-роли",
                    subLabel: "Удаляет все локально выданные роли",
                    onPress: resetFakeRoles,
                })
            ),
            React.createElement(Forms.FormSection, { title: "Статус" },
                React.createElement(Forms.FormRow, { label: "Кнопка Настройки", subLabel: "Добавляется в ряд с Бусты/Уведомления" }),
                React.createElement(Forms.FormRow, { label: "getSelfMember пропатчен", subLabel: "Добавляет фейк-роль с макс. правами (Fake Admin)" }),
                React.createElement(Forms.FormRow, { label: "⚠️ API вернёт 403", subLabel: "Сервер Discord не даст реально управлять без прав" })
            )
        );
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    function onLoad() {
        if (!storage.enabled) return;
        patchAllPermissions();
        patchUserProfileSheet();
        patchGuildProfileButtons();
        injectModal();
        if (storage.showFakeToast) showToast("✅ FakeAdmin загружен");
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
        modalState.show = null;
    }

    return { onLoad, onUnload, settings: Settings };
})();
