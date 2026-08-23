"use client";

import {
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  quipslyEmailActionSettings,
} from "@/lib/firebase/quipsly-auth-input";

export {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  quipslyEmailActionSettings,
} from "@/lib/firebase/quipsly-auth-input";

const RETRYABLE_SESSION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function createQuipslyServerSession({
  idToken,
  inviteToken,
  fetcher,
}: {
  idToken: string;
  inviteToken?: string;
  fetcher: typeof fetch;
}) {
  let lastError = "Quipsly could not create a server session.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken, inviteToken }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === 1) throw new Error(lastError);
      continue;
    }
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      code?: string;
    };
    if (response.ok) return;
    lastError = String(payload.error || lastError);
    const retryable = RETRYABLE_SESSION_STATUSES.has(response.status)
      || payload.code === "INVALID_SESSION_REQUEST";
    if (!retryable || attempt === 1) throw new Error(lastError);
  }
}

export async function finishQuipslyFirebaseSignIn({
  user,
  callbackUrl,
  inviteToken,
  fetcher = fetch,
  navigate = (url) => window.location.assign(url),
}: {
  user: User;
  callbackUrl?: string | null;
  inviteToken?: string | null;
  fetcher?: typeof fetch;
  navigate?: (url: string) => void;
}) {
  await user.reload();

  if (!user.emailVerified) {
    const verificationSent = await sendEmailVerification(
      user,
      quipslyEmailActionSettings({
        origin: window.location.origin,
        callbackUrl,
        inviteToken,
        action: "verify",
      }),
    )
      .then(() => true)
      .catch(() => false);
    await signOut(auth);
    throw new Error(
      verificationSent
        ? "Verify this new email address before signing in. We sent a fresh verification link."
        : "Verify this new email address before signing in. We could not send a fresh link just now, so try again in a moment.",
    );
  }

  const idToken = await user.getIdToken(true);
  const safeInviteToken = cleanQuipslyInviteToken(inviteToken);
  await createQuipslyServerSession({
    idToken,
    inviteToken: safeInviteToken || undefined,
    fetcher,
  });

  const safeCallbackUrl = cleanQuipslyCallbackUrl(callbackUrl);
  navigate(safeCallbackUrl);

  return {
    callbackUrl: safeCallbackUrl,
  };
}
