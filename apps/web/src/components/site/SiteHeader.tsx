import Link from "next/link";

import { auth } from "@/auth";
import { canAccessInternalContent } from "@/lib/authz";

import SocialLinks from "./SocialLinks";
import AuthButtons from "./AuthButtons";
import LayoutVariantSwitcher from "./LayoutVariantSwitcher";
import ModeSwitcher from "./ModeSwitcher";

export default async function SiteHeader() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const showTeamLink = canAccessInternalContent(roles);
  const showDashboardLink = Boolean(session?.user);

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[rgba(6,16,20,0.72)] backdrop-blur-[18px]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-extrabold tracking-[-0.03em] text-[var(--text-light)] no-underline"
          >
            High Ground Odyssey
          </Link>

          <nav className="hidden items-center gap-4 md:flex">
            <Link
              href="/library"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Library
            </Link>

            <Link
              href="/coaching"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Coaching
            </Link>

            {showDashboardLink ? (
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
              >
                Member Home
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {showTeamLink ? (
            <div className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-[rgba(255,255,255,0.035)] px-1.5 py-1 opacity-80 transition hover:opacity-100 lg:flex">
              <Link
                href="/team/clients"
                className="rounded-full px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[rgba(245,239,230,0.62)] no-underline transition hover:text-[var(--accent)]"
              >
                Studio
              </Link>
              <LayoutVariantSwitcher isTeam={showTeamLink} />
              <ModeSwitcher />
            </div>
          ) : null}
          <SocialLinks />
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}
