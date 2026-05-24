import ProgressStoryView from "@/components/progress/ProgressStoryView";
import PageContainer from "@/components/ui/PageContainer";
import { getTeamProgressStory } from "@/lib/server/team-progress";

export const metadata = {
  title: "Build Updates | High Ground Odyssey",
  description:
    "A readable build journal for the High Ground Odyssey team and friends.",
};

export default function UpdatesPage() {
  const story = getTeamProgressStory();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <ProgressStoryView
          notice="This is the public build journal for the High Ground Odyssey team and friends. Some trail links point to internal tools, source docs, or signed-in pages; the story entries are written so the progress still makes sense without terminal transcripts."
          noticeLabel="Public Note"
          story={story}
        />
      </PageContainer>
    </main>
  );
}
