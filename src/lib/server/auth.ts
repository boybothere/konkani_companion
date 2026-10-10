// Server-only: verifies Firebase ID tokens sent by the browser.
// Only import this from Route Handlers.
//
// Uses Google's public signing keys, so no service-account secret is needed.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Cached between requests; jose refreshes the keys when Google rotates them.
const firebaseKeys = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

export type AuthUser = { uid: string; email: string | null; name: string | null };

export async function verifyFirebaseToken(
  token: string,
  options: { projectId: string; keys?: JWTVerifyGetKey },
): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, options.keys ?? firebaseKeys, {
    issuer: `https://securetoken.google.com/${options.projectId}`,
    audience: options.projectId,
    algorithms: ["RS256"],
  });
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new Error("token has no valid subject");
  }
  if (typeof payload.auth_time !== "number" || payload.auth_time > now + 60) {
    throw new Error("token has an invalid auth_time");
  }
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

/** AUTH_ALLOWED_EMAILS: comma-separated emails and/or "@domain.com" entries. Empty = any Google account. */
export function isAllowed(email: string | null, allowList = process.env.AUTH_ALLOWED_EMAILS ?? ""): boolean {
  const entries = allowList.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (entries.length === 0) return true;
  if (!email) return false;
  return entries.some((entry) => (entry.startsWith("@") ? email.endsWith(entry) : email === entry));
}

/**
 * Returns the signed-in user, or a 401/403 Response to send back as-is.
 *
 *   const auth = await requireUser(req);
 *   if (auth instanceof Response) return auth;
 */
export async function requireUser(req: Request): Promise<AuthUser | Response> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("Auth is not configured: set NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
    return Response.json({ error: "Sign-in is not configured on the server." }, { status: 500 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return Response.json({ error: "Please sign in to continue." }, { status: 401 });

  let user: AuthUser;
  try {
    user = await verifyFirebaseToken(token, { projectId });
  } catch {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  if (!isAllowed(user.email)) {
    return Response.json({ error: "This account doesn't have access to Konkani Companion." }, { status: 403 });
  }
  return user;
}
