import ProgressStoryView from "@/components/progress/ProgressStoryView";
import { getTeamProgressStory } from "@/lib/server/team-progress";

export default function TeamProgressPage() {
  const story = getTeamProgressStory();

  return (
    <ProgressStoryView
      notice="This page is intentionally team-only. Future agents should add a short entry when they land a meaningful commit, merge, or deploy so Homer, Mako, Melissa, and the rest of the team can follow the work without reading terminal transcripts."
      noticeLabel="Team Note"
      story={story}
    />
  );
}
