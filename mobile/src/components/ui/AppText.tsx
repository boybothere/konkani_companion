import { Text, type TextProps } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { hasDevanagari } from "@/lib/types";

type Weight = "regular" | "medium" | "semibold";

const LATIN: Record<Weight, string> = { regular: fonts.regular, medium: fonts.medium, semibold: fonts.semibold };
const DEVANAGARI: Record<Weight, string> = { regular: fonts.devRegular, medium: fonts.devMedium, semibold: fonts.devSemibold };

export type AppTextProps = TextProps & {
  weight?: Weight;
  size?: number;
  color?: string;
  /** Force the Devanagari font; by default it's chosen when the text contains Devanagari. */
  devanagari?: boolean;
};

/** Text in the app's fonts: Inter for Latin, Noto Sans Devanagari (with taller lines) for Konkani. */
export function AppText({ weight = "regular", size = 15, color = colors.foreground, devanagari, style, children, ...rest }: AppTextProps) {
  const dev = devanagari ?? (typeof children === "string" && hasDevanagari(children));
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: dev ? DEVANAGARI[weight] : LATIN[weight],
          fontSize: size,
          lineHeight: Math.round(size * (dev ? 1.75 : 1.45)),
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
