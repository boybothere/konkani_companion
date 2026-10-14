import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { CircleAlert, FileSearch, Globe, Mic, Sparkles } from "lucide-react-native";
import { SignInError, useAuth } from "@/lib/auth";
import { configProblems } from "@/lib/config";
import { colors, radius } from "@/lib/theme";
import { AppText } from "@/components/ui/AppText";

const FEATURES = [
  { icon: Globe, text: "Answers grounded in live web search, with sources" },
  { icon: Mic, text: "Ask by typing or speaking in Konkani" },
  { icon: FileSearch, text: "Konkani and English summaries of documents" },
];

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

export default function SignInScreen() {
  const { user, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = configProblems();

  if (user) return <Redirect href="/chat" />;

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof SignInError ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logo}>
          <Sparkles size={20} color={colors.accent} />
        </View>
        <AppText size={26} weight="semibold">Konkani Companion</AppText>
        <AppText size={15} color={colors.muted} style={{ marginTop: 8 }}>
          <AppText size={15} color={colors.muted} devanagari>नमस्कार! </AppText>
          An AI assistant that answers in Devanagari Konkani. Sign in to start.
        </AppText>

        <View style={{ marginTop: 24, gap: 12 }}>
          {FEATURES.map(({ icon: Icon, text }) => (
            <View key={text} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Icon size={15} color={colors.muted} />
              </View>
              <AppText size={14} color={colors.muted} style={{ flex: 1 }}>{text}</AppText>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleSignIn}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator size="small" color={colors.background} /> : <GoogleLogo />}
          <AppText size={15} weight="medium" color={colors.background}>
            {busy ? "Waiting for Google…" : "Continue with Google"}
          </AppText>
        </Pressable>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
            <AppText size={14} color={colors.destructive} style={{ flex: 1 }}>{error}</AppText>
          </View>
        ) : null}

        {problems.length > 0 ? (
          <View style={styles.config}>
            <AppText size={12} weight="medium" color={colors.muted}>Setup needed</AppText>
            {problems.map((p) => (
              <AppText key={p} size={12} color={colors.subtle}>• {p}</AppText>
            ))}
          </View>
        ) : null}

        <AppText size={12} color={colors.subtle} style={{ marginTop: 24 }}>
          We use your Google account only to sign you in and keep your chat history private to you.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 440, width: "100%", alignSelf: "center" },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  button: {
    marginTop: 32,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  error: { flexDirection: "row", gap: 8, marginTop: 14 },
  config: {
    marginTop: 18,
    padding: 12,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
