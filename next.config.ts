import type { NextConfig } from "next";

// Security headers for every response. Deliberately no strict script CSP:
// Firebase's Google sign-in popup loads scripts and frames from Google
// domains, and a wrong CSP would break sign-in. These headers are safe with it.
const securityHeaders = [
  // Don't let other sites embed the app in a frame (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app records audio for voice input; nothing else is needed.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Sign-in with a popup needs the opener relationship kept.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // API routes set their own Cache-Control (streams need "no-transform").
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
