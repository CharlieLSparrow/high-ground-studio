import { NextResponse } from "next/server";

import { adminAuth, firebaseAdminRuntimeInfo } from "@/lib/firebase/firebase-admin";

function isFirebaseAdminCredentialUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "app/invalid-credential") return true;
  if (record.error_subtype === "invalid_rapt") return true;
  if (record.error_description && String(record.error_description).includes("invalid_rapt")) return true;
  if (record.message && String(record.message).includes("invalid_rapt")) return true;

  const cause = record.cause;
  return Boolean(cause && isFirebaseAdminCredentialUnavailable(cause));
}

function isExpectedMissingUser(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "auth/user-not-found") return true;

  const cause = record.cause;
  return Boolean(cause && isExpectedMissingUser(cause));
}

export async function GET() {
  try {
    await adminAuth.getUser("quipsly-firebase-admin-preflight-nonexistent-user");
    return NextResponse.json({
      ok: true,
      firebaseAdminReachable: true,
      proof: "unexpected-user-found",
      firebaseAdminRuntime: firebaseAdminRuntimeInfo,
    });
  } catch (error) {
    if (isExpectedMissingUser(error)) {
      return NextResponse.json({
        ok: true,
        firebaseAdminReachable: true,
        proof: "expected-user-not-found",
        firebaseAdminRuntime: firebaseAdminRuntimeInfo,
      });
    }

    if (isFirebaseAdminCredentialUnavailable(error)) {
      return NextResponse.json(
        {
          ok: false,
          firebaseAdminReachable: false,
          error: "Firebase Admin credential unavailable",
          action:
            firebaseAdminRuntimeInfo.credentialSource === "application-default"
              ? "Refresh Application Default Credentials with gcloud auth application-default login --project quipsly-reef, then restart the local Next server."
              : "Provide valid server Firebase Admin credentials, then restart the app server.",
          firebaseAdminRuntime: firebaseAdminRuntimeInfo,
        },
        { status: 503 },
      );
    }

    console.error("Firebase Admin preflight failed", error);
    return NextResponse.json(
      {
        ok: false,
        firebaseAdminReachable: false,
        error: "Firebase Admin preflight failed",
        firebaseAdminRuntime: firebaseAdminRuntimeInfo,
      },
      { status: 500 },
    );
  }
}
