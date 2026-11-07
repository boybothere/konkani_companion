import { backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";
import { checkQuota } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

const DIRECTIONS = new Set(["auto", "kok2en", "en2kok"]);
const MAX_CHARS = 6000; // matches the backend's MAX_DOCUMENT_CHARS default

/** Plain English <-> Konkani translation with the Konkani model (no AI answer). */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: { text?: unknown; direction?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const direction = typeof body.direction === "string" && DIRECTIONS.has(body.direction) ? body.direction : "auto";
  if (!text) return Response.json({ error: "There is no text to translate." }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return Response.json({ error: `Text is longer than ${MAX_CHARS} characters.` }, { status: 413 });
  }
  const limited = await checkQuota(user.uid, "translate");
  if (limited) return limited;

  try {
    const res = await fetch(backendUrl("/translate"), {
      method: "POST",
      headers: backendHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({ text, direction }),
      signal: req.signal,
    });
    if (!res.ok) return backendError(res);
    const data = await res.json();
    return Response.json({
      translation: typeof data.translation === "string" ? data.translation : "",
      direction: data.direction === "kok2en" ? "kok2en" : "en2kok",
    });
  } catch (error) {
    return backendUnavailable(error);
  }
}
