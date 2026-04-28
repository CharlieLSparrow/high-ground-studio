import Link from "next/link";
import { cookies } from "next/headers";

import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { resolveTeamAccess } from "@/lib/content-access";
import {
  formatContentModeLabel,
  getModeFromCookieStore,
  isContentVisibleInMode,
} from "@/lib/content-mode";
import { auth } from "@/auth";
import { getLayoutVariantFromCookieStore, type LayoutVariant } from "@/lib/layout-variant";
import { bookSections } from "@/lib/reading";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";
import { episodes } from "@/lib/site";

type Entry = {
  title: string;
  subtitle?: string;
  href: string;
  description: string;
  access?: string;
  status?: string;
  views?: string[];
};

function filterEntries(entries: Entry[], mode: ReturnType<typeof getModeFromCookieStore>, isTeam: boolean) {
  return entries.filter((entry) =>
    isContentVisibleInMode({
      mode,
      isTeam,
      access: entry.access,
      status: entry.status,
      views: entry.views,
    }),
  );
}

function EntryCard({
  entry,
  eyebrow,
  variant,
}: {
  entry: Entry;
  eyebrow: string;
  variant: LayoutVariant;
}) {
  return (
    <GlassPanel
      className={[
        "p-6 text-[var(--text-light)]",
        variant === "editorial"
          ? "border-[rgba(255,244,225,0.16)] bg-[rgba(74,54,37,0.42)]"
          : variant === "signal"
            ? "border-white/8 bg-[rgba(255,255,255,0.035)]"
            : "",
      ].join(" ")}
    >
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
        {eyebrow}
      </div>

      <h2 className="m-0 text-[1.4rem] font-bold leading-7 text-[var(--text-light)]">
        {entry.title}
      </h2>

      {entry.subtitle ? (
        <p className="mb-0 mt-2 text-[0.9rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
          {entry.subtitle}
        </p>
      ) : null}

      <p className="mb-0 mt-4 text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
        {entry.description}
      </p>

      <div className="mt-5">
        <Link
          href={entry.href}
          className="text-[15px] font-extrabold text-[var(--text-light)] no-underline transition hover:text-[var(--accent)]"
        >
          Open →
        </Link>
      </div>
    </GlassPanel>
  );
}

export default async function LibraryPage() {
  const session = await auth();
  redirectToWelcomeIfNeeded(session, "/library");
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeamSession = canAccessInternalContent(roles);

  const teamAccess = await resolveTeamAccess();
  const cookieStore = await cookies();
  const mode = teamAccess.isTeam ? getModeFromCookieStore(cookieStore) : "public";
  const layoutVariant = getLayoutVariantFromCookieStore(
    cookieStore,
    isTeamSession,
  );

  const visibleEpisodes = filterEntries(episodes, mode, teamAccess.isTeam);
  const visibleBookSections = filterEntries(bookSections, mode, teamAccess.isTeam);

  return (
    <main
      className={[
        "min-h-screen",
        layoutVariant === "editorial"
          ? "bg-[linear-gradient(180deg,#1b140f_0%,#453124_24%,#745336_64%,#f1e5d2_100%)]"
          : layoutVariant === "signal"
            ? "bg-[linear-gradient(180deg,#0c1418_0%,#152228_22%,#23343d_55%,#dbe3e5_100%)]"
            : "bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]",
      ].join(" ")}
    >
      <PageContainer className="pb-24 pt-8">
        <div className="mb-8">
          <BackLink href="/">
            <span aria-hidden="true">←</span>
            <span>Back to High Ground Odyssey</span>
          </BackLink>
        </div>

        <header className="mb-10 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap gap-3">
            <PageEyebrow>Library</PageEyebrow>
            {teamAccess.isTeam ? (
              <PageEyebrow>{formatContentModeLabel(mode)}</PageEyebrow>
            ) : null}
          </div>

          <h1 className="m-0 max-w-[860px] text-[clamp(2.6rem,6vw,4.8rem)] leading-[0.94] tracking-[-0.05em] text-[var(--text-light)]">
            The story library
          </h1>

          <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
            A curated front door into the project — companion episodes, paired
            readings, and eventually the broader library of quotes, stories,
            reflections, and collected meaning.
          </p>
        </header>

        <section className="mb-12">
          <div className="mb-5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
            Episodes
          </div>

          <div className="grid gap-6">
            {visibleEpisodes.map((episode) => (
              <EntryCard
                key={episode.href}
                entry={episode}
                eyebrow="Episode"
                variant={layoutVariant}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
            Paired Reading
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleBookSections.map((section) => (
              <EntryCard
                key={section.href}
                entry={section}
                eyebrow="Book Section"
                variant={layoutVariant}
              />
            ))}
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
