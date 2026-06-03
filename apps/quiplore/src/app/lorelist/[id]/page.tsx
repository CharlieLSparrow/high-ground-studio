import { VideoSwipeFeed } from "@/components/VideoSwipeFeed";

export const metadata = {
  title: "QuipStream - Lorelist",
};

export default async function LorelistPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  return (
    <main className="w-full h-screen bg-black overflow-hidden">
      <VideoSwipeFeed listId={resolvedParams.id} />
    </main>
  );
}
