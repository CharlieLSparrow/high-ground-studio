import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import InternalViewNotice from "@/components/docs/InternalViewNotice";
import { resolveContentAccess, buildSignInHref } from "@/lib/content-access";
import { getModeFromCookieStore } from "@/lib/content-mode";
import { getEpisodeSource, isEpisodeLoaderEnabled } from "@/lib/source";

// 👈 THE KILl-SWITCH FOR 500 ERRORS
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];
  const source = await getEpisodeSource();

  // Try to find the page in the Fumadocs library [cite: 185]
  const page = source.getPage(segments);

  // 🚨 THE HEX DIAGNOSTIC HUD
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
              Episodes content loader guard is active. Set
              `ENABLE_EPISODES_FUMADOCS=1` to re-enable the Fumadocs source.
            </p>
          ) : null}
          <ul className="space-y-2 pl-5">
            {availablePages.length === 0 ? (
              <li className="font-bold text-red-400">(Zero files. Check source.config.ts)</li>
            ) : (
              availablePages.map(p => <li key={p} className="text-subject">👉 {p || "index"}</li>)
            )}
          </ul>
        </div>
      </div>
    );
  }

  const pageData = page.data as any;
  const pathname = `/episodes/${segments.join("/")}`;

  // Check if the user has clearance [cite: 200]
  const accessState = await resolveContentAccess(pageData.access);

  if (!accessState.allowed) {
    if (!accessState.isSignedIn) {
      redirect(buildSignInHref(pathname)); // [cite: 201]
    }
    return notFound();
  }

  const cookieStore = await cookies();
  const mode = accessState.isTeam ? getModeFromCookieStore(cookieStore) : "public";
  const MDX = page.data.body;

  // Determine if we use the Cinematic Episode shell or the Reading shell [cite: 213]
  if (pageData.youtube || pageData.contentType === "episode") {
    return (
      <EpisodePageShell 
        title={pageData.title} 
        youtubeId={pageData.youtube} 
        internalNotice={accessState.isTeam ? <InternalViewNotice mode={mode} {...pageData} /> : null}
        {...pageData} 
      >
        <MDX />
      </EpisodePageShell>
    );
  }

  return (
    <DocsPageShell 
      title={pageData.title} 
      internalNotice={accessState.isTeam ? <InternalViewNotice mode={mode} {...pageData} /> : null}
      {...pageData}
    >
      <MDX />
    </DocsPageShell>
  );
}
