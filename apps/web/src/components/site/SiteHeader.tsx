import Link from "next/link";

import SocialLinks from "./SocialLinks";

export default function SiteHeader() {
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
              href="/episodes/episode-1-write-it-down"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Episodes
            </Link>

            <Link
              href="/library"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Library
            </Link>

            <Link
              href="/updates"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Updates
            </Link>

            <Link
              href="/coaching"
              className="text-sm font-semibold text-[rgba(245,239,230,0.9)] no-underline transition hover:text-[var(--accent)]"
            >
              Coaching
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <SocialLinks />
          <Link
            href="/api/auth/signin"
            className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.9)] no-underline transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
