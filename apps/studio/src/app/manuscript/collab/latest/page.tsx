import { StudioAccessShell } from "../../../studio-access-shell";
import { getStudioAccessState } from "@/lib/server/studio-access";
import StudioManuscriptCollabClient from "./studio-manuscript-collab-client";

export const metadata = {
  title: "Live Manuscript Edit | High Ground Studio",
  description: "Private live editing room for the Studio manuscript.",
};

export default async function StudioManuscriptCollabLatestPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return (
      <StudioAccessShell mode="signed-out" redirectTo="/manuscript/collab/latest" />
    );
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel}
        roles={access.roles}
        redirectTo="/manuscript/collab/latest"
      />
    );
  }

  return <StudioManuscriptCollabClient />;
}
