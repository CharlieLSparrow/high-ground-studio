import { auth } from "@/auth";
import { verifyBearerToken } from "@/lib/server/firebase-auth";

export const MAC_WEB_SESSION_COOKIE_NAME = "quipsly_mac_session";

export async function verifyMacWebSessionToken(token?: string) {
  // Legacy function for web-session logic, now deprecated.
  return null;
}

export async function resolveMacSessionActor(request: Request) {
  // 1. Try Firebase Bearer Token (Native Apps)
  try {
    const bearerUser = await verifyBearerToken(request);
    if (bearerUser) {
      return {
        id: bearerUser.id,
        primaryEmail: bearerUser.primaryEmail,
        name: bearerUser.name,
      };
    }
  } catch (e) {
    // Ignore, try cookie
  }

  // 2. Try Firebase Session Cookie (Web Apps)
  const session = await auth();
  if (session?.user?.email) {
    return {
      id: session.user.id,
      primaryEmail: session.user.email,
      name: session.user.name,
    };
  }

  return null;
}
