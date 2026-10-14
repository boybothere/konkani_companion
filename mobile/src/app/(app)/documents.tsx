import { useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { File } from "expo-file-system";
import { ArrowUp, Camera, Check, ChevronDown, Copy, FileText, Image as ImageIcon, RotateCcw, Square, Upload, X } from "lucide-react-native";
import { ApiError, apiFetch, errorFrom, isAbort } from "@/lib/api";
import { readCompanionStream } from "@/lib/sse";
import { colors, fonts, radius } from "@/lib/theme";
import { hasDevanagari } from "@/lib/types";
import { AppText } from "@/components/ui/AppText";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { StatusPill } from "@/components/ui/StatusPill";
import { RichText } from "@/components/RichText";

interface AnalysisResult {
  ocr_text: string;
  english_translation: string;
  summary: string; // Devanagari Konkani
  summary_english?: string;
  error: boolean;
  pages?: number;
  method?: "pdf-text" | "ocr" | "mixed";
  truncated?: boolean;
}

interface DocMessage {
  role: "user" | "assistant";
  content: string; // Konkani
  english?: string;
  bilingual?: boolean;
  error?: string;
  stopped?: boolean;
}

type Picked = { uri: string; name: string; size: number; mimeType: string; isImage: boolean };

const MAX_BYTES = 15 * 1024 * 1024; // matches the backend's MAX_DOCUMENT_BYTES default
const ALLOWED = /\.(pdf|png|jpe?g|webp|tiff?)$/i;
const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff"];

const METHOD_LABELS: Record<string, string> = {
  "pdf-text": "Text read directly from the PDF",
  ocr: "Text read with OCR",
  mixed: "PDF text + OCR",
};

const SUMMARY_INTENT = /\b(summar(y|ies|ise|ize|ised|ized)|overview|gist|main points?|key points?|in short|briefly|tl;?dr|recap|outline)\b/i;
const SUMMARY_INTENT_KOK = /(सारांश|गोशवारो|गोषवारो|थोडक्यांत|थोडक्यात)/;
const wantsBilingual = (q: string, qEn = "") => SUMMARY_INTENT.test(q) || SUMMARY_INTENT.test(qEn) || SUMMARY_INTENT_KOK.test(q);

const QUESTION_SUGGESTIONS = ["Summarise this document", "What should I do next?", "Are there any deadlines or amounts?"];

// Module-level so React's purity lint doesn't treat it as render-time Date.now().
const timestamp = () => Date.now();

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function validate(file: Picked): string | null {
  if (!ALLOWED.test(file.name) && !ALLOWED_MIME.includes(file.mimeType)) {
    return "Unsupported file type. Upload a PDF, PNG, JPEG, WEBP or TIFF file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`;
  return null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      hitSlop={6}
      style={styles.copy}
      accessibilityLabel="Copy"
    >
      {copied ? <Check size={14} color={colors.accent} /> : <Copy size={14} color={colors.subtle} />}
      <AppText size={12} color={copied ? colors.accent : colors.subtle}>{copied ? "Copied" : "Copy"}</AppText>
    </Pressable>
  );
}

function LanguagePanel({ label, sublabel, text, caret, pending }: {
  label: string; sublabel?: string; text: string; caret?: boolean; pending?: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <AppText size={14} weight="semibold" devanagari={hasDevanagari(label)}>{label}</AppText>
        {sublabel ? <AppText size={12} color={colors.subtle}>{sublabel}</AppText> : null}
        <View style={{ marginLeft: "auto" }}>{text && !caret ? <CopyButton text={text} /> : null}</View>
      </View>
      {text ? <RichText text={text} size={15} caret={caret} /> : <AppText size={14} color={colors.subtle}>{pending}</AppText>}
    </View>
  );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.panelFlat}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.disclosureHeader}
      >
        <AppText size={14} weight="medium" color={colors.muted}>{title}</AppText>
        <ChevronDown size={16} color={colors.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export default function DocumentsScreen() {
  const [file, setFile] = useState<Picked | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [docMessages, setDocMessages] = useState<DocMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [askStage, setAskStage] = useState<string | null>(null);
  const [askSince, setAskSince] = useState<number | null>(null);
  const analyzeAbort = useRef<AbortController | null>(null);
  const askAbort = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const analyzing = stage !== null;
  const asking = askStage !== null;

  const select = (picked: Picked) => {
    if (analyzing) return;
    const error = validate(picked);
    setFileError(error);
    if (error) return;
    askAbort.current?.abort();
    setFile(picked);
    setResult(null);
    setAnalyzeError(null);
    setDocMessages([]);
  };

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ALLOWED_MIME, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    select({ uri: a.uri, name: a.name, size: a.size ?? new File(a.uri).size, mimeType: a.mimeType ?? "", isImage: (a.mimeType ?? "").startsWith("image/") });
  };

  const pickImage = async (source: "camera" | "library") => {
    const permission =
      source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo"} access in Settings to add a document.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.85 };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const name = a.fileName ?? `document-${timestamp()}.jpg`;
    select({ uri: a.uri, name, size: a.fileSize ?? new File(a.uri).size, mimeType: a.mimeType ?? "image/jpeg", isImage: true });
  };

  const clearFile = () => {
    analyzeAbort.current?.abort();
    askAbort.current?.abort();
    setFile(null);
    setResult(null);
    setAnalyzeError(null);
    setFileError(null);
    setDocMessages([]);
  };

  const formFor = (picked: Picked) => {
    const form = new FormData();
    form.append("file", new File(picked.uri) as unknown as Blob, picked.name);
    return form;
  };

  const analyze = async () => {
    if (!file || analyzing) return;
    const controller = new AbortController();
    analyzeAbort.current = controller;
    setStage("uploading");
    setSince(timestamp());
    setResult(null);
    setAnalyzeError(null);
    setDocMessages([]);

    try {
      let data: unknown = null;
      const res = await apiFetch("/api/analyze-document?stream=1", { method: "POST", body: formFor(file), signal: controller.signal });
      if (res.status === 404) {
        // Older backend without stage reporting: one honest "processing" state.
        setStage("processing");
        const plain = await apiFetch("/api/analyze-document", { method: "POST", body: formFor(file), signal: controller.signal });
        if (!plain.ok) throw new ApiError(plain.status, await errorFrom(plain, "Failed to analyze the document."));
        data = await plain.json();
      } else if (!res.ok || !res.body) {
        throw new ApiError(res.status, await errorFrom(res, "Failed to analyze the document."));
      } else {
        for await (const event of readCompanionStream(res)) {
          if (event.type === "status") setStage(event.stage);
          else if (event.type === "result") data = event.data;
          else if (event.type === "error") throw new Error(event.message);
        }
        if (!data) throw new Error("The connection closed before the analysis finished. Please try again.");
      }
      const parsed = data as AnalysisResult;
      if (typeof parsed?.summary !== "string") throw new Error("The server returned an unexpected response.");
      if (parsed.error) setAnalyzeError(parsed.summary);
      else setResult(parsed);
    } catch (err) {
      if (!isAbort(err)) setAnalyzeError(err instanceof Error ? err.message : "Failed to analyze the document.");
    } finally {
      if (analyzeAbort.current === controller) analyzeAbort.current = null;
      setStage(null);
      setSince(null);
    }
  };

  const updateAnswer = (patch: Partial<DocMessage>) =>
    setDocMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });

  const ask = async (text: string = question) => {
    const q = text.trim();
    if (!q || asking || !result?.english_translation) return;
    setDocMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "", english: "", bilingual: wantsBilingual(q) }]);
    setQuestion("");
    setAskStage("starting");
    setAskSince(timestamp());
    const controller = new AbortController();
    askAbort.current = controller;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    let answer = "";
    let english = "";
    try {
      const res = await apiFetch("/api/document-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, document_context: result.english_translation }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new ApiError(res.status, await errorFrom(res, "Couldn't get an answer. Please try again."));
      let finished = false;
      for await (const event of readCompanionStream(res)) {
        switch (event.type) {
          case "status": setAskStage(event.stage); break;
          case "meta": if (wantsBilingual(q, event.queryEn)) updateAnswer({ bilingual: true }); break;
          case "englishDelta": english += event.text; updateAnswer({ english }); break;
          case "english": if (!english) { english = event.text; updateAnswer({ english }); } break;
          case "delta": answer += event.text; updateAnswer({ content: answer }); break;
          case "error": updateAnswer({ error: event.message }); break;
          case "done": finished = true; break;
        }
      }
      if (!finished) updateAnswer({ error: "The connection closed before the answer finished. Please try again." });
    } catch (err) {
      if (isAbort(err)) updateAnswer({ stopped: true });
      else updateAnswer({ error: err instanceof Error ? err.message : "Couldn't get an answer." });
    } finally {
      if (askAbort.current === controller) askAbort.current = null;
      setAskStage(null);
      setAskSince(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <AppText size={16} weight="semibold">Document Lens</AppText>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText size={14} color={colors.muted}>
            Photograph or upload a notice, circular or letter in Devanagari. You&apos;ll get summaries in Konkani and English, and can ask questions about it.
          </AppText>

          {!file ? (
            <View style={{ gap: 10 }}>
              <Pressable onPress={() => pickImage("camera")} style={({ pressed }) => [styles.bigButton, pressed && styles.pressed]}>
                <Camera size={20} color={colors.foreground} />
                <AppText size={15} weight="medium">Take a photo</AppText>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={pickDocument} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                  <Upload size={18} color={colors.muted} />
                  <AppText size={14} color={colors.muted}>Choose a file</AppText>
                </Pressable>
                <Pressable onPress={() => pickImage("library")} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                  <ImageIcon size={18} color={colors.muted} />
                  <AppText size={14} color={colors.muted}>From photos</AppText>
                </Pressable>
              </View>
              <AppText size={12} color={colors.subtle} style={{ textAlign: "center" }}>
                PDF, PNG, JPEG, WEBP or TIFF · up to {formatBytes(MAX_BYTES)} · printed Devanagari works best
              </AppText>
            </View>
          ) : (
            <View style={styles.fileCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {file.isImage ? (
                  <Image source={{ uri: file.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }]}>
                    <FileText size={20} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="medium" numberOfLines={1}>{file.name}</AppText>
                  <AppText size={12} color={colors.subtle}>{formatBytes(file.size)}</AppText>
                </View>
                <Pressable onPress={clearFile} hitSlop={8} accessibilityLabel="Remove document" style={{ padding: 6 }}>
                  <X size={18} color={colors.subtle} />
                </Pressable>
              </View>
              {analyzing ? (
                <Pressable onPress={() => analyzeAbort.current?.abort()} style={[styles.actionButton, styles.secondary]}>
                  <AppText size={14} weight="medium">Cancel</AppText>
                </Pressable>
              ) : !result ? (
                <Pressable onPress={analyze} style={[styles.actionButton, styles.primary]}>
                  {analyzeError ? <RotateCcw size={16} color={colors.background} /> : <FileText size={16} color={colors.background} />}
                  <AppText size={14} weight="medium" color={colors.background}>{analyzeError ? "Try again" : "Analyze document"}</AppText>
                </Pressable>
              ) : (
                <Pressable onPress={clearFile} style={[styles.actionButton, styles.secondary]}>
                  <AppText size={14} weight="medium">Analyze another</AppText>
                </Pressable>
              )}
            </View>
          )}

          {fileError ? <ErrorNote message={fileError} /> : null}
          {analyzing && stage ? <StatusPill stage={stage} since={since} /> : null}
          {analyzeError && !analyzing ? <ErrorNote message={analyzeError} /> : null}

          {result ? (
            <View style={{ gap: 14 }}>
              <View style={{ gap: 2 }}>
                <AppText size={16} weight="semibold">Summary</AppText>
                <AppText size={12} color={colors.subtle}>
                  {[
                    result.pages ? `${result.pages} page${result.pages > 1 ? "s" : ""}` : null,
                    result.method ? METHOD_LABELS[result.method] ?? result.method : null,
                    result.truncated ? "only the first part was processed" : null,
                  ].filter(Boolean).join(" · ")}
                </AppText>
              </View>
              <LanguagePanel label="कोंकणी" sublabel="Konkani" text={result.summary} />
              {result.summary_english ? <LanguagePanel label="English" text={result.summary_english} /> : null}

              {result.english_translation ? (
                <Disclosure title="Full English translation">
                  <AppText size={14} color={colors.muted} selectable>{result.english_translation}</AppText>
                </Disclosure>
              ) : null}
              {result.ocr_text ? (
                <Disclosure title="Extracted text (original)">
                  <AppText size={14} color={colors.muted} selectable>{result.ocr_text}</AppText>
                </Disclosure>
              ) : null}

              <View style={styles.panelFlat}>
                <View style={styles.qaHeader}>
                  <AppText size={14} weight="semibold">Ask about this document</AppText>
                </View>
                <View style={{ padding: 14, gap: 14 }}>
                  {docMessages.length === 0 ? (
                    <View style={{ gap: 10 }}>
                      <AppText size={13} color={colors.subtle}>Answers are in Konkani. Ask for a summary to get it in Konkani and English.</AppText>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {QUESTION_SUGGESTIONS.map((s) => (
                          <Pressable key={s} onPress={() => ask(s)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                            <AppText size={12} color={colors.muted}>{s}</AppText>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {docMessages.map((msg, i) => {
                    const streaming = i === docMessages.length - 1 && asking;
                    if (msg.role === "user") {
                      return (
                        <View key={i} style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                          <View style={styles.userBubble}><AppText size={14}>{msg.content}</AppText></View>
                        </View>
                      );
                    }
                    return (
                      <View key={i} style={{ gap: 10 }}>
                        {msg.bilingual ? (
                          <>
                            <LanguagePanel
                              label="कोंकणी" sublabel="Konkani" text={msg.content}
                              caret={streaming && !!msg.content}
                              pending={streaming ? "Translating…" : msg.stopped ? "Stopped." : ""}
                            />
                            <LanguagePanel
                              label="English" text={msg.english ?? ""}
                              caret={streaming && !!msg.english && askStage !== "translating"}
                              pending={streaming ? "Writing…" : ""}
                            />
                          </>
                        ) : msg.content ? (
                          <RichText text={msg.content} size={15} caret={streaming} />
                        ) : null}
                        {streaming && askStage ? <StatusPill stage={askStage} since={askSince} /> : null}
                        {msg.error && !streaming ? <ErrorNote message={msg.error} /> : null}
                        {msg.stopped && !streaming && !msg.bilingual ? (
                          <AppText size={12} color={colors.subtle}>
                            {msg.content ? "Stopped — the answer above is incomplete." : "Stopped before an answer was generated."}
                          </AppText>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                <View style={styles.askRow}>
                  <TextInput
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="e.g. What action should I take?"
                    placeholderTextColor={colors.subtle}
                    onSubmitEditing={() => ask()}
                    returnKeyType="send"
                    style={[styles.askInput, { fontFamily: hasDevanagari(question) ? fonts.devRegular : fonts.regular }]}
                    accessibilityLabel="Question about the document"
                  />
                  {asking ? (
                    <Pressable onPress={() => askAbort.current?.abort()} style={styles.askButton} accessibilityLabel="Stop">
                      <Square size={13} color={colors.background} fill={colors.background} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => ask()}
                      disabled={!question.trim()}
                      style={[styles.askButton, !question.trim() && { backgroundColor: colors.surface3 }]}
                      accessibilityLabel="Ask"
                    >
                      <ArrowUp size={17} color={question.trim() ? colors.background : colors.subtle} />
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  pressed: { backgroundColor: colors.surface2 },
  bigButton: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  option: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  fileCard: {
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actionButton: { height: 46, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primary: { backgroundColor: colors.foreground },
  secondary: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  panel: {
    padding: 14,
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelFlat: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  disclosureHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 13 },
  disclosureBody: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  copy: { flexDirection: "row", alignItems: "center", gap: 4 },
  qaHeader: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  userBubble: { maxWidth: "85%", backgroundColor: colors.surface3, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  askRow: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  askInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    color: colors.foreground,
    fontSize: 14,
  },
  askButton: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
});
