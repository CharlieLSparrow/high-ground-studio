import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import InternalViewNotice from "@/components/docs/InternalViewNotice";
import { resolveContentAccess, buildSignInHref } from "@/lib/content-access";
import { getModeFromCookieStore } from "@/lib/content-mode";
import { source } from "@/lib/source";

// Force fresh rendering to pick up new Env Vars and Cookies
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const segments = slug ?? [];
  const page = source.getPage(segments);

  // DIAGNOSTIC HUD: If this appears, the folder path in source.config.ts is wrong
  if (!page) {
    const available = source.getPages().map((p) => p.slugs.join("/"));
    return (
      <div className="min-h-screen bg-void p-10 font-mono text-subject">
        <h1 className="text-flare text-2xl font-bold">++?????++ Hex Diagnostic</h1>
        <p className="mt-4">Hex is looking for: <span className="text-flare-glow">[{segments.join(", ")}]</span></p>
        <div className="mt-6 border border-white/10 bg-white/5 p-4 rounded-lg">
          <p className="text-subject-muted mb-2">Files actually found in memory:</p>
          {available.length === 0 ? <p className="text-red-400">ZERO FILES. Check source.config.ts dir path.</p> : 
          <ul className="list-disc pl-5">{available.map(s => <li key={s}>{s || "index"}</li>)}</ul>}
        </div>
      </div>
    );
  }

  const pageData = page.data as any;
  const accessState = await resolveContentAccess(pageData.access);
  if (!accessState.allowed) {
    if (!accessState.isSignedIn) redirect(buildSignInHref(`/episodes/${segments.join("/")}`));
    return notFound();
  }

  const MDX = page.data.body;
  const isEpisode = pageData.youtube || pageData.contentType === "episode";

  if (isEpisode) {
    return (
      <EpisodePageShell title={pageData.title} youtubeId={pageData.youtube} {...pageData}>
        <MDX />
      </EpisodePageShell>
    );
  }

  return (
    <DocsPageShell title={pageData.title} {...pageData}>
      <MDX />
    </DocsPageShell>
  );
}