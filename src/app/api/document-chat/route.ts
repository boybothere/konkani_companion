import { SSE_HEADERS, backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";
import { checkQuota, fingerprint } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: { question?: unknown; document_context?: unknown; output_language?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.question !== "string" || typeof body.document_context !== "string") {
    return Response.json({ error: "question and document_context are required." }, { status: 400 });
  }
  if (body.question.length > 4_000 || body.document_context.length > 100_000) {
    return Response.json({ error: "The question or document is too long." }, { status: 413 });
  }
  // Document questions share the daily question allowance with chat.
  const limited = await checkQuota(user.uid, "chat", fingerprint(body.question, body.document_context.slice(0, 500)));
  if (limited) return limited;

  try {
    const res = await fetch(backendUrl("/document-chat"), {
      method: "POST",
      headers: backendHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        question: body.question,
        document_context: body.document_context,
        output_language: body.output_language === "en" ? "en" : "kok",
      }),
      signal: req.signal,
    });
    if (!res.ok || !res.body) return backendError(res);
    return new Response(res.body, { headers: SSE_HEADERS });
  } catch (error) {
    return backendUnavailable(error);
  }
}
