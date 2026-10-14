import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { STATUS_LABELS } from "@/lib/sse";
import { colors, radius } from "@/lib/theme";
import { AppText } from "./AppText";

/** The stage the backend last reported, with honest elapsed time. It never advances on its own. */
export function StatusPill({ stage, since }: { stage: string; since?: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;

  return (
    <View style={styles.pill} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.accent} />
      <AppText size={13} color={colors.muted}>
        {STATUS_LABELS[stage] ?? "Working…"}
      </AppText>
      {seconds >= 5 && (
        <AppText size={13} color={colors.subtle} style={{ fontVariant: ["tabular-nums"] }}>
          {seconds}s
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
