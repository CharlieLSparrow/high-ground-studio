import EpisodeFeed from "@/components/home/EpisodeFeed";
import FeaturedEpisode from "@/components/home/FeaturedEpisode";
import HeroSection from "@/components/home/HeroSection";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)] text-[var(--text-light)]">
      <HeroSection />
      <FeaturedEpisode />
      <EpisodeFeed />
    </main>
  );
}