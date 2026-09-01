import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/firebase-admin";
import { cookies } from "next/headers";
import { consumeInviteLoginTokenForEmail } from "@/lib/server/invite-login-token";
import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";
import {
  getQuipslySession,
  QUIPSLY_SESSION_COOKIE_NAME,
} from "@/lib/server/quipsly-session";
import { quipslySessionCookieOptions } from "@/lib/server/quipsly-session-cookie";
import {
  isDatabaseSchemaUnavailableError,
  isDatabaseUnavailableError,
} from "@/lib/server/service-availability";
import {
  recordQuipslyProductOutcomeForUser,
  recordQuipslyProductOutcomeOnce,
} from "@/lib/server/product-event";

const LEGACY_AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
];

function clearLegacyAuthCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  for (const name of LEGACY_AUTH_COOKIE_NAMES) {
    cookieStore.delete(name);
  }
}

function isFirebaseAdminCredentialUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "app/invalid-credential") return true;
  if (record.error_subtype === "invalid_rapt") return true;
  if (
    record.error_description &&
    String(record.error_description).includes("invalid_rapt")
  )
    return true;
  if (record.message && String(record.message).includes("invalid_rapt"))
    return true;

  const cause = record.cause;
  return Boolean(cause && isFirebaseAdminCredentialUnavailable(cause));
}

export async function GET() {
  let session;
  try {
    session = await getQuipslySession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      console.error(
        "Session read failed because the Quipsly database is unavailable",
        error,
      );
      return NextResponse.json(
        {
          error: "Quipsly database unavailable",
          authenticated: false,
          user: null,
        },
        { status: 503 },
      );
    }

    console.error("Session read failed", error);
    return NextResponse.json(
      { error: "Session read failed", authenticated: false, user: null },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.primaryEmail,
      name: session.user.name,
      roles: session.user.roles,
      isStaff: session.user.isStaff,
    },
  });
}

export async function POST(req: Request) {
  let input: { idToken?: unknown; inviteToken?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "Quipsly could not read the secure sign-in request. Try again.",
        code: "INVALID_SESSION_REQUEST",
      },
      { status: 400 },
    );
  }

  try {
    const { idToken, inviteToken } = input;

    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      return NextResponse.json(
        { error: "Firebase identity has no email" },
        { status: 400 },
      );
    }
    if (decodedToken.email_verified !== true) {
      // This check must happen before identity resolution, onboarding, invite
      // consumption, or cookie creation. An unverified account cannot claim a
      // pre-invited email address.
      return NextResponse.json(
        {
          error:
            "Verify this email with Firebase before signing in to Quipsly.",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 },
      );
    }

    const identity = await ensureStudioUserFromFirebaseIdentity({
      firebaseUid: decodedToken.uid,
      email,
      emailVerified: decodedToken.email_verified,
      provider: decodedToken.firebase?.sign_in_provider || null,
      name: decodedToken.name || null,
      image: decodedToken.picture || null,
    });
    const onboarding = await ensureQuipslyStarterStateForUser({
      userId: identity.id,
      email: identity.primaryEmail,
    });
    const acceptedInvite =
      typeof inviteToken === "string" && inviteToken.trim()
        ? await consumeInviteLoginTokenForEmail({
            token: inviteToken,
            verifiedEmail: identity.primaryEmail,
          })
        : null;

    // Set session expiration to 5 days
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    const cookieStore = await cookies();
    // Remove a pre-migration host-only cookie before writing the intentional
    // first-party Quipsly domain cookie. This prevents two same-name cookies
    // from making session selection browser-order dependent.
    cookieStore.delete(QUIPSLY_SESSION_COOKIE_NAME);
    clearLegacyAuthCookies(cookieStore);
    cookieStore.set(
      QUIPSLY_SESSION_COOKIE_NAME,
      sessionCookie,
      quipslySessionCookieOptions(req, expiresIn / 1000),
    );

    const provider = decodedToken.firebase?.sign_in_provider || "";
    const method =
      provider === "google.com"
        ? "google"
        : provider === "password"
          ? "email"
          : provider === "apple.com"
            ? "apple"
            : "unknown";
    await recordQuipslyProductOutcomeOnce({
      userId: identity.id,
      eventName: "sign_up",
      parameters: { surface: "sign_in", method, result: "success" },
    });
    await recordQuipslyProductOutcomeForUser({
      userId: identity.id,
      eventName: "login_completed",
      parameters: { surface: "sign_in", method, result: "success" },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: identity.id,
        email: identity.primaryEmail,
        roles: identity.roles,
        isStaff: identity.isStaff,
      },
      homeNest: onboarding.homeNest,
      onboarding: {
        freePlanSlug: onboarding.freePlanSlug,
        freeMembershipStatus: onboarding.freeMembershipStatus,
        freeMembershipCreated: onboarding.freeMembershipCreated,
        homeNestSlug: onboarding.homeNest.slug,
      },
      acceptedInvite: acceptedInvite
        ? {
            projectSlug: acceptedInvite.projectSlug,
            role: acceptedInvite.role,
          }
        : null,
    });
  } catch (error) {
    console.error("Session creation failed", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          error: "Quipsly is reconnecting. Try signing in again in a moment.",
          code: "SESSION_STORAGE_UNAVAILABLE",
        },
        { status: 503, headers: { "retry-after": "2" } },
      );
    }
    if (isDatabaseSchemaUnavailableError(error)) {
      return NextResponse.json(
        {
          error:
            "Quipsly is temporarily unavailable. Try signing in again shortly.",
          code: "SESSION_SCHEMA_UNAVAILABLE",
        },
        { status: 503, headers: { "retry-after": "10" } },
      );
    }
    if (isFirebaseAdminCredentialUnavailable(error)) {
      return NextResponse.json(
        {
          error:
            "Secure sign-in is temporarily unavailable. Try again shortly.",
          code: "SESSION_IDENTITY_SERVICE_UNAVAILABLE",
        },
        { status: 503, headers: { "retry-after": "10" } },
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  // Normal sign-out is device-local. Revoking Firebase refresh tokens here
  // would unexpectedly sign the same person out of Capture and every other
  // browser. Security-wide revocation belongs in an explicit "sign out all
  // devices" or account-safety operation.
  cookieStore.delete(QUIPSLY_SESSION_COOKIE_NAME);
  cookieStore.set(
    QUIPSLY_SESSION_COOKIE_NAME,
    "",
    quipslySessionCookieOptions(req, 0),
  );
  clearLegacyAuthCookies(cookieStore);

  return NextResponse.json({ success: true });
}
