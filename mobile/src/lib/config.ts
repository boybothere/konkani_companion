import Constants from "expo-constants";

// EXPO_PUBLIC_* values are inlined at build time, so each must be referenced literally.
const clean = (value: string | undefined) => (value ?? "").trim();

export const config = {
  apiBaseUrl: clean(process.env.EXPO_PUBLIC_API_BASE_URL).replace(/\/+$/, ""),
  firebase: {
    apiKey: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  },
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  variant: String(Constants.expoConfig?.extra?.appVariant ?? "production"),
};

/** Human-readable list of missing configuration, shown on the sign-in screen. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (!config.apiBaseUrl) problems.push("EXPO_PUBLIC_API_BASE_URL is not set.");
  if (!config.firebase.apiKey || !config.firebase.projectId) problems.push("The Firebase configuration is missing.");
  if (!config.googleWebClientId) problems.push("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set, so Google sign-in can't start.");
  return problems;
}
