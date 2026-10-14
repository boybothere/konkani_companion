import { Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { hasDevanagari } from "@/lib/types";
import { AppText } from "./ui/AppText";

const LIST_ITEM = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;
const CITATION = /(\[\d{1,2}\])/g;

interface RichTextProps {
  text: string;
  size?: number;
  /** Number of sources; citations above this are shown as plain text. */
  sourceCount?: number;
  onCitation?: (id: number) => void;
  /** Show a caret after the last character while streaming. */
  caret?: boolean;
  color?: string;
}

/**
 * Renders the backend's plain-text answers like the website does: paragraphs
 * separated by blank lines, "- " list items, and [n] citations as tappable chips.
 */
export function RichText({ text, size = 16, sourceCount = 0, onCitation, caret = false, color = colors.foreground }: RichTextProps) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  const dev = hasDevanagari(text);

  const inline = (line: string, key: string): ReactNode[] =>
    line.split(CITATION).map((part, i, parts) => {
      const match = /^\[(\d{1,2})\]$/.exec(part);
      const id = match ? Number(match[1]) : 0;
      if (match && id >= 1 && id <= sourceCount && onCitation) {
        return (
          <Text
            key={`${key}-${i}`}
            onPress={() => onCitation(id)}
            accessibilityRole="button"
            accessibilityLabel={`Source ${id}`}
            style={styles.citation}
          >
            {` ${id} `}
          </Text>
        );
      }
      // "Goa [1]." -> "Goa" + chip + "." (the chip has its own spacing)
      const nextId = /^\[(\d{1,2})\]$/.exec(parts[i + 1] ?? "")?.[1];
      const trimmed = onCitation && nextId && Number(nextId) <= sourceCount ? part.replace(/\s+$/, "") : part;
      return <Fragment key={`${key}-${i}`}>{trimmed}</Fragment>;
    });

  const caretEl = caret ? <Text style={{ color: colors.accent }}> ▍</Text> : null;

  if (blocks.length === 0) return caret ? <AppText size={size}>{caretEl}</AppText> : null;

  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, b) => {
        const isLastBlock = b === blocks.length - 1;
        const lines = block.split("\n").filter((l) => l.trim());
        const groups: { list: boolean; lines: string[] }[] = [];
        for (const line of lines) {
          const list = LIST_ITEM.test(line);
          const last = groups[groups.length - 1];
          if (last && last.list === list) last.lines.push(line);
          else groups.push({ list, lines: [line] });
        }
        return (
          <Fragment key={b}>
            {groups.map((group, g) => {
              const lastGroup = isLastBlock && g === groups.length - 1;
              if (group.list) {
                return (
                  <View key={g} style={{ gap: 6 }}>
                    {group.lines.map((line, l) => (
                      <View key={l} style={styles.listRow}>
                        <View style={[styles.bullet, { marginTop: size * (dev ? 0.85 : 0.65) }]} />
                        <AppText size={size} color={color} devanagari={dev} style={{ flex: 1 }}>
                          {inline(line.replace(LIST_ITEM, ""), `${b}-${g}-${l}`)}
                          {lastGroup && l === group.lines.length - 1 && caretEl}
                        </AppText>
                      </View>
                    ))}
                  </View>
                );
              }
              return (
                <AppText key={g} size={size} color={color} devanagari={dev} selectable>
                  {group.lines.map((line, l) => (
                    <Fragment key={l}>
                      {l > 0 && "\n"}
                      {inline(line, `${b}-${g}-${l}`)}
                    </Fragment>
                  ))}
                  {lastGroup && caretEl}
                </AppText>
              );
            })}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  citation: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    backgroundColor: colors.surface3,
  },
  listRow: { flexDirection: "row", gap: 10 },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted },
});
