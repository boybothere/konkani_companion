// fetch() for the app's own API routes, with the signed-in user's Firebase ID token.
import { auth } from "@/lib/firebase";

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in to continue.");

  const send = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await user.getIdToken(forceRefresh)}`);
    return fetch(input, { ...init, headers });
  };

  const res = await send(false);
  // Tokens last an hour; if the server rejects one, refresh it once and retry.
  // A FormData or JSON-string body can be sent again; a stream body cannot.
  if (res.status === 401 && !(init.body instanceof ReadableStream)) return send(true);
  return res;
}
