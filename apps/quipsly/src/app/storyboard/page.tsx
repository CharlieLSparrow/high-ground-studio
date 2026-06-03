import { StoryboardDeskClient } from "./storyboard-desk-client";
import { getStoryboardShots } from "./actions";

export const dynamic = "force-dynamic";

export default async function StoryboardDeskPage() {
  const shots = await getStoryboardShots();
  return <StoryboardDeskClient initialShots={shots} />;
}
