import { LayoutAnimation, Linking, Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ExternalLink, Globe } from "lucide-react-native";
import type { Source } from "@/lib/types";
import { colors, radius } from "@/lib/theme";
import { AppText } from "./ui/AppText";

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const PROVIDER_NAMES: Record<string, string> = { firecrawl: "Firecrawl", tavily: "Tavily", duckduckgo: "DuckDuckGo" };

interface SourcesPanelProps {
  sources: Source[];
  provider?: string | null;
  open: boolean;
  onToggle: () => void;
  highlightId?: number | null;
}

/** "Sources & Search Results": collapsed by default so the answer stays the focus. */
export function SourcesPanel({ sources, provider, open, onToggle, highlightId }: SourcesPanelProps) {
  if (sources.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Globe size={14} color={colors.subtle} />
        <AppText size={12} color={colors.subtle} style={{ flex: 1 }}>
          No web results were found, so this answer is based on general knowledge.
        </AppText>
      </View>
    );
  }

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.surface2 }]}
      >
        <Globe size={16} color={colors.muted} />
        <AppText size={14} weight="medium" style={{ flexShrink: 1 }} numberOfLines={1}>
          Sources & Search Results
        </AppText>
        <View style={styles.count}>
          <AppText size={11} color={colors.muted}>{sources.length}</AppText>
        </View>
        <ChevronDown size={16} color={colors.muted} style={{ marginLeft: "auto", transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>

      {open && (
        <View style={styles.list}>
          {sources.map((source, index) => (
            <Pressable
              key={source.id}
              onPress={() => Linking.openURL(source.url)}
              accessibilityRole="link"
              style={({ pressed }) => [
                styles.item,
                index > 0 && styles.divider,
                (pressed || highlightId === source.id) && { backgroundColor: colors.accentSoft },
              ]}
            >
              <View style={styles.badge}>
                <AppText size={11} color={colors.muted}>{source.id}</AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                  <AppText size={14} weight="medium" numberOfLines={2} style={{ flex: 1 }}>
                    {source.title || hostname(source.url)}
                  </AppText>
                  <ExternalLink size={13} color={colors.subtle} style={{ marginTop: 3 }} />
                </View>
                <AppText size={12} color={colors.subtle} numberOfLines={1}>{hostname(source.url)}</AppText>
                {source.snippet ? (
                  <AppText size={13} color={colors.muted} numberOfLines={3} style={{ marginTop: 4 }}>
                    {source.snippet}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          ))}
          {provider && PROVIDER_NAMES[provider] ? (
            <AppText size={11} color={colors.subtle} style={styles.provider}>
              Results via {PROVIDER_NAMES[provider]}
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  count: { backgroundColor: colors.surface3, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  item: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  provider: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
