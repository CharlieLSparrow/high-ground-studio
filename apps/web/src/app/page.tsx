import { auth } from "@/auth";
import EpisodeFeed from "@/components/home/EpisodeFeed";
import FeaturedEpisode from "@/components/home/FeaturedEpisode";
import HeroSection from "@/components/home/HeroSection";
import { canAccessInternalContent } from "@/lib/authz";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import { getLayoutSurfaceBackground } from "@/lib/layout-variant-styles";
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
        getLayoutSurfaceBackground(variant, "home"),
      ].join(" ")}
    >
      <HeroSection variant={variant} />
      <FeaturedEpisode variant={variant} />
      <EpisodeFeed variant={variant} />
    </main>
  );
}
