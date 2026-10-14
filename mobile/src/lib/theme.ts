// Same design tokens as the web app (src/app/globals.css).
export const colors = {
  background: "#111214",
  sidebar: "#0c0d0f",
  card: "#18191c",
  surface2: "#1f2125",
  surface3: "#282b30",
  foreground: "#ececee",
  muted: "#9a9ea7",
  subtle: "#6c7079",
  border: "#26292e",
  borderStrong: "#363a41",
  accent: "#3ecf9e",
  accentSoft: "rgba(62, 207, 158, 0.12)",
  destructive: "#f87171",
  destructiveSoft: "rgba(248, 113, 113, 0.08)",
  overlay: "rgba(0, 0, 0, 0.6)",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Loaded in src/app/_layout.tsx with expo-font.
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  devRegular: "NotoSansDevanagari_400Regular",
  devMedium: "NotoSansDevanagari_500Medium",
  devSemibold: "NotoSansDevanagari_600SemiBold",
} as const;
