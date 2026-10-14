import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { Menu, MoreHorizontal } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { ApiError, apiFetch, errorFrom, isAbort } from "@/lib/api";
import { chatStore } from "@/lib/chatStore";
import { readCompanionStream } from "@/lib/sse";
import type { Message, SessionSummary } from "@/lib/types";
import { hasDevanagari } from "@/lib/types";
import { colors } from "@/lib/theme";
import { AppText } from "@/components/ui/AppText";
import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ChatActionsSheet } from "@/components/ChatActionsSheet";

const newSessionId = () => Date.now().toString();

// Older stored chats may have `error: true`; keep only text errors.
const normalise = (messages: Message[]): Message[] =>
  messages.map((m) => (typeof m.error === "string" ? m : { ...m, error: undefined }));

export default function ChatScreen() {
  const { user, signOut } = useAuth();
  const uid = user!.uid; // (app)/_layout guarantees a signed-in user

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusSince, setStatusSince] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actions, setActions] = useState<{ open: boolean; rename: boolean }>({ open: false, rename: false });

  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0); // incremented on every send and chat switch; stale streams stop writing
  const savedRef = useRef<Record<string, string>>({}); // last version written per chat

  const refreshSessions = useCallback(() => setSessions(chatStore.list()), []);

  // Load this user's chats from the device, then pull the latest from Firestore.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await chatStore.load(uid);
      if (cancelled) return;
      refreshSessions();
      try {
        await chatStore.syncFromRemote(uid);
        if (!cancelled) refreshSessions();
      } catch (err) {
        console.warn("Couldn't load chat history from the cloud:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refreshSessions]);

  // Persist changes: device on every change, Firestore once an answer has finished.
  useEffect(() => {
    if (messages.length === 0) return;
    const snapshot = JSON.stringify(messages);
    if (savedRef.current[sessionId] === snapshot) return;
    chatStore.save(uid, sessionId, messages);
    refreshSessions();
    if (isLoading) return;
    savedRef.current[sessionId] = snapshot;
    chatStore.saveRemote(uid, sessionId).catch((err) => console.warn("Cloud save failed:", err));
  }, [messages, sessionId, isLoading, uid, refreshSessions]);

  const updateLast = (patch: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
      return next;
    });

  const setStage = (stage: string | null) => {
    setStatus(stage);
    setStatusSince((since) => (stage ? since ?? Date.now() : null));
  };

  const send = async (content: string, language: "en" | "kok") => {
    if (!content.trim() || isLoading) return;
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setIsLoading(true);
    setStatus("starting");
    setStatusSince(Date.now());

    const controller = new AbortController();
    abortRef.current = controller;
    const run = ++runRef.current;
    const current = () => runRef.current === run;
    const patch: typeof updateLast = (p) => {
      if (current()) updateLast(p);
    };

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // English versions let the backend keep conversation context.
          messages: history.map(({ role, content: c, english }) => ({ role, content: c, english })),
          language,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new ApiError(res.status, await errorFrom(res, "The server returned an error. Please try again."));

      let finished = false;
      let answer = "";
      for await (const event of readCompanionStream(res)) {
        switch (event.type) {
          case "status":
            if (current()) setStage(event.stage);
            break;
          case "meta":
            if (current())
              setMessages((prev) => {
                const next = [...prev];
                const userIndex = next.length - 2;
                if (next[userIndex]?.role === "user") next[userIndex] = { ...next[userIndex], english: event.queryEn };
                return next;
              });
            break;
          case "sources":
            patch({ sources: event.sources, provider: event.provider, searched: true });
            break;
          case "delta":
            answer += event.text;
            patch({ content: answer });
            break;
          case "english":
            patch({ english: event.text });
            break;
          case "error":
            patch({ error: event.message });
            break;
          case "done":
            finished = true;
            break;
        }
      }
      if (!finished) patch((m) => ({ error: m.error ?? "The connection closed before the answer finished. Please try again." }));
    } catch (err) {
      if (isAbort(err)) patch({ stopped: true });
      else patch({ error: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (current()) {
        setIsLoading(false);
        setStage(null);
      }
    }
  };

  const transcribe = async (uri: string): Promise<string> => {
    const form = new FormData();
    form.append("file", new File(uri) as unknown as Blob);
    const res = await apiFetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) throw new Error(await errorFrom(res, "Transcription failed. Please try again."));
    const data = (await res.json()) as { text?: unknown };
    return typeof data.text === "string" ? data.text : "";
  };

  const switchSession = (id: string) => {
    setHistoryOpen(false);
    if (id === sessionId) return; // re-selecting the open chat must not stop its answer
    runRef.current++;
    abortRef.current?.abort();
    setIsLoading(false);
    setStage(null);
    const loaded = normalise(chatStore.messages(id));
    savedRef.current[id] = JSON.stringify(loaded); // opening a chat is not a change
    setMessages(loaded);
    setSessionId(id);
  };

  const newChat = () => {
    switchSession(newSessionId());
    setMessages([]);
  };

  const rename = (id: string, title: string) => {
    chatStore.rename(uid, id, title).catch((err) => console.warn("Cloud rename failed:", err));
    refreshSessions();
  };

  const remove = (id: string) => {
    chatStore.remove(uid, id).catch((err) => console.warn("Cloud delete failed:", err));
    refreshSessions();
    if (id === sessionId) newChat();
  };

  const handleSignOut = async () => {
    runRef.current++;
    abortRef.current?.abort();
    setHistoryOpen(false);
    await chatStore.clear(uid);
    await signOut(); // (app)/_layout redirects to sign-in
  };

  const title =
    chatStore.title(sessionId) || (messages.find((m) => m.role === "user")?.content ?? "New chat").replace(/\s+/g, " ").slice(0, 60);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => setHistoryOpen(true)} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Chat history">
          <Menu size={21} color={colors.muted} />
        </Pressable>
        {messages.length > 0 ? (
          <>
            <Pressable onPress={() => !isLoading && setActions({ open: true, rename: true })} style={{ flex: 1 }} accessibilityLabel="Rename chat">
              <AppText size={15} weight="medium" numberOfLines={1} devanagari={hasDevanagari(title)}>
                {title}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => setActions({ open: true, rename: false })}
              disabled={isLoading}
              hitSlop={8}
              style={[styles.headerBtn, isLoading && { opacity: 0.4 }]}
              accessibilityLabel="Chat options"
            >
              <MoreHorizontal size={21} color={colors.muted} />
            </Pressable>
          </>
        ) : (
          <AppText size={16} weight="semibold" style={{ flex: 1 }}>Konkani Companion</AppText>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <MessageList
          messages={messages}
          isLoading={isLoading}
          status={status}
          statusSince={statusSince}
          onSuggestion={(text) => send(text, hasDevanagari(text) ? "kok" : "en")}
        />
        <ChatInput
          onSend={send}
          onTranscribe={transcribe}
          busy={isLoading}
          onStop={() => abortRef.current?.abort()}
          onAttach={() => router.navigate("/documents")}
        />
      </KeyboardAvoidingView>

      <HistoryPanel
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessions={query.trim() ? chatStore.search(query) : sessions}
        currentId={sessionId}
        query={query}
        onQueryChange={setQuery}
        onNew={newChat}
        onOpen={switchSession}
        onRename={rename}
        onDelete={remove}
        account={{ name: user!.displayName, email: user!.email, photoURL: user!.photoURL }}
        onSignOut={handleSignOut}
      />

      <ChatActionsSheet
        visible={actions.open}
        startRenaming={actions.rename}
        onClose={() => setActions({ open: false, rename: false })}
        title={title}
        messages={messages}
        onRename={(t) => rename(sessionId, t)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { padding: 8, borderRadius: 8 },
});
