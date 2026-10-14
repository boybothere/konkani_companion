/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * App configuration. All environment-specific values come from environment
 * variables (see .env.example), never from source code.
 *
 * APP_VARIANT selects the build flavour:
 *   development / staging -> installs next to production with a suffixed id and name
 *   production (default)  -> com.konkanicompanion.app
 */
const VARIANT = (process.env.APP_VARIANT ?? "production") as "development" | "staging" | "production";
const BASE_ID = "com.konkanicompanion.app";
const ID = VARIANT === "production" ? BASE_ID : `${BASE_ID}.${VARIANT === "development" ? "dev" : "staging"}`;
const NAME = VARIANT === "production" ? "Konkani Companion" : `Konkani Companion (${VARIANT === "development" ? "Dev" : "Staging"})`;

// Firebase native config files (download from Firebase console; not committed).
const androidServices = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";
const iosServices = process.env.GOOGLE_SERVICES_PLIST ?? "./GoogleService-Info.plist";
const hasAndroidServices = fs.existsSync(path.resolve(__dirname, androidServices));
const hasIosServices = fs.existsSync(path.resolve(__dirname, iosServices));

// Google Sign-In: with GoogleService-Info.plist the plugin reads everything from it;
// otherwise iOS needs the reversed client id as a URL scheme.
const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
const googleSignInPlugin: [string, Record<string, string>] | string = hasIosServices
  ? "@react-native-google-signin/google-signin"
  : ["@react-native-google-signin/google-signin", { iosUrlScheme: iosUrlScheme || "com.googleusercontent.apps.REPLACE_ME" }];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME,
  slug: "konkani-sangati",
  owner: "boybotherees-team",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "konkanicompanion",
  userInterfaceStyle: "dark",
  backgroundColor: "#111214",
  ios: {
    bundleIdentifier: ID,
    supportsTablet: true,
    ...(hasIosServices ? { googleServicesFile: iosServices } : {}),
    infoPlist: {
      NSMicrophoneUsageDescription: "Konkani Companion uses the microphone so you can ask questions by voice.",
      NSCameraUsageDescription: "Konkani Companion uses the camera to photograph documents for Document Lens.",
      NSPhotoLibraryUsageDescription: "Konkani Companion lets you choose a photo of a document for Document Lens.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: ID,
    adaptiveIcon: {
      backgroundColor: "#111214",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    ...(hasAndroidServices ? { googleServicesFile: androidServices } : {}),
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.CAMERA"],
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
  },
  plugins: [
    "expo-router",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#111214", image: "./assets/splash-icon.png", imageWidth: 160 }],
    ["expo-audio", { microphonePermission: "Konkani Companion uses the microphone so you can ask questions by voice." }],
    ["expo-image-picker", {
      cameraPermission: "Konkani Companion uses the camera to photograph documents for Document Lens.",
      photosPermission: "Konkani Companion lets you choose a photo of a document for Document Lens.",
    }],
    "expo-sharing",
    googleSignInPlugin,
    ["expo-build-properties", { android: { minSdkVersion: 24 } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: "c4f29de6-4941-4a89-979d-e50ea89e075c" },
    appVariant: VARIANT,
    googleServicesConfigured: { android: hasAndroidServices, ios: hasIosServices },
  },
});
