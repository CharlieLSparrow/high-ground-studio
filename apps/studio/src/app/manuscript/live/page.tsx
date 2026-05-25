import { StudioAccessShell } from "../../studio-access-shell";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { StudioManuscriptLiveRoomClient } from "./studio-manuscript-live-room-client";

export const dynamic = "force-dynamic";

export default async function StudioManuscriptLivePage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/manuscript/live" />;
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
    <StudioManuscriptLiveRoomClient
      actor={{
        primaryEmail: access.actorLabel,
      }}
    />
  );
}
