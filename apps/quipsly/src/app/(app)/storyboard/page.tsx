import { StoryboardDeskClient } from "./storyboard-desk-client";
import { getStoryboardShots } from "./actions";
import { getCharacters } from "../romance-lab/forge/actions";

export const dynamic = "force-dynamic";

export default async function StoryboardDeskPage() {
  const [shots, cast] = await Promise.all([
    getStoryboardShots(),
    getCharacters()
  ]);
  
  return <StoryboardDeskClient initialShots={shots} />;
}
