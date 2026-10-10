import { SSE_HEADERS, backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { question?: unknown; document_context?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.question !== "string" || typeof body.document_context !== "string") {
    return Response.json({ error: "question and document_context are required." }, { status: 400 });
  }

  try {
    const res = await fetch(backendUrl("/document-chat"), {
      method: "POST",
      headers: backendHeaders(req, { "Content-Type": "application/json" }),
      body: JSON.stringify({ question: body.question, document_context: body.document_context }),
      signal: req.signal,
    });
    if (!res.ok || !res.body) return backendError(res);
    return new Response(res.body, { headers: SSE_HEADERS });
  } catch (error) {
    return backendUnavailable(error);
  }
}
