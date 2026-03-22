import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import InternalViewNotice from "@/components/docs/InternalViewNotice";
import { resolveContentAccess, buildSignInHref } from "@/lib/content-access";
import { getModeFromCookieStore } from "@/lib/content-mode";
import { source } from "@/lib/source";

function readString(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(
  data: Record<string, unknown>,
  key: string,
): string[] {
  const value = data[key];

  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function hrefToSegments(href?: string): string[] | null {
  if (!href || !href.startsWith("/docs/")) return null;

  const trimmed = href.replace(/^\/docs\//, "");
  const segments = trimmed.split("/").filter(Boolean);

  return segments.length ? segments : null;
}

function resolveRelatedContent(
  href: string | undefined,
  eyebrow: string,
): { eyebrow: string; href: string; title: string; description?: string } | undefined {
  const segments = hrefToSegments(href);
  if (!segments || !href) return undefined;

  const linkedPage = source.getPage(segments);

  if (!linkedPage) {
    const fallbackTitle =
      segments[segments.length - 1]
        ?.split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ") ?? "Companion";

    return {
      eyebrow,
      href,
      title: fallbackTitle,
    };
  }

  const linkedData = linkedPage.data as Record<string, unknown>;

  return {
    eyebrow,
    href,
    title: readString(linkedData, "title") ?? "Companion",
    description: readString(linkedData, "description"),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];

  const page = source.getPage(segments);
  if (!page) return notFound();

  const pageData = page.data as Record<string, unknown>;
  const pathname = `/docs/${segments.join("/")}`;

  const access = readString(pageData, "access");
  const accessState = await resolveContentAccess(access);

  if (!accessState.allowed) {
    if (!accessState.isSignedIn) {
      redirect(buildSignInHref(pathname));
    }

    return notFound();
  }

  const cookieStore = await cookies();
  const mode = accessState.isTeam ? getModeFromCookieStore(cookieStore) : "public";

  const MDX = page.data.body;

  const title = readString(pageData, "title") ?? "";
  const subtitle = readString(pageData, "subtitle");
  const description = readString(pageData, "description");
  const contentType = readString(pageData, "contentType");
  const youtubeId = readString(pageData, "youtube");
  const featuredQuote = readString(pageData, "featuredQuote");
  const status = readString(pageData, "status");
  const views = readStringArray(pageData, "views");

  const pairedReading = resolveRelatedContent(
    readString(pageData, "pairedReading"),
    "Paired Reading",
  );

  const pairedEpisode = resolveRelatedContent(
    readString(pageData, "pairedEpisode"),
    "Companion Episode",
  );

  const themes = readStringArray(pageData, "themes");
  const motifs = readStringArray(pageData, "motifs");
  const people = readStringArray(pageData, "people");

  const metaGroups = [
    { label: "Themes", items: themes },
    { label: "Motifs", items: motifs },
    { label: "People", items: people },
  ];

  const accessLabel = access && access !== "public" ? access : undefined;
  const statusLabel = status && status !== "published" ? status : undefined;

  const internalNotice = accessState.isTeam ? (
    <InternalViewNotice
      mode={mode}
      access={access}
      status={status}
      views={views}
    />
  ) : null;

  if (youtubeId || contentType === "episode") {
    if (!youtubeId) return notFound();

    return (
      <EpisodePageShell
        title={title}
        subtitle={subtitle}
        description={description}
        youtubeId={youtubeId}
        featuredQuote={featuredQuote}
        pairedContent={pairedReading}
        metaGroups={metaGroups}
        accessLabel={accessLabel}
        statusLabel={statusLabel}
        internalNotice={internalNotice}
      >
        <MDX />
      </EpisodePageShell>
    );
  }

  return (
    <DocsPageShell
      title={title}
      subtitle={subtitle}
      description={description}
      eyebrow={contentType === "book-section" ? "Book Section" : "Reading"}
      featuredQuote={featuredQuote}
      pairedContent={pairedEpisode}
      metaGroups={metaGroups}
      accessLabel={accessLabel}
      statusLabel={statusLabel}
      internalNotice={internalNotice}
    >
      <MDX />
    </DocsPageShell>
  );
}