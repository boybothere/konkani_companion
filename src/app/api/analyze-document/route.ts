import { backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";

export async function POST(req: Request) {
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No document provided." }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "document");

  try {
    const res = await fetch(backendUrl("/analyze-document"), {
      method: "POST",
      headers: backendHeaders(req),
      body: form,
      signal: req.signal,
    });
    if (!res.ok) return backendError(res);
    return Response.json(await res.json());
  } catch (error) {
    return backendUnavailable(error);
  }
}
