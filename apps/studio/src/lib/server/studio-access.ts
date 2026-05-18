import { auth } from "@/auth";
import { canAccessStudio } from "@/lib/studio-authz";

export async function getStudioAccessState() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const actorLabel =
    session?.user?.primaryEmail || session?.user?.email || session?.user?.id || "";

  return {
    session,
    roles,
    actorLabel,
    isSignedIn: Boolean(session?.user?.id),
    canAccess: canAccessStudio(roles),
  };
}
