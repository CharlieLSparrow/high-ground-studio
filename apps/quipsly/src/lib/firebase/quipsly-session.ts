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
        : "Verify this new email address before signing in. Firebase could not send a fresh link just now, so try again in a moment.",
    );
  }

  const idToken = await user.getIdToken(true);
  const safeInviteToken = cleanQuipslyInviteToken(inviteToken);
  const response = await fetcher("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idToken,
      inviteToken: safeInviteToken || undefined,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      String(payload.error || "Quipsly could not create a server session."),
    );
  }

  const safeCallbackUrl = cleanQuipslyCallbackUrl(callbackUrl);
  navigate(safeCallbackUrl);

  return {
    callbackUrl: safeCallbackUrl,
  };
}
