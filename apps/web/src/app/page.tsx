import { auth } from "@/auth";
import EpisodeFeed from "@/components/home/EpisodeFeed";
import FeaturedEpisode from "@/components/home/FeaturedEpisode";
import HeroSection from "@/components/home/HeroSection";
import { canAccessInternalContent } from "@/lib/authz";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";
import { cookies } from "next/headers";

export default async function HomePage() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeam = canAccessInternalContent(roles);
  const cookieStore = await cookies();
  const variant = getLayoutVariantFromCookieStore(cookieStore, isTeam);

  redirectToWelcomeIfNeeded(session, "/");

  return (
    <main
      className={[
        "min-h-screen text-[var(--text-light)]",
        variant === "editorial"
          ? "bg-[linear-gradient(180deg,#1f1814_0%,#463326_28%,#7e5c39_62%,#f1e5d2_100%)]"
          : variant === "signal"
            ? "bg-[linear-gradient(180deg,#0b1318_0%,#132127_28%,#223239_55%,#d9e1e3_100%)]"
            : "bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]",
      ].join(" ")}
    >
      <HeroSection variant={variant} />
      <FeaturedEpisode variant={variant} />
      <EpisodeFeed variant={variant} />
    </main>
  );
}
