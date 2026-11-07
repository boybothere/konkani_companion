import { SSE_HEADERS, backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";
import { checkQuota, fingerprint } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 100;
const MAX_PAYLOAD_CHARS = 120_000;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: { messages?: unknown; language?: unknown; output_language?: unknown; memory?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "A non-empty messages array is required." }, { status: 400 });
  }
  // Bound the payload before it reaches the backend: long histories cost tokens.
  if (body.messages.length > MAX_MESSAGES || JSON.stringify(body.messages).length > MAX_PAYLOAD_CHARS) {
    return Response.json({ error: "This conversation is too long. Start a new chat to continue." }, { status: 413 });
  }
  const last = body.messages[body.messages.length - 1] as { content?: unknown };
  const question = typeof last?.content === "string" ? last.content : "";
  const outputLanguage = body.output_language === "en" ? "en" : "kok";

  const limited = await checkQuota(user.uid, "chat", fingerprint(question, outputLanguage));
  if (limited) return limited;

  try {
    const res = await fetch(backendUrl("/openai/v1/chat/completions"), {
      method: "POST",
      headers: backendHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        messages: body.messages,
        language: body.language === "kok" ? "kok" : "en",
        output_language: outputLanguage,
        // Facts the user saved about themselves (bounded; the backend filters them again).
        memory: Array.isArray(body.memory)
          ? body.memory.filter((m): m is string => typeof m === "string" && m.length <= 300).slice(0, 12)
          : [],
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
