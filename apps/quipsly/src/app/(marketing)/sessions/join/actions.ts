"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  acceptSessionInvitation,
  cleanSessionInvitationToken,
  SessionInvitationError,
} from "@/lib/server/session-invitation";

function joinPath(token: string, error?: string) {
  const params = new URLSearchParams({ token });
  if (error) params.set("error", error);
  return `/sessions/join?${params.toString()}`;
}

export async function acceptSessionInvitationAction(formData: FormData) {
  const token = cleanSessionInvitationToken(formData.get("token"));
  if (!token) redirect("/sessions/join?error=INVALID_INVITATION");
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(joinPath(token))}`);
  }

  let accepted: Awaited<ReturnType<typeof acceptSessionInvitation>>;
  try {
    accepted = await acceptSessionInvitation({
      token,
      actor: {
        id: session.user.id,
        email: session.user.email,
        primaryEmail: session.user.primaryEmail,
        name: session.user.name,
      },
    });
  } catch (error) {
    const code = error instanceof SessionInvitationError ? error.code : "INVITATION_ACCEPT_FAILED";
    redirect(joinPath(token, code));
  }
  redirect(`/sessions/${encodeURIComponent(accepted.roomId)}?mode=live&joined=1`);
}
