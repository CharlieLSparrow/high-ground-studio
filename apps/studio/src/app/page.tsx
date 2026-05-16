import { StudioWorkbenchClient } from "./studio-workbench-client";
import { loadStudioWorkbenchData } from "@/lib/server/studio-data";

export const dynamic = "force-dynamic";

export default async function StudioHomePage() {
  const data = await loadStudioWorkbenchData();

  return <StudioWorkbenchClient {...data} />;
}
