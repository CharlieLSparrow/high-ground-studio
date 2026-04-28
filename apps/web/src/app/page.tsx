import { auth } from "@/auth";
import EpisodeFeed from "@/components/home/EpisodeFeed";
import FeaturedEpisode from "@/components/home/FeaturedEpisode";
import HeroSection from "@/components/home/HeroSection";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

export default async function HomePage() {
  const session = await auth();

  redirectToWelcomeIfNeeded(session, "/");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)] text-[var(--text-light)]">
      <HeroSection />
      <FeaturedEpisode />
      <EpisodeFeed />
    </main>
  );
}
