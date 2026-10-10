import { SSE_HEADERS, backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { messages?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "A non-empty messages array is required." }, { status: 400 });
  }

  try {
    const res = await fetch(backendUrl("/openai/v1/chat/completions"), {
      method: "POST",
      headers: backendHeaders(req, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        messages: body.messages,
        language: body.language === "kok" ? "kok" : "en",
        stream: true,
      }),
      signal: req.signal, // stop backend work when the browser disconnects
    });
    if (!res.ok || !res.body) return backendError(res);
    return new Response(res.body, { headers: SSE_HEADERS });
  } catch (error) {
    return backendUnavailable(error);
  }
}
