import { backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";

export async function POST(req: Request) {
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No audio file provided." }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", file, "audio.webm");

  try {
    const res = await fetch(backendUrl("/transcribe"), {
      method: "POST",
      headers: backendHeaders(req),
      body: form,
    });
    if (!res.ok) return backendError(res);
    const data = await res.json();
    return Response.json({ text: typeof data.text === "string" ? data.text : "" });
  } catch (error) {
    return backendUnavailable(error);
  }
}
