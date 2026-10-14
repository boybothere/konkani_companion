import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react-native";
import { colors, fonts, radius } from "@/lib/theme";
import { hasDevanagari } from "@/lib/types";
import { AppText } from "./ui/AppText";
import { KonkaniKeyboard } from "./KonkaniKeyboard";

const MAX_RECORDING_MS = 115_000; // the backend accepts up to 120 s of audio

interface ChatInputProps {
  onSend: (text: string, language: "en" | "kok") => void;
  /** Uploads the recording and resolves with the transcript. */
  onTranscribe: (uri: string) => Promise<string>;
  busy: boolean;
  onStop: () => void;
  onAttach: () => void;
}

type MicState = "idle" | "recording" | "transcribing";

export function ChatInput({ onSend, onTranscribe, busy, onStop, onAttach }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<"en" | "kok">("en");
  const [mic, setMic] = useState<MicState>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500);

  const canSend = input.trim().length > 0 && !busy && mic === "idle";

  const send = () => {
    if (!canSend) return;
    onSend(input.trim(), language);
    setInput("");
    selection.current = { start: 0, end: 0 };
  };

  // Insert at the cursor, like the website's on-screen keyboard.
  const insert = (text: string) => {
    const { start, end } = selection.current;
    const next = input.slice(0, start) + text + input.slice(end);
    setInput(next);
    selection.current = { start: start + text.length, end: start + text.length };
  };

  const backspace = () => {
    const { start, end } = selection.current;
    if (start !== end) {
      setInput(input.slice(0, start) + input.slice(end));
      selection.current = { start, end: start };
    } else if (start > 0) {
      // Remove one whole character (Devanagari letters can be 1-2 code units).
      const before = Array.from(input.slice(0, start));
      const removed = before.pop() ?? "";
      setInput(before.join("") + input.slice(end));
      const at = start - removed.length;
      selection.current = { start: at, end: at };
    }
  };

  const stopRecording = async () => {
    if (autoStop.current) clearTimeout(autoStop.current);
    autoStop.current = null;
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    const uri = recorder.uri;
    if (!uri) {
      setMic("idle");
      return;
    }
    setMic("transcribing");
    try {
      const text = (await onTranscribe(uri)).trim();
      if (text) {
        setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
        if (hasDevanagari(text)) setLanguage("kok"); // voice input is spoken Konkani
      } else {
        setMicError("No speech was recognised. Try speaking a little closer to the microphone.");
      }
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Transcription failed.");
    } finally {
      setMic("idle");
    }
  };

  const toggleRecording = async () => {
    setMicError(null);
    if (mic === "recording") return stopRecording();
    if (mic === "transcribing") return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone access needed", "Allow microphone access in Settings to ask questions by voice.");
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMic("recording");
      // Stop automatically before the backend's duration limit.
      autoStop.current = setTimeout(() => void stopRecording(), MAX_RECORDING_MS);
    } catch {
      setMicError("Couldn't start recording. Please try again.");
    }
  };

  const durationMs = recorderState.durationMillis ?? 0;

  const placeholder =
    mic === "recording" ? "Listening… tap ■ when you're done"
      : mic === "transcribing" ? "Transcribing your voice…"
        : language === "kok" ? "कोंकणींत बरयात…" : "Ask anything…";

  const seconds = Math.floor(durationMs / 1000);

  return (
    <View style={styles.wrap}>
      {language === "kok" && <KonkaniKeyboard onInsert={insert} onBackspace={backspace} />}

      <View style={styles.box}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSelectionChange={(e) => (selection.current = e.nativeEvent.selection)}
          placeholder={placeholder}
          placeholderTextColor={colors.subtle}
          multiline
          style={[styles.input, { fontFamily: hasDevanagari(input || placeholder) ? fonts.devRegular : fonts.regular }]}
          accessibilityLabel="Message"
        />
        <View style={styles.toolbar}>
          <Pressable onPress={onAttach} hitSlop={6} style={styles.tool} accessibilityLabel="Upload a document">
            <Paperclip size={19} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={toggleRecording}
            disabled={mic === "transcribing"}
            hitSlop={6}
            style={[styles.tool, mic === "recording" && styles.toolRecording]}
            accessibilityLabel={mic === "recording" ? "Stop recording" : "Record voice"}
          >
            {mic === "recording" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Square size={13} color={colors.destructive} fill={colors.destructive} />
                <AppText size={12} color={colors.destructive} style={{ fontVariant: ["tabular-nums"] }}>
                  {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
                </AppText>
              </View>
            ) : mic === "transcribing" ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <Mic size={19} color={colors.muted} />
            )}
          </Pressable>

          <View style={styles.toggle}>
            {(["en", "kok"] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => setLanguage(lang)}
                accessibilityState={{ selected: language === lang }}
                style={[styles.toggleItem, language === lang && styles.toggleActive]}
              >
                <AppText
                  size={12}
                  devanagari={lang === "kok"}
                  color={language === lang ? colors.background : colors.muted}
                  style={{ lineHeight: lang === "kok" ? 18 : 16 }}
                >
                  {lang === "en" ? "English" : "कोंकणी"}
                </AppText>
              </Pressable>
            ))}
          </View>

          {busy ? (
            <Pressable onPress={onStop} style={styles.send} accessibilityLabel="Stop generating">
              <Square size={13} color={colors.background} fill={colors.background} />
            </Pressable>
          ) : (
            <Pressable
              onPress={send}
              disabled={!canSend}
              style={[styles.send, !canSend && styles.sendDisabled]}
              accessibilityLabel="Send"
            >
              <ArrowUp size={18} color={canSend ? colors.background : colors.subtle} />
            </Pressable>
          )}
        </View>
      </View>

      <AppText size={11} color={micError ? colors.destructive : colors.subtle} style={{ textAlign: "center", marginTop: 6 }}>
        {micError ?? "Answers are generated by AI and translated into Konkani. Check important information."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  box: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
  input: { minHeight: 44, maxHeight: 140, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, fontSize: 15, color: colors.foreground },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  tool: { height: 36, minWidth: 36, paddingHorizontal: 8, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  toolRecording: { backgroundColor: colors.destructiveSoft },
  toggle: {
    marginLeft: "auto",
    flexDirection: "row",
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toggleItem: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: radius.pill },
  toggleActive: { backgroundColor: colors.foreground },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  sendDisabled: { backgroundColor: colors.surface3 },
});
