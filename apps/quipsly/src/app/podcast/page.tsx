import { StudioAccessShell } from "../studio-access-shell";
import { PodcastDeskClient } from "./podcast-desk-client";
import { getStudioAccessState } from "@/lib/server/studio-access";

export const dynamic = "force-dynamic";

export default async function StudioPodcastPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/podcast" />;
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
    <PodcastDeskClient
      actor={{
        primaryEmail: access.actorLabel || "anonymous@example.com",
      }}
    />
  );
}
