# Konkani Companion — mobile app (Android & iOS)

A native React Native app (Expo SDK 57, TypeScript, Expo Router) that mirrors the
web app. It is **not** a WebView: every screen is built from native components.

It reuses the existing system unchanged:

```
Mobile app ──HTTPS + Firebase ID token──▶ Next.js /api routes (Vercel) ──▶ Python backend (Lightning)
     └──────────── Firebase Auth (Google) + Firestore users/{uid}/chats ─────────────┘
```

Same Firebase project, same users, same Firestore chats: a chat started on the
website appears on the phone and vice versa.

## Feature map (web → mobile)

| Web feature | Mobile | Notes |
|---|---|---|
| Google sign-in gate | ✅ Native Google Sign-In → Firebase | Session survives restarts; refresh token stored in the OS keystore (expo-secure-store) |
| Sign out | ✅ History panel → account → Sign out | Clears the local chat cache; chats stay in Firestore |
| Protected app | ✅ `(app)` routes redirect to sign-in | Every API call carries the Firebase ID token; 401 → token refresh + one retry |
| Email allow-list (403) | ✅ Server-enforced, message shown | |
| Chat with streamed answers + stage statuses | ✅ `expo/fetch` streaming + the same SSE reader | "Sending… / Searching… / Generating… / Translating…" with elapsed time |
| Sources & Search Results (collapsed, snippets, `[n]` citations) | ✅ | Citations open the panel and highlight the source; tapping a source opens the browser |
| Stop generating | ✅ | Partial answer kept and marked incomplete |
| Error / cut-off / offline messages | ✅ | |
| English ⇄ Konkani input toggle | ✅ | |
| Konkani on-screen keyboard | ✅ | Same layout, inserts at the cursor |
| Voice input (record → transcribe) | ✅ expo-audio (m4a) | Auto-stops before the 120 s backend limit; switches the toggle to Konkani |
| Chat history: new, switch, delete | ✅ Slide-in history panel | Delete asks for confirmation |
| Rename chat | ✅ Tap the title, or panel ✏️, or ⋯ → Rename | Synced to Firestore `title` |
| Full-text chat search | ✅ | Names and every message, English and Konkani |
| Copy conversation | ✅ | |
| Download .md | ✅ "Export as Markdown file" → share sheet | Save to Files/Drive, send, etc. |
| Print / Save as PDF | ✅ PDF generated on the device → share sheet | |
| Share | ✅ System share sheet | |
| Document Lens: upload PDF/PNG/JPEG/WEBP/TIFF ≤ 15 MB | ✅ File picker **plus camera and photo library** | Validated before upload |
| Staged analysis + Cancel | ✅ Same `?stream=1` endpoint, JSON fallback | |
| Konkani + English summaries | ✅ Stacked panels with Copy | |
| Full translation / extracted text | ✅ Expandable sections | |
| Document Q&A, bilingual for summary questions | ✅ | Stop supported |
| Dark theme, Inter + Noto Sans Devanagari | ✅ Same colour tokens and fonts | |
| Website-only: drag-and-drop upload, keyboard shortcuts | ➖ Replaced by native pickers / camera | |

## Project layout

```
mobile/
  app.config.ts          app id, permissions, plugins; reads env vars
  .env.example           every setting, documented (copy to .env.local)
  src/app/               routes (Expo Router)
    _layout.tsx          fonts, splash, auth provider
    index.tsx            redirect: signed in → /chat, otherwise /sign-in
    sign-in.tsx
    (app)/_layout.tsx    protected tabs: Chat · Document Lens
    (app)/chat.tsx
    (app)/documents.tsx
  src/components/        UI (message list, input, Konkani keyboard, panels, sheets)
  src/lib/               config, Firebase, auth, API client, SSE reader, chat store, export
```

`android/` and `ios/` are generated during EAS builds and are not committed.

## How it is built

Builds run in the cloud on **EAS Build**, not on your PC: no Android SDK, Gradle
or disk space needed locally. Day-to-day development uses a **development
client** (your own "Expo Go" with this app's native modules, such as Google
Sign-In) with live reload from `npx expo start`.

`eas.json` profiles:

| Profile | Output | Use |
|---|---|---|
| `development` | APK with the dev client | Install once on your phone; live reload from `npx expo start` |
| `preview` | Standalone APK | Share or install; runs without a dev server |
| `production` | AAB (Play Store), IPA (App Store) | Store releases; version code auto-increments |

## One-time setup

### 1. Install and configure

```bash
cd mobile
npm install
cp .env.example .env.local     # then fill it in (Windows: copy .env.example .env.local)
```

| Variable | Value |
|---|---|
| `APP_VARIANT` | `production` (app ID `com.konkanicompanion.app`) |
| `EXPO_PUBLIC_API_BASE_URL` | `https://konkani-companion.vercel.app` |
| `EXPO_PUBLIC_FIREBASE_*` | Same values as the website's `NEXT_PUBLIC_FIREBASE_*` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Firebase console → Authentication → Sign-in method → Google → **Web SDK configuration → Web client ID** |

Everything here is public configuration. **Never** put `BACKEND_API_KEY`,
Groq/Tavily keys or other secrets in the mobile app.

### 2. Expo account and project

```bash
npx eas-cli@latest login            # free account at expo.dev
npx eas-cli@latest init             # links this folder to an EAS project
```

### 3. Give the cloud builds your settings

`.env.local` is git-ignored, so EAS doesn't receive it. Push the same values to
EAS environment variables once per environment:

```bash
npx eas-cli@latest env:push --environment development --path .env.local
npx eas-cli@latest env:push --environment preview --path .env.local
npx eas-cli@latest env:push --environment production --path .env.local
```

Re-run after changing a value. (`npx expo start` reads `.env.local` directly.)

### 4. Firebase: register the Android app (required for Google sign-in)

Native Google sign-in only works for an app ID + signing key that Firebase knows.

1. Run the first build (below). EAS creates and stores the Android signing key.
2. Get its fingerprint: `npx eas-cli@latest credentials -p android` → the
   build profile → copy the **SHA-1**.
3. Firebase console → ⚙ Project settings → **Your apps → Add app → Android**,
   package name `com.konkanicompanion.app`, paste the SHA-1.
4. Make sure the Google provider is enabled (Authentication → Sign-in method).
5. Play Store releases: also add the Play **App signing key** SHA-1 (Play Console
   → Setup → App integrity).

If the SHA-1 isn't registered, the sign-in screen says so ("Google sign-in isn't
set up for this app build yet").

### 5. Firebase: register the iOS app (for iPhone builds)

Add an **iOS** app with bundle ID `com.konkanicompanion.app`, and set
`GOOGLE_IOS_URL_SCHEME` to the `REVERSED_CLIENT_ID` from its
`GoogleService-Info.plist` (in `.env.local`, then `env:push`).

## Develop on your phone (live reload)

```bash
npx eas-cli@latest build --profile development --platform android
```

When it finishes, open the build link or scan its QR code on the phone and
install the APK (allow "Install unknown apps"). Then, with the phone and PC on
the same Wi-Fi:

```bash
npx expo start                      # add --tunnel if the phone can't reach the PC
```

Open **Konkani Companion** on the phone and pick the server (or scan the QR
code). Saving a file reloads the app instantly. Rebuild the development APK only
after adding a native package or changing `app.config.ts`.

The app talks to the live site, so the Python backend (Lightning) must be
running for answers, voice and documents.

## Standalone APK

```bash
npx eas-cli@latest build --profile preview --platform android
```

Download it from the build page (or scan the QR code on the phone) and install.

## iOS

```bash
npx eas-cli@latest build --profile development --platform ios   # or preview / production
```

Works from Windows. Installing on a real iPhone requires an **Apple Developer
Program** membership ($99/year) and registering the device
(`npx eas-cli@latest device:create`).

## Free-tier notes

EAS's free plan has a monthly build quota and a shared queue, so a build may
wait in line before starting. Each build is listed at expo.dev with its logs.


## Store releases (summary)

**Google Play**
1. Build an **AAB**: `npx eas-cli@latest build --platform android --profile production`
   (EAS manages the upload key; keep using the same EAS project).
2. In Play Console: create the app, complete the store listing, content rating,
   **Data safety** (Google account info, chat content, microphone, camera),
   and a privacy policy URL.
3. Add the Play app-signing SHA-1 to Firebase (see setup step 4).
4. Upload to internal testing first, then production.

**App Store**
1. Apple Developer Program membership; create the app in App Store Connect with
   bundle ID `com.konkanicompanion.app`.
2. `eas build --platform ios --profile production`, then `eas submit --platform ios`.
3. Fill in the privacy "nutrition label", microphone/camera usage purposes
   (already set in `app.config.ts`), screenshots, and submit for review.
   Apps offering third-party sign-in may also be asked to offer **Sign in with
   Apple** (App Store guideline 4.8) — plan for this before submitting.

Before either store: replace the placeholder icon and splash in `assets/`, and
bump `version` in `app.config.ts` for each release.

## Checks

```bash
npx tsc --noEmit     # typecheck
npx expo lint        # lint
npx expo-doctor      # dependency/config check
```
