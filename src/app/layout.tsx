import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// Self-hosted by next/font, so Devanagari looks the same on every device.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-devanagari",
});

export const metadata: Metadata = {
  title: "Konkani Companion",
  description: "An AI assistant for Devanagari Konkani: voice, text and documents, answered in Konkani.",
};

export const viewport: Viewport = {
  themeColor: "#111214",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${notoDevanagari.variable} h-full antialiased dark`}>
      <body className="h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
