import { SSE_HEADERS, backendError, backendHeaders, backendUnavailable, backendUrl } from "@/lib/server/backend";
import { requireUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// POST /api/analyze-document           -> JSON result (works with every backend version)
// POST /api/analyze-document?stream=1  -> SSE with stage events and a final `result` event.
//   Returns 404 if the backend doesn't have the streaming endpoint yet; the
//   client then falls back to the JSON version.
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const stream = new URL(req.url).searchParams.get("stream") === "1";

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
    const res = await fetch(backendUrl(stream ? "/analyze-document/stream" : "/analyze-document"), {
      method: "POST",
      headers: backendHeaders(user),
      body: form,
      signal: req.signal,
    });
    if (!res.ok) return backendError(res);
    if (stream) {
      if (!res.body) return Response.json({ error: "Empty response from the backend." }, { status: 502 });
      return new Response(res.body, { headers: SSE_HEADERS });
    }
    return Response.json(await res.json());
  } catch (error) {
    return backendUnavailable(error);
  }
}
