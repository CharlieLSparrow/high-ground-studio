import { cookies } from "next/headers";
import {
  getAllowedModes,
  getModeFromCookieStore,
} from "@/lib/content-mode";
import { resolveTeamAccess } from "@/lib/content-access";
import ModeSwitcherClient from "./ModeSwitcherClient";

export default async function ModeSwitcher() {
  const teamAccess = await resolveTeamAccess();

  if (!teamAccess.isTeam) {
    return null;
  }

  const cookieStore = await cookies();
  const currentMode = getModeFromCookieStore(cookieStore);

  return (
    <ModeSwitcherClient
      currentMode={currentMode}
      allowedModes={getAllowedModes(true)}
    />
  );
}