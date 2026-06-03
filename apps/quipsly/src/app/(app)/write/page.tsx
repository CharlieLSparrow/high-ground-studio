import { StudioAccessShell } from "../studio-access-shell";
import { StudioWritingDeskClient } from "./studio-writing-desk-client";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { loadStudioWritingDeskData } from "@/lib/server/studio-writing-desk";

export const dynamic = "force-dynamic";

export default async function StudioWritingDeskPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/write" />;
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

  const data = await loadStudioWritingDeskData();

  return (
    <StudioWritingDeskClient
      {...data}
      actor={{
        primaryEmail: access.actorLabel,
      }}
    />
  );
}
