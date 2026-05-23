import { StudioAccessShell } from "../studio-access-shell";
import { StudioNav } from "../studio-nav";
import { getStudioAccessState } from "@/lib/server/studio-access";

import { ContentStudioClient } from "./content-studio-client";

export const dynamic = "force-dynamic";

export default async function ContentStudioPage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo="/content-studio" />;
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel || undefined}
        roles={access.roles}
        redirectTo="/content-studio"
      />
    );
  }

  return (
    <main className="min-h-screen px-3.5 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid w-full max-w-[1380px] gap-4">
        <header className="grid gap-4 rounded-lg border border-studio-line bg-studio-panel/95 p-4 shadow-studio-panel md:grid-cols-[1fr_auto] md:items-start">
          <div className="grid gap-2">
            <p className="m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim">
              Content Management Studio
            </p>
            <h1 className="m-0 max-w-[760px] text-3xl leading-none tracking-normal text-studio-ink md:text-5xl">
              Command center
            </h1>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-lg border border-studio-tag/45 bg-black/20 px-2 py-1 text-[0.72rem] font-extrabold uppercase tracking-normal text-studio-tag">
                Podcast
              </span>
              <span className="rounded-lg border border-studio-source/45 bg-black/20 px-2 py-1 text-[0.72rem] font-extrabold uppercase tracking-normal text-studio-source">
                Book
              </span>
              <span className="rounded-lg border border-studio-node/45 bg-black/20 px-2 py-1 text-[0.72rem] font-extrabold uppercase tracking-normal text-studio-node">
                Episode Pages
              </span>
              <span className="rounded-lg border border-studio-line bg-black/20 px-2 py-1 text-[0.72rem] font-extrabold uppercase tracking-normal text-studio-muted">
                Browser local
              </span>
            </div>
          </div>
          <StudioNav />
        </header>

        <ContentStudioClient actorLabel={access.actorLabel || "Studio"} />
      </div>
    </main>
  );
}
