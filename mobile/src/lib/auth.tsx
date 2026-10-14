import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import { config } from "./config";

export class SignInError extends Error {}

type AuthState = {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a saved session. */
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

if (config.googleWebClientId) {
  // The web client id makes Google return an ID token that Firebase accepts.
  GoogleSignin.configure({ webClientId: config.googleWebClientId });
}

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/network-request-failed": "Couldn't reach Google. Check your connection and try again.",
  "auth/invalid-credential": "Google sign-in was rejected. Please try again.",
  "auth/operation-not-allowed": "Google sign-in isn't enabled for this Firebase project.",
  "auth/user-disabled": "This account has been disabled.",
};

function describe(err: unknown): string | null {
  if (isErrorWithCode(err)) {
    switch (err.code) {
      case statusCodes.IN_PROGRESS:
        return null; // a sign-in is already showing
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return "Google Play services are missing or out of date on this device.";
      case "10":
      case "DEVELOPER_ERROR":
        return "Google sign-in isn't set up for this app build yet: its SHA-1 fingerprint must be registered in Firebase (see mobile/README.md).";
    }
    const firebase = FIREBASE_ERRORS[err.code];
    if (firebase) return firebase;
  }
  return "Sign-in failed. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
    if (!config.googleWebClientId) {
      throw new SignInError("Google sign-in isn't configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing.");
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // cancelled by the user
      const idToken = response.data.idToken;
      if (!idToken) throw new SignInError("Google didn't return an ID token. Check the web client id.");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (err) {
      if (err instanceof SignInError) throw err;
      const message = describe(err);
      if (message) throw new SignInError(message);
    }
  };

  const signOut = async () => {
    await GoogleSignin.signOut().catch(() => {}); // so the account picker shows next time
    await firebaseSignOut(auth);
  };

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
