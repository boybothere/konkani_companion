import { useState } from "react";
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut, MessageSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react-native";
import type { SessionSummary } from "@/lib/types";
import { colors, fonts, radius } from "@/lib/theme";
import { AppText } from "./ui/AppText";

interface HistoryPanelProps {
  visible: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  currentId: string;
  query: string;
  onQueryChange: (q: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  account: { name: string | null; email: string | null; photoURL: string | null };
  onSignOut: () => void;
}

/** Chat history, the equivalent of the website's sidebar, sliding in from the left. */
export function HistoryPanel(props: HistoryPanelProps) {
  const { visible, onClose, sessions, currentId, query, onQueryChange, account } = props;
  const insets = useSafeAreaInsets();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const searching = query.trim().length > 0;

  const commitRename = (session: SessionSummary) => {
    setEditingId(null);
    if (draft.trim() && draft.trim() !== session.label) props.onRename(session.id, draft);
  };

  const confirmDelete = (session: SessionSummary) =>
    Alert.alert("Delete chat?", `"${session.label}" will be removed from all your devices.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => props.onDelete(session.id) },
    ]);

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "Your chats stay saved in your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: props.onSignOut },
    ]);

  const initial = (account.name || account.email || "?").trim().charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.panel, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <AppText size={15} weight="semibold">Konkani Companion</AppText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close history" style={styles.iconBtn}>
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <Pressable onPress={props.onNew} style={({ pressed }) => [styles.newChat, pressed && { backgroundColor: colors.sidebar }]}>
            <Plus size={16} color={colors.foreground} />
            <AppText size={14} weight="medium">New chat</AppText>
          </Pressable>

          <View style={styles.search}>
            <Search size={15} color={colors.subtle} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              placeholder="Search chats"
              placeholderTextColor={colors.subtle}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search chats"
            />
            {searching && (
              <Pressable onPress={() => onQueryChange("")} hitSlop={8} accessibilityLabel="Clear search">
                <X size={15} color={colors.subtle} />
              </Pressable>
            )}
          </View>

          <AppText size={11} weight="medium" color={colors.subtle} style={styles.sectionLabel}>
            {searching ? `${sessions.length} RESULT${sessions.length === 1 ? "" : "S"}` : "RECENT"}
          </AppText>

          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 32, alignItems: "center", gap: 4 }}>
                <AppText size={14} color={colors.muted}>{searching ? "No matching chats" : "No conversations yet"}</AppText>
                <AppText size={12} color={colors.subtle}>
                  {searching ? "Try a different word, in English or Konkani" : "Your chats will appear here"}
                </AppText>
              </View>
            }
            renderItem={({ item }) =>
              editingId === item.id ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  selectTextOnFocus
                  maxLength={120}
                  onBlur={() => commitRename(item)}
                  onSubmitEditing={() => commitRename(item)}
                  style={styles.renameInput}
                  accessibilityLabel="Chat name"
                />
              ) : (
                <Pressable
                  onPress={() => props.onOpen(item.id)}
                  style={({ pressed }) => [
                    styles.row,
                    (item.id === currentId || pressed) && { backgroundColor: colors.sidebar },
                  ]}
                >
                  <MessageSquare size={16} color={colors.subtle} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <AppText size={14} numberOfLines={1} color={item.id === currentId ? colors.foreground : colors.muted}>
                      {item.label}
                    </AppText>
                    {item.snippet ? (
                      <AppText size={12} color={colors.subtle} numberOfLines={2}>{item.snippet}</AppText>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => {
                      setEditingId(item.id);
                      setDraft(item.label);
                    }}
                    hitSlop={6}
                    style={styles.rowAction}
                    accessibilityLabel="Rename chat"
                  >
                    <Pencil size={15} color={colors.subtle} />
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(item)} hitSlop={6} style={styles.rowAction} accessibilityLabel="Delete chat">
                    <Trash2 size={15} color={colors.subtle} />
                  </Pressable>
                </Pressable>
              )
            }
          />

          <View style={styles.account}>
            {account.photoURL ? (
              <Image source={{ uri: account.photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                <AppText size={14} weight="medium">{initial}</AppText>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <AppText size={14} numberOfLines={1}>{account.name || "Signed in"}</AppText>
              {account.email ? <AppText size={12} color={colors.subtle} numberOfLines={1}>{account.email}</AppText> : null}
            </View>
            <Pressable onPress={confirmSignOut} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Sign out">
              <LogOut size={18} color={colors.subtle} />
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close history" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  panel: {
    width: "84%",
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingHorizontal: 10,
  },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, height: 48 },
  iconBtn: { padding: 8, borderRadius: radius.sm },
  newChat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginBottom: 10,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  searchInput: { flex: 1, height: 38, color: colors.foreground, fontFamily: fonts.regular, fontSize: 14 },
  sectionLabel: { paddingHorizontal: 8, paddingTop: 14, paddingBottom: 6, letterSpacing: 0.8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.sm },
  rowAction: { padding: 4 },
  renameInput: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    color: colors.foreground,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
});
