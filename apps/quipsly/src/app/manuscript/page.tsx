import { StudioAccessShell } from "../studio-access-shell";
import { StudioManuscriptClient } from "./studio-manuscript-client";
import { getStudioAccessState } from "@/lib/server/studio-access";

export const dynamic = "force-dynamic";

export default async function StudioManuscriptPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/manuscript" />;
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel || undefined}
        roles={access.roles}
      />
    );
  }

  return (
    <StudioManuscriptClient
      actor={{
        primaryEmail: access.actorLabel,
      }}
    />
  );
}
