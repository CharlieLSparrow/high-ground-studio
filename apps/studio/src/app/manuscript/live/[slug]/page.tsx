import { notFound } from "next/navigation";

import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  getLatestStudioManuscriptSnapshotForLiveSlug,
  normalizeStudioManuscriptLiveSlug,
} from "@/lib/server/studio-manuscript-snapshots";

import { StudioManuscriptLiveReader } from "./studio-manuscript-live-reader";

export const dynamic = "force-dynamic";

export default async function StudioManuscriptLivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const slug = normalizeStudioManuscriptLiveSlug(resolvedParams.slug);

  if (!slug) {
    notFound();
  }

  if (!getStudioDatabaseUrl()) {
    return (
      <main className="grid min-h-screen place-items-center p-3.5 md:p-6">
        <section className="grid w-full max-w-[620px] gap-3.5 rounded-lg border border-studio-line bg-studio-panel/95 p-6 shadow-studio-panel">
          <h1 className="m-0 text-[1.75rem] leading-tight text-studio-ink">
            Shared manuscript is not available
          </h1>
          <p className="m-0 text-[0.94rem] leading-relaxed text-studio-muted">
            Server manuscript snapshots need a configured Studio database before
            this read-only link can load.
          </p>
        </section>
      </main>
    );
  }

  const snapshot = await getLatestStudioManuscriptSnapshotForLiveSlug({ slug });

  if (!snapshot) {
    return (
      <main className="grid min-h-screen place-items-center p-3.5 md:p-6">
        <section className="grid w-full max-w-[620px] gap-3.5 rounded-lg border border-studio-line bg-studio-panel/95 p-6 shadow-studio-panel">
          <h1 className="m-0 text-[1.75rem] leading-tight text-studio-ink">
            No manuscript backup saved yet
          </h1>
          <p className="m-0 text-[0.94rem] leading-relaxed text-studio-muted">
            Save the manuscript in Studio, then reopen this shared latest link.
          </p>
        </section>
      </main>
    );
  }

  return <StudioManuscriptLiveReader snapshot={snapshot} />;
}
