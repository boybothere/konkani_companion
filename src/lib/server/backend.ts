// Server-only helpers for talking to the Python backend.
// Only import this from Route Handlers: it reads BACKEND_API_KEY.

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

class BackendNotConfigured extends Error {}

export function backendUrl(path: string): string {
  // NEXT_PUBLIC_COLAB_URL is only a fallback for older .env.local files.
  const base = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_COLAB_URL || "").replace(/\/+$/, "");
  if (!base) throw new BackendNotConfigured("BACKEND_URL is not set");
  return `${base}${path}`;
}

/** Headers for a backend call made on behalf of a signed-in user. */
export function backendHeaders(user: { uid: string }, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const apiKey = process.env.BACKEND_API_KEY;
  if (apiKey) headers.set("X-API-Key", apiKey);
  // The backend rate-limits per client id, so limits now apply per user.
  headers.set("X-Client-Id", `user:${user.uid}`);
  headers.set("ngrok-skip-browser-warning", "true");
  return headers;
}

const OFFLINE = "The backend server is offline. Start it (on Lightning or Colab) and try again.";

export async function backendError(res: Response): Promise<Response> {
  const text = await res.text().catch(() => "");

  // Tunnels answer with their own HTML page when nothing is running behind them
  // (ngrok: ERR_NGROK_3200 "endpoint is offline", 8012 "upstream refused").
  if (/ERR_NGROK_(3200|8012|3004)/.test(text) || (res.status === 404 && /^\s*</.test(text))) {
    return Response.json({ error: OFFLINE }, { status: 503 });
  }

  let message = `The backend returned an error (HTTP ${res.status}).`;
  try {
    const body = JSON.parse(text);
    const detail = body?.detail ?? body?.error;
    if (typeof detail === "string") message = detail;
    else if (res.status === 422) message = "The request was not valid.";
  } catch {
    console.error("Unexpected backend response:", res.status, text.slice(0, 200));
  }
  return Response.json({ error: message }, { status: res.status });
}

export function backendUnavailable(error: unknown): Response {
  if ((error as Error)?.name === "AbortError") {
    return new Response(null, { status: 499 });
  }
  console.error("Backend request failed:", error);
  const message =
    error instanceof BackendNotConfigured
      ? "The backend URL is not configured. Set BACKEND_URL (in .env.local locally, or in your hosting provider's environment variables)."
      : "The backend is unreachable. Make sure the backend server is running.";
  return Response.json({ error: message }, { status: 503 });
}
