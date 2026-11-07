import { backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";
import { checkQuota } from "@/lib/server/quota";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // matches the backend default

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let file: FormDataEntryValue | null;
  let language: FormDataEntryValue | null;
  try {
    const incoming = await req.formData();
    file = incoming.get("file");
    language = incoming.get("language");
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No audio file provided." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "The recording is too large." }, { status: 413 });
  }
  const limited = await checkQuota(user.uid, "voice");
  if (limited) return limited;

  const form = new FormData();
  form.append("file", file, "audio.webm");
  // The language the user is speaking: Konkani (default), English, or auto-detect.
  form.append("language", language === "en" || language === "auto" ? language : "kok");

  try {
    const res = await fetch(backendUrl("/transcribe"), {
      method: "POST",
      headers: backendHeaders(user),
      body: form,
    });
    if (!res.ok) return backendError(res);
    const data = await res.json();
    return Response.json({ text: typeof data.text === "string" ? data.text : "" });
  } catch (error) {
    return backendUnavailable(error);
  }
}
