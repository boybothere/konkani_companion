import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Copy, FileDown, FileText, Pencil, Share2 } from "lucide-react-native";
import type { Message } from "@/lib/types";
import { copyChat, shareChat, shareMarkdownFile, sharePdf } from "@/lib/chatExport";
import { colors, fonts, radius } from "@/lib/theme";
import { AppText } from "./ui/AppText";
import { Sheet } from "./ui/Sheet";

type Action = "rename" | "copy" | "share" | "pdf" | "markdown";

const ACTIONS: { id: Action; label: string; icon: typeof Copy }[] = [
  { id: "rename", label: "Rename", icon: Pencil },
  { id: "copy", label: "Copy conversation", icon: Copy },
  { id: "share", label: "Share…", icon: Share2 },
  { id: "pdf", label: "Save as PDF", icon: FileDown },
  { id: "markdown", label: "Export as Markdown file", icon: FileText },
];

interface ChatActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  messages: Message[];
  onRename: (title: string) => void;
  /** Start directly in rename mode (tapping the chat name). */
  startRenaming?: boolean;
}

/** The website's "⋯" chat menu: rename, copy, share, PDF, Markdown. */
export function ChatActionsSheet(props: ChatActionsSheetProps) {
  return (
    <Sheet visible={props.visible} onClose={props.onClose}>
      {/* Mounted only while open, so every opening starts from fresh state. */}
      {props.visible ? <SheetContent {...props} /> : null}
    </Sheet>
  );
}

function SheetContent({ onClose, title, messages, onRename, startRenaming }: ChatActionsSheetProps) {
  const [renaming, setRenaming] = useState(!!startRenaming);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (action: Action) => {
    if (action === "rename") {
      setRenaming(true);
      return;
    }
    setBusy(action);
    setNotice(null);
    try {
      if (action === "copy") {
        await copyChat(title, messages);
        setNotice("Copied to clipboard");
      } else if (action === "share") {
        await shareChat(title, messages);
        onClose();
      } else if (action === "pdf") {
        await sharePdf(title, messages);
        onClose();
      } else {
        await shareMarkdownFile(title, messages);
        onClose();
      }
    } catch {
      setNotice("That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const saveName = () => {
    if (draft.trim() && draft.trim() !== title) onRename(draft);
    onClose();
  };

  return (
    <>
      {renaming ? (
        <View style={{ padding: 8, gap: 12 }}>
          <AppText size={15} weight="semibold">Rename chat</AppText>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            selectTextOnFocus
            maxLength={120}
            onSubmitEditing={saveName}
            returnKeyType="done"
            style={styles.input}
            accessibilityLabel="Chat name"
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onClose} style={[styles.button, styles.secondary]}>
              <AppText size={14}>Cancel</AppText>
            </Pressable>
            <Pressable onPress={saveName} style={[styles.button, styles.primary]}>
              <AppText size={14} weight="medium" color={colors.background}>Save</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View>
          <AppText size={13} color={colors.subtle} numberOfLines={1} style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            {title}
          </AppText>
          {ACTIONS.map(({ id, label, icon: Icon }) => (
            <Pressable
              key={id}
              onPress={() => run(id)}
              disabled={busy !== null}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surface2 }]}
            >
              {busy === id ? <ActivityIndicator size="small" color={colors.muted} /> : <Icon size={18} color={colors.muted} />}
              <AppText size={15}>{label}</AppText>
            </Pressable>
          ))}
          {notice ? (
            <AppText size={13} color={colors.accent} style={{ paddingHorizontal: 12, paddingTop: 6 }}>{notice}</AppText>
          ) : null}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, paddingVertical: 13, borderRadius: radius.md },
  input: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    color: colors.foreground,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  button: { flex: 1, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  secondary: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  primary: { backgroundColor: colors.foreground },
});
