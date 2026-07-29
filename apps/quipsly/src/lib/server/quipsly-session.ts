import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { hasQuipslyBetaAccess } from "@/lib/server/patreon-authz";
import {
  ensureStudioUserFromFirebaseIdentity,
  type StudioUserIdentity,
} from "@/lib/server/studio-user-identity";

export const QUIPSLY_SESSION_COOKIE_NAME = "session";

export type QuipslySession = {
  user: {
    id: string;
    firebaseUid: string;
    email: string;
    primaryEmail: string;
    name: string | null;
    image: string | null;
    emailVerified: Date | null;
    roles: StudioUserIdentity["roles"];
    isStaff: boolean;
    hasBetaAccess: boolean;
  };
};

type FirebaseIdentityInput = {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
  };
};

async function sessionFromFirebaseIdentity(
  decoded: FirebaseIdentityInput,
): Promise<QuipslySession | null> {
  // Never resolve or merge a Quipsly user by an unproved mailbox. In
  // particular, an attacker must not be able to register an invited email and
  // inherit its pre-created Nest grants before Firebase verifies ownership.
  if (!decoded.email || decoded.email_verified !== true) return null;

  const identity = await ensureStudioUserFromFirebaseIdentity({
    firebaseUid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified,
    provider: decoded.firebase?.sign_in_provider || null,
    name: decoded.name ?? null,
    image: decoded.picture ?? null,
  });

  return {
    user: {
      id: identity.id,
      firebaseUid: decoded.uid,
      email: identity.primaryEmail,
      primaryEmail: identity.primaryEmail,
      name: identity.name,
      image: identity.image,
      emailVerified: decoded.email_verified ? new Date() : null,
      roles: identity.roles,
      isStaff: identity.isStaff,
      hasBetaAccess: await hasQuipslyBetaAccess(identity.primaryEmail),
    },
  };
}

export async function getQuipslySession(): Promise<QuipslySession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(QUIPSLY_SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    return sessionFromFirebaseIdentity({
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: decoded.name,
      picture: decoded.picture,
      firebase: decoded.firebase,
    });
  } catch (error) {
    console.warn("Quipsly Firebase session cookie was rejected.", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function getQuipslySessionFromBearer(
  request: Request,
): Promise<QuipslySession | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    // Deletion and operator safety holds revoke credentials immediately. The
    // extra lookup is intentional: signature validity alone can outlive a
    // disabled or deleted Firebase account.
    const decoded = await adminAuth.verifyIdToken(token, true);
    return sessionFromFirebaseIdentity({
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: decoded.name,
      picture: decoded.picture,
      firebase: decoded.firebase,
    });
  } catch (error) {
    console.warn("Quipsly Firebase bearer token was rejected.", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function getQuipslySessionFromRequest(
  request: Request,
): Promise<QuipslySession | null> {
  // A caller that explicitly presents a bearer credential is bound to that
  // credential's outcome. Never let an invalid/unverified mobile token fall
  // through to an unrelated browser cookie identity on the same request.
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return getQuipslySessionFromBearer(request);
  }
  return getQuipslySession();
}
