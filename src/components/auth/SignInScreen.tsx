"use client";

import { useState } from "react";
import { AlertCircle, FileSearch, Globe, Mic, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/StatusIndicator";
import { SignInError, useAuth } from "./AuthProvider";

const FEATURES = [
  { icon: Globe, text: "Answers grounded in live web search, with sources" },
  { icon: Mic, text: "Ask by typing or speaking in Konkani" },
  { icon: FileSearch, text: "Konkani and English summaries of documents" },
];

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-[18px] w-[18px]">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SignInScreen() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="flex h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Konkani Companion</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <span lang="kok" className="devanagari">नमस्कार!</span> An AI assistant that answers in Devanagari Konkani.
          Sign in to start.
        </p>

        <ul className="mt-6 space-y-2.5">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                <Icon className="h-3.5 w-3.5" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? <Spinner className="border-background/30 border-t-background" /> : <GoogleLogo />}
          {busy ? "Waiting for Google…" : "Continue with Google"}
        </button>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-subtle-foreground">
          We use your Google account only to sign you in and keep your chat history private to you.
        </p>
      </div>
    </main>
  );
}

export function SplashScreen() {
  return (
    <main className="flex h-dvh items-center justify-center bg-background" aria-busy="true">
      <Spinner className="h-5 w-5" />
    </main>
  );
}
