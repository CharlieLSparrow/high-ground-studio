import { adminAuth } from "@/lib/firebase/firebase-admin";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";

export class FirebaseBearerAuthenticationError extends Error {
  readonly code = "QUIPSLY_FIREBASE_BEARER_INVALID";

  constructor() {
    super("Invalid Firebase bearer token");
    this.name = "FirebaseBearerAuthenticationError";
  }
}

export function isFirebaseBearerAuthenticationError(
  error: unknown,
): error is FirebaseBearerAuthenticationError {
  return (
    error instanceof FirebaseBearerAuthenticationError
    || (
      Boolean(error)
      && typeof error === "object"
      && (error as { code?: unknown }).code === "QUIPSLY_FIREBASE_BEARER_INVALID"
    )
  );
}

export async function verifyBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new FirebaseBearerAuthenticationError();
  }

  const token = authHeader.split("Bearer ")[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.warn("[verifyBearerToken] Firebase rejected a bearer token", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw new FirebaseBearerAuthenticationError();
  }
  if (!decodedToken.email || decodedToken.email_verified !== true) {
    throw new FirebaseBearerAuthenticationError();
  }

  // Identity resolution is application/database work, not token
  // authentication. Let availability failures retain their real type so API
  // routes can return a retryable service response instead of blaming the
  // person's credentials.
  return ensureStudioUserFromFirebaseIdentity({
    firebaseUid: decodedToken.uid,
    email: decodedToken.email,
    emailVerified: decodedToken.email_verified,
    provider: decodedToken.firebase?.sign_in_provider || null,
    name: decodedToken.name || null,
    image: decodedToken.picture || null,
  });
}
