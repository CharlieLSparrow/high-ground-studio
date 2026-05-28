import { auth } from "@/auth";
import EpisodeFeed from "@/components/home/EpisodeFeed";
import HeroSection from "@/components/home/HeroSection";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

export default async function HomePage() {
  const session = await auth();
  
  redirectToWelcomeIfNeeded(session, "/");

  return (
    <main className="min-h-screen text-[var(--text-light)] bg-void">
      <HeroSection />
      <EpisodeFeed />
    </main>
  );
}
