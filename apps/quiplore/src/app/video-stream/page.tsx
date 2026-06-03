import { VideoSwipeFeed } from "@/components/VideoSwipeFeed";

export const metadata = {
  title: "QuipStream - Video",
};

export default function VideoStreamPage() {
  return (
    <main className="w-full h-screen bg-black overflow-hidden">
      <VideoSwipeFeed />
    </main>
  );
}
