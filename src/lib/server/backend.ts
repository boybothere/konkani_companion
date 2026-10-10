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

export function backendHeaders(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const apiKey = process.env.BACKEND_API_KEY;
  if (apiKey) headers.set("X-API-Key", apiKey);
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  if (clientIp) headers.set("X-Client-Id", clientIp);
  headers.set("ngrok-skip-browser-warning", "true");
  return headers;
}

export async function backendError(res: Response): Promise<Response> {
  let message = "The backend returned an error.";
  try {
    const body = await res.json();
    const detail = body?.detail ?? body?.error;
    if (typeof detail === "string") message = detail;
    else if (res.status === 422) message = "The request was not valid.";
  } catch {
    // keep the generic message
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
      ? "The backend URL is not configured. Set BACKEND_URL in .env.local."
      : "The backend is unreachable. Is the Colab server running?";
  return Response.json({ error: message }, { status: 503 });
}
