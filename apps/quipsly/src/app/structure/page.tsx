import { StudioAccessShell } from "../studio-access-shell";
import { StudioStructureClient } from "./studio-structure-client";
import { getStudioAccessState } from "@/lib/server/studio-access";

export const dynamic = "force-dynamic";

export default async function StudioStructurePage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/structure" />;
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
    <StudioStructureClient
      actor={{
        primaryEmail: access.actorLabel,
      }}
    />
  );
}
