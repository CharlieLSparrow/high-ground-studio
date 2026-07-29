import { adminAuth } from "@/lib/firebase/firebase-admin";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";

export async function verifyBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken.email || decodedToken.email_verified !== true) {
      throw new Error("Firebase token requires a verified email");
    }

    return ensureStudioUserFromFirebaseIdentity({
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      provider: decodedToken.firebase?.sign_in_provider || null,
      name: decodedToken.name || null,
      image: decodedToken.picture || null,
    });
  } catch (error) {
    console.error("[verifyBearerToken] error:", error);
    throw new Error("Invalid token");
  }
}
