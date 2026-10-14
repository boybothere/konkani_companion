import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ArrowDown, Check, Copy, Sparkles } from "lucide-react-native";
import type { Message } from "@/lib/types";
import { colors, radius } from "@/lib/theme";
import { AppText } from "./ui/AppText";
import { ErrorNote } from "./ui/ErrorNote";
import { StatusPill } from "./ui/StatusPill";
import { RichText } from "./RichText";
import { SourcesPanel } from "./SourcesPanel";

const SUGGESTIONS = [
  "गोंयचो सद्याचो मुख्यमंत्री कोण?",
  "What are the main crops grown in Goa?",
  "How do I apply for a ration card in Goa?",
  "What is the latest news from Goa today?",
];

const NEAR_BOTTOM = 96;

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  status: string | null;
  statusSince: number | null;
  onSuggestion: (text: string) => void;
}

export function MessageList({ messages, isLoading, status, statusSince, onSuggestion }: MessageListProps) {
  const scrollRef = useRef<ScrollView>(null);
  const stickToBottom = useRef(true);
  const userCount = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [openSources, setOpenSources] = useState<Record<number, boolean>>({});
  const [highlight, setHighlight] = useState<{ index: number; id: number } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const visible = messages.filter((m) => m.role !== "system");

  // Sending a new message always scrolls down; streaming only follows if the
  // reader is already at the bottom.
  useEffect(() => {
    const users = visible.filter((m) => m.role === "user").length;
    if (users > userCount.current) stickToBottom.current = true;
    userCount.current = users;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_BOTTOM;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom && visible.length > 0);
  };

  const copy = async (text: string, index: number) => {
    await Clipboard.setStringAsync(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 1800);
  };

  const showCitation = (index: number, id: number) => {
    setOpenSources((prev) => ({ ...prev, [index]: true }));
    setHighlight({ index, id });
    setTimeout(() => setHighlight(null), 1800);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={64}
        onContentSizeChange={() => stickToBottom.current && scrollRef.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={[styles.content, visible.length === 0 && { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.logo}>
              <Sparkles size={20} color={colors.accent} />
            </View>
            <AppText size={22} weight="semibold" style={{ textAlign: "center" }}>
              <AppText size={22} weight="semibold" devanagari>नमस्कार! </AppText>
              How can I help?
            </AppText>
            <AppText size={14} color={colors.muted} style={{ textAlign: "center", maxWidth: 320 }}>
              Ask in English or Konkani, by typing or speaking. Answers come back in Devanagari Konkani, with sources.
            </AppText>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => onSuggestion(s)}
                  style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <AppText size={14} color={colors.muted}>{s}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          visible.map((msg, index) => {
            if (msg.role === "user") {
              return (
                <View key={index} style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <AppText size={15} selectable>{msg.content}</AppText>
                  </View>
                </View>
              );
            }
            const streaming = index === visible.length - 1 && isLoading;
            const hasSources = msg.sources !== undefined && (msg.sources.length > 0 || msg.searched);
            return (
              <View key={index} style={{ gap: 12 }}>
                {hasSources && (
                  <SourcesPanel
                    sources={msg.sources ?? []}
                    provider={msg.provider}
                    open={!!openSources[index]}
                    onToggle={() => setOpenSources((prev) => ({ ...prev, [index]: !prev[index] }))}
                    highlightId={highlight?.index === index ? highlight.id : null}
                  />
                )}
                {msg.content ? (
                  <RichText
                    text={msg.content}
                    sourceCount={msg.sources?.length ?? 0}
                    onCitation={(id) => showCitation(index, id)}
                    caret={streaming && status === "translating"}
                  />
                ) : null}
                {streaming && status ? <StatusPill stage={status} since={statusSince} /> : null}
                {msg.error && !streaming ? <ErrorNote message={msg.error} /> : null}
                {msg.stopped && !streaming ? (
                  <AppText size={12} color={colors.subtle}>
                    {msg.content ? "Stopped — the answer above is incomplete." : "Stopped before an answer was generated."}
                  </AppText>
                ) : null}
                {msg.content && !streaming ? (
                  <Pressable onPress={() => copy(msg.content, index)} style={styles.action} accessibilityLabel="Copy response">
                    {copied === index ? <Check size={14} color={colors.accent} /> : <Copy size={14} color={colors.subtle} />}
                    <AppText size={12} color={copied === index ? colors.accent : colors.subtle}>
                      {copied === index ? "Copied" : "Copy"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {showJump && (
        <Pressable
          onPress={() => {
            stickToBottom.current = true;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
          style={styles.jump}
        >
          <ArrowDown size={14} color={colors.foreground} />
          <AppText size={12}>{isLoading ? "Follow the answer" : "Jump to latest"}</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 28 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 24 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  suggestions: { alignSelf: "stretch", gap: 8, marginTop: 12 },
  suggestion: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: colors.surface3,
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, paddingRight: 8 },
  jump: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
});
