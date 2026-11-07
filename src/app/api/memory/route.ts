import { backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";
import { checkQuota } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Propose an updated memory after an exchange. The browser saves it to the user's own Firestore doc. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: { facts?: unknown; question?: unknown; answer?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const facts = Array.isArray(body.facts) ? body.facts.filter((f): f is string => isText(f, 300)).slice(0, 24) : [];
  if (!isText(body.question, 4_000) || !body.question.trim() || !isText(body.answer ?? "", 8_000)) {
    return Response.json({ error: "question (and optional answer) are required." }, { status: 400 });
  }

  const limited = await checkQuota(user.uid, "memory");
  if (limited) return limited;

  try {
    const res = await fetch(backendUrl("/memory/extract"), {
      method: "POST",
      headers: backendHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({ facts, question: body.question, answer: body.answer ?? "" }),
      signal: req.signal,
    });
    if (!res.ok) return backendError(res);
    const data = await res.json();
    return Response.json({ facts: Array.isArray(data.facts) ? data.facts : facts });
  } catch (error) {
    return backendUnavailable(error);
  }
}
