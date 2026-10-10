"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

type AuthState = {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a previous session. */
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/network-request-failed": "Couldn't reach Google. Check your connection and try again.",
  "auth/unauthorized-domain": "This website isn't allowed to sign in yet. Add its domain under Firebase → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "Google sign-in isn't enabled. Turn it on in Firebase → Authentication → Sign-in method.",
};

export class SignInError extends Error {}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setLoading(false);
      }),
    [],
  );

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      const message = code in SIGN_IN_ERRORS ? SIGN_IN_ERRORS[code] : "Sign-in failed. Please try again.";
      if (message) throw new SignInError(message);
    }
  };

  const signOut = () => firebaseSignOut(auth);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
