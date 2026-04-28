import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import InternalViewNotice from "@/components/docs/InternalViewNotice";
import { resolveContentAccess, buildSignInHref } from "@/lib/content-access";
import { getModeFromCookieStore } from "@/lib/content-mode";
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

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];
  const source = await getEpisodeSource();

  const page = source.getPage(segments);

  if (!page) {
    const availablePages = source.getPages().map((p) => p.slugs.join("/"));
    return (
      <div className="min-h-screen bg-void p-10 font-mono text-subject">
        <h1 className="mb-4 text-3xl font-bold text-flare">++?????++ Hex Diagnostics</h1>
        <p className="mb-8 text-flare-glow">Looking for: [{segments.join(", ")}]</p>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-glass">
          <p className="mb-4 font-bold text-subject-muted">Files loaded in memory:</p>
          {!isEpisodeLoaderEnabled ? (
            <p className="mb-4 font-bold text-amber-300">
              Episodes content loader guard is active. Set{" "}
              <code>ENABLE_EPISODES_FUMADOCS=1</code> to re-enable the Fumadocs
              source.
            </p>
          ) : null}
          <ul className="space-y-2 pl-5">
            {availablePages.length === 0 ? (
              <li className="font-bold text-red-400">(Zero files. Check source.config.ts)</li>
            ) : (
              availablePages.map((p) => (
                <li key={p} className="text-subject">
                  👉 {p || "index"}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    );
  }

  const episodePage = page as unknown as EpisodePageRecord;
  const pageData = episodePage.data;
  const pathname = `/episodes/${segments.join("/")}`;

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
      internalNotice={
        accessState.isTeam ? <InternalViewNotice mode={mode} {...pageData} /> : null
      }
      {...pageData}
    >
      <MDX />
    </DocsPageShell>
  );
}