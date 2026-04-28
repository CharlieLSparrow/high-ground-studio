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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(10,21,24,0.55)] backdrop-blur-[14px]">
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
              className="text-sm font-semibold text-[rgba(245,239,230,0.84)] no-underline transition hover:text-[var(--accent)]"
            >
              Library
            </Link>

            <Link
              href="/coaching"
              className="text-sm font-semibold text-[rgba(245,239,230,0.84)] no-underline transition hover:text-[var(--accent)]"
            >
              Coaching
            </Link>

            {showDashboardLink ? (
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-[rgba(245,239,230,0.84)] no-underline transition hover:text-[var(--accent)]"
              >
                Dashboard
              </Link>
            ) : null}

            {showTeamLink ? (
              <Link
                href="/team/clients"
                className="text-sm font-semibold text-[rgba(245,239,230,0.84)] no-underline transition hover:text-[var(--accent)]"
              >
                Team
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <LayoutVariantSwitcher isTeam={showTeamLink} />
          <ModeSwitcher />
          <SocialLinks />
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}
