// Calls the website's API routes (/api/chat, /api/transcribe, ...) with the
// signed-in user's Firebase ID token, exactly like the web app does.
import { fetch } from "expo/fetch";
import { auth } from "./firebase";
import { config } from "./config";

export type ApiResponse = Awaited<ReturnType<typeof fetch>>;
type ApiInit = NonNullable<Parameters<typeof fetch>[1]>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const OFFLINE_MESSAGE = "Couldn't reach the server. Check your internet connection and try again.";

export const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

export async function apiFetch(path: string, init: ApiInit = {}): Promise<ApiResponse> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  if (!config.apiBaseUrl) throw new ApiError(0, "The API address isn't configured (EXPO_PUBLIC_API_BASE_URL).");

  const send = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers as HeadersInit | undefined);
    headers.set("Authorization", `Bearer ${await user.getIdToken(forceRefresh)}`);
    return fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  };

  try {
    const res = await send(false);
    // ID tokens last an hour: if the server rejects one, refresh it once and retry.
    if (res.status === 401 && !(init.body instanceof ReadableStream)) return await send(true);
    return res;
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
}

/** The `error` message from a failed JSON response, with friendly defaults. */
export async function errorFrom(res: ApiResponse, fallback = "Something went wrong. Please try again."): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (typeof body.error === "string") return body.error;
  if (res.status === 401) return "Your session has expired. Please sign in again.";
  if (res.status === 403) return "This account doesn't have access to Konkani Companion.";
  if (res.status === 429) return "Too many requests. Please wait a minute.";
  return fallback;
}
