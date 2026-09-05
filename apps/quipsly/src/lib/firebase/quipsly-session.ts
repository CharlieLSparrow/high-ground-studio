"use client";

import { sendEmailVerification, signOut, type User } from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  cleanSessionInviteToken,
  quipslyEmailActionSettings,
} from "@/lib/firebase/quipsly-auth-input";

export {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  cleanSessionInviteToken,
  quipslyEmailActionSettings,
} from "@/lib/firebase/quipsly-auth-input";

const RETRYABLE_SESSION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SESSION_RETRY_DELAYS_MS = [350, 900] as const;

function waitForSessionRetry(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

async function createQuipslyServerSession({
  idToken,
  inviteToken,
  sessionInviteToken,
  fetcher,
}: {
  idToken: string;
  inviteToken?: string;
  sessionInviteToken?: string;
  fetcher: typeof fetch;
}) {
  let lastError = "Quipsly could not create a server session.";
  const attemptCount = SESSION_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken, inviteToken, sessionInviteToken }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === attemptCount - 1) throw new Error(lastError);
      await waitForSessionRetry(SESSION_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    if (response.ok) {
      return payload.code === "INVITATION_EMAIL_VERIFIED"
        ? "refresh-id-token" as const
        : "complete" as const;
    }
    lastError = String(payload.error || lastError);
    const retryable =
      RETRYABLE_SESSION_STATUSES.has(response.status) ||
      payload.code === "INVALID_SESSION_REQUEST";
    if (!retryable || attempt === attemptCount - 1) throw new Error(lastError);
    await waitForSessionRetry(SESSION_RETRY_DELAYS_MS[attempt]);
  }
}

export async function finishQuipslyFirebaseSignIn({
  user,
  callbackUrl,
  inviteToken,
  sessionInviteToken,
  fetcher = fetch,
  navigate = (url) => window.location.assign(url),
}: {
  user: User;
  callbackUrl?: string | null;
  inviteToken?: string | null;
  sessionInviteToken?: string | null;
  fetcher?: typeof fetch;
  navigate?: (url: string) => void;
}) {
  await user.reload();

  const safeSessionInviteToken = cleanSessionInviteToken(sessionInviteToken);
  if (!user.emailVerified && !safeSessionInviteToken) {
    const verificationSent = await sendEmailVerification(
      user,
      quipslyEmailActionSettings({
        origin: window.location.origin,
        callbackUrl,
        inviteToken,
        sessionInviteToken,
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

  const safeInviteToken = cleanQuipslyInviteToken(inviteToken);
  let idToken = await user.getIdToken(true);
  const handoff = await createQuipslyServerSession({
    idToken,
    inviteToken: safeInviteToken || undefined,
    sessionInviteToken: safeSessionInviteToken || undefined,
    fetcher,
  });
  if (handoff === "refresh-id-token") {
    await user.reload();
    idToken = await user.getIdToken(true);
    const retried = await createQuipslyServerSession({
      idToken,
      inviteToken: safeInviteToken || undefined,
      sessionInviteToken: safeSessionInviteToken || undefined,
      fetcher,
    });
    if (retried !== "complete") {
      throw new Error("Quipsly could not finish the secure invitation sign-in.");
    }
  }

  const safeCallbackUrl = cleanQuipslyCallbackUrl(callbackUrl);
  navigate(safeCallbackUrl);

  return {
    callbackUrl: safeCallbackUrl,
  };
}
