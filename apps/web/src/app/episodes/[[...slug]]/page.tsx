import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import InternalViewNotice from "@/components/docs/InternalViewNotice";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref, resolveContentAccess } from "@/lib/content-access";
import { getModeFromCookieStore } from "@/lib/content-mode";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import { bookSections } from "@/lib/reading";
import { episodes } from "@/lib/site";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";
import { getEpisodeSource, isEpisodeLoaderEnabled } from "@/lib/source";

export const dynamic = "force-dynamic";

type MdxComponent = React.ComponentType<Record<string, never>>;

type EpisodePageRecord = {
  data: Record<string, unknown> & {
    title?: string;
    access?: string;
    youtube?: string;
    contentType?: string;
    body?: MdxComponent;
  };
  body?: MdxComponent;
};

function renderPublishedEpisodeFallback({
  pathname,
  isTeam,
  mode,
  layoutVariant,
}: {
  pathname: string;
  isTeam: boolean;
  mode: string;
  layoutVariant: ReturnType<typeof getLayoutVariantFromCookieStore>;
}) {
  const episode = episodes.find(
    (entry) =>
      entry.href === pathname &&
      entry.access === "public" &&
      (entry.status ?? "published") === "published",
  );

  if (!episode) {
    return null;
  }

  const pairedReading = bookSections.find(
    (entry) => entry.pairingId === episode.pairingId,
  );

  return (
    <EpisodePageShell
      title={episode.title}
      subtitle={episode.subtitle}
      description={episode.description}
      youtubeId={episode.youtubeId}
      accessLabel="Public"
      statusLabel="Published"
      layoutVariant={layoutVariant}
      pairedContent={
        pairedReading
          ? {
              eyebrow: "Paired Reading",
              title: pairedReading.title,
              href: pairedReading.href,
              description: pairedReading.description,
            }
          : undefined
      }
      internalNotice={
        isTeam ? (
          <InternalViewNotice
            mode={mode as never}
            access={episode.access}
            status={episode.status}
            views={episode.views}
          />
        ) : null
      }
    >
      <p>
        This episode is part of the published High Ground Odyssey library.
        Watch the conversation above, follow the paired reading, and keep
        moving through the story from there.
      </p>

      <p>
        The deeper companion layer for this page is being refreshed so the
        public episode library stays clear, consistent, and easy to navigate.
      </p>
    </EpisodePageShell>
  );
}

function renderPublishedReadingFallback({
  pathname,
  isTeam,
  mode,
  layoutVariant,
}: {
  pathname: string;
  isTeam: boolean;
  mode: string;
  layoutVariant: ReturnType<typeof getLayoutVariantFromCookieStore>;
}) {
  const reading = bookSections.find(
    (entry) =>
      entry.href === pathname &&
      entry.access === "public" &&
      (entry.status ?? "published") === "published",
  );

  if (!reading) {
    return null;
  }

  const pairedEpisode = episodes.find(
    (entry) => entry.pairingId === reading.pairingId,
  );

  return (
    <DocsPageShell
      title={reading.title}
      subtitle={reading.subtitle}
      description={reading.description}
      eyebrow="Reading"
      accessLabel="Public"
      statusLabel="Published"
      layoutVariant={layoutVariant}
      pairedContent={
        pairedEpisode
          ? {
              eyebrow: "Episode",
              title: pairedEpisode.title,
              href: pairedEpisode.href,
              description: pairedEpisode.description,
            }
          : undefined
      }
      internalNotice={
        isTeam ? (
          <InternalViewNotice
            mode={mode as never}
            access={reading.access}
            status={reading.status}
            views={reading.views}
          />
        ) : null
      }
    >
      <p>
        This companion reading is part of the published High Ground Odyssey
        library.
      </p>

      <p>
        If you came here from an episode page, continue with the paired episode
        or return to the library while the full reading presentation is brought
        back into place.
      </p>
    </DocsPageShell>
  );
}

function renderInternalDiagnostics({
  segments,
  availablePages,
}: {
  segments: string[];
  availablePages: string[];
}) {
  return (
    <main className="min-h-screen bg-void p-10 font-mono text-subject">
      <h1 className="mb-4 text-3xl font-bold text-flare">
        Episode Route Diagnostics
      </h1>
      <p className="mb-6 text-flare-glow">Requested slug: {segments.join("/") || "index"}</p>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-glass">
        <p className="mb-3 font-bold text-subject-muted">
          Episodes loader enabled: {isEpisodeLoaderEnabled ? "yes" : "no"}
        </p>
        <p className="mb-4 font-bold text-subject-muted">
          Pages currently loaded: {availablePages.length}
        </p>
        <ul className="space-y-2 pl-5">
          {availablePages.length === 0 ? (
            <li className="font-bold text-red-400">No pages are currently loaded.</li>
          ) : (
            availablePages.map((pagePath) => (
              <li key={pagePath} className="text-subject">
                - {pagePath || "index"}
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];
  const pathname = `/episodes/${segments.join("/")}`;
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeam = canAccessInternalContent(roles);

  redirectToWelcomeIfNeeded(session, pathname);

  const source = await getEpisodeSource();
  const page = source.getPage(segments);

  if (!page) {
    const cookieStore = await cookies();
    const mode = isTeam ? getModeFromCookieStore(cookieStore) : "public";
    const layoutVariant = getLayoutVariantFromCookieStore(cookieStore, isTeam);

    const episodeFallback = renderPublishedEpisodeFallback({
      pathname,
      isTeam,
      mode,
      layoutVariant,
    });

    if (episodeFallback) {
      return episodeFallback;
    }

    const readingFallback = renderPublishedReadingFallback({
      pathname,
      isTeam,
      mode,
      layoutVariant,
    });

    if (readingFallback) {
      return readingFallback;
    }

    if (isTeam || process.env.NODE_ENV !== "production") {
      const availablePages = source.getPages().map((p) => p.slugs.join("/"));
      return renderInternalDiagnostics({ segments, availablePages });
    }

    return notFound();
  }

  const episodePage = page as unknown as EpisodePageRecord;
  const pageData = episodePage.data;

  const accessState = await resolveContentAccess(
    typeof pageData.access === "string" ? pageData.access : undefined,
  );

  if (!accessState.allowed) {
    if (!accessState.isSignedIn) {
      redirect(buildSignInHref(pathname));
    }
    return notFound();
  }

  const cookieStore = await cookies();
  const mode = accessState.isTeam ? getModeFromCookieStore(cookieStore) : "public";
  const layoutVariant = getLayoutVariantFromCookieStore(
    cookieStore,
    accessState.isTeam,
  );
  const MDX = episodePage.body ?? pageData.body;
  const title = typeof pageData.title === "string" ? pageData.title : "Untitled";
  const youtubeId = typeof pageData.youtube === "string" ? pageData.youtube : "";

  if (!MDX) {
    return notFound();
  }

  if (pageData.youtube || pageData.contentType === "episode") {
    return (
      <EpisodePageShell
        title={title}
        youtubeId={youtubeId}
        layoutVariant={layoutVariant}
        internalNotice={
          accessState.isTeam ? <InternalViewNotice mode={mode} {...pageData} /> : null
        }
        {...pageData}
      >
        <MDX />
      </EpisodePageShell>
    );
  }

  return (
    <DocsPageShell
      title={title}
      layoutVariant={layoutVariant}
      internalNotice={
        accessState.isTeam ? <InternalViewNotice mode={mode} {...pageData} /> : null
      }
      {...pageData}
    >
      <MDX />
    </DocsPageShell>
  );
}
