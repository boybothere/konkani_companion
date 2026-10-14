import { useState } from "react";
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronDown, Delete } from "lucide-react-native";
import { colors, radius } from "@/lib/theme";
import { AppText } from "./ui/AppText";

// Same layout as the website's Konkani keyboard.
const ROWS = [
  { label: "स्वर", chars: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "अं", "अः"] },
  { label: "मात्रा", chars: ["ा", "ि", "ी", "ु", "ू", "े", "ै", "ो", "ौ", "ं", "ः", "्"] },
  { label: "क–ज", chars: ["क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ"] },
  { label: "ट–न", chars: ["ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न"] },
  { label: "प–ह", chars: ["प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह"] },
  { label: "विशेष", chars: ["ळ", "क्ष", "ज्ञ", "त्र", "श्र", "ँ", "ऱ", "।", "॥", "ॐ"] },
];

interface Props {
  onInsert: (text: string) => void;
  onBackspace: () => void;
}

export function KonkaniKeyboard({ onInsert, onBackspace }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.trigger, open && { borderColor: "rgba(62,207,158,0.4)", backgroundColor: colors.accentSoft }]}
      >
        <AppText size={15} devanagari color={open ? colors.accent : colors.muted}>क</AppText>
        <AppText size={12} weight="medium" color={open ? colors.accent : colors.muted}>Konkani keyboard</AppText>
        <ChevronDown size={12} color={open ? colors.accent : colors.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} keyboardShouldPersistTaps="always">
            {ROWS.map((row, i) => (
              <Pressable key={row.label} onPress={() => setTab(i)} style={[styles.tab, tab === i && styles.tabActive]}>
                <AppText size={13} devanagari color={tab === i ? colors.foreground : colors.subtle}>{row.label}</AppText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.grid}>
            {ROWS[tab].chars.map((char) => (
              <Pressable
                key={char}
                onPress={() => onInsert(char)}
                accessibilityLabel={char}
                style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
              >
                <AppText size={21} devanagari style={{ lineHeight: 28 }}>{char}</AppText>
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onBackspace} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface3 }]} accessibilityLabel="Delete">
              <Delete size={18} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => onInsert(" ")} style={({ pressed }) => [styles.action, { flex: 2.5 }, pressed && { backgroundColor: colors.surface3 }]}>
              <AppText size={13} color={colors.muted}>Space</AppText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 6,
  },
  panel: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  tabs: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.accent },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10 },
  key: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
  action: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
});
