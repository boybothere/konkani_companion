import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { config } from "./config";
import { secureAuthStorage } from "./secureStorage";

// The same Firebase project as the website: same users, same Firestore chats.
export const app = getApps().length ? getApp() : initializeApp(config.firebase);

function createAuth(): Auth {
  try {
    // Persist the session in the device keystore so users stay signed in across restarts.
    return initializeAuth(app, { persistence: getReactNativePersistence(secureAuthStorage) });
  } catch {
    return getAuth(app); // already initialised (fast refresh)
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
