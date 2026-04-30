import Link from "next/link";
import { notFound } from "next/navigation";

import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import {
  getShowPrepCandidate,
  type ShowPrepSourcePreview,
  type ShowPrepSourceStatus,
} from "@/lib/server/show-prep";

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceStatusLabel(status: ShowPrepSourceStatus) {
  switch (status) {
    case "present":
      return "Source found";
    case "empty":
      return "Empty";
    default:
      return "Missing";
  }
}

function charlieCandidateLabel(
  status: ShowPrepSourceStatus,
  hasCharlieContent: boolean,
) {
  if (hasCharlieContent) {
    return "Real content";
  }

  if (status === "present") {
    return "Source found only";
  }

  return sourceStatusLabel(status);
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/12 bg-white/7 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.88)]">
      {label}: {value}
    </div>
  );
}

function SourcePreviewCard({
  eyebrow,
  title,
  source,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  source: ShowPrepSourcePreview | null;
  emptyMessage: string;
}) {
  return (
    <PaperCard className="min-w-0">
      <PageEyebrow>{eyebrow}</PageEyebrow>
      <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
        {title}
      </h2>

      {source ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm leading-6 text-[rgba(33,24,18,0.84)]">
            <div>
              <strong className="text-[#1d1712]">Source file:</strong> <code>{source.path}</code>
            </div>
            <div>
              <strong className="text-[#1d1712]">Status:</strong> {sourceStatusLabel(source.status)}
            </div>
          </div>

          {source.preview ? (
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.48)] px-5 py-4 text-[0.95rem] leading-7 text-[rgba(33,24,18,0.9)]">
              {source.preview}
            </pre>
          ) : (
            <p className="m-0 text-[1rem] leading-7 text-[rgba(38,30,24,0.8)]">
              {emptyMessage}
            </p>
          )}
        </div>
      ) : (
        <p className="mb-0 mt-5 text-[1rem] leading-7 text-[rgba(38,30,24,0.8)]">
          {emptyMessage}
        </p>
      )}
    </PaperCard>
  );
}

function SourceListSection({
  eyebrow,
  title,
  sources,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  sources: ShowPrepSourcePreview[];
  emptyMessage: string;
}) {
  return (
    <PaperCard className="min-w-0">
      <PageEyebrow>{eyebrow}</PageEyebrow>
      <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
        {title}
      </h2>

      {sources.length ? (
        <div className="mt-5 space-y-4">
          {sources.map((source) => (
            <div
              key={`${source.path}-${source.label}`}
              className="rounded-[28px] border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.5)] p-5"
            >
              <div className="mb-3 text-sm leading-6 text-[rgba(33,24,18,0.84)]">
                <div>
                  <strong className="text-[#1d1712]">Source file:</strong> <code>{source.path}</code>
                </div>
                <div>
                  <strong className="text-[#1d1712]">Status:</strong> {sourceStatusLabel(source.status)}
                </div>
              </div>

              {source.preview ? (
                <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-[0.94rem] leading-7 text-[rgba(33,24,18,0.9)]">
                  {source.preview}
                </pre>
              ) : (
                <p className="m-0 text-[0.98rem] leading-7 text-[rgba(38,30,24,0.8)]">
                  File exists but is empty.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-0 mt-5 text-[1rem] leading-7 text-[rgba(38,30,24,0.8)]">
          {emptyMessage}
        </p>
      )}
    </PaperCard>
  );
}

export default async function ShowPrepCandidatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const candidate = await getShowPrepCandidate(slug);

  if (!candidate) {
    notFound();
  }

  const scottPreview = candidate.scottSource ?? candidate.inboxMainSources[0] ?? null;
  const charliePreview =
    candidate.charlieSources.find((source) => source.status === "present") ??
    candidate.charlieSources[0] ??
    null;

  return (
    <section className="space-y-8">
      <div>
        <BackLink href="/team/show-prep">
          <span aria-hidden="true">←</span>
          <span>Back to Show Prep</span>
        </BackLink>
      </div>

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap gap-3">
          <PageEyebrow>Potential Episode</PageEyebrow>
          {candidate.episodeNumber ? <PageEyebrow>Episode {candidate.episodeNumber}</PageEyebrow> : null}
          <PageEyebrow>{candidate.recommendedNextAction}</PageEyebrow>
          {candidate.confidence ? <PageEyebrow>{formatLabel(candidate.confidence)}</PageEyebrow> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div>
            <h2 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              {candidate.title}
            </h2>

            <div className="mt-3 text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
              {candidate.slug}
            </div>

            <p className="mb-0 mt-5 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
              This page is a read-only preview over messy source material. It
              helps the team decide whether a candidate is ready for packet
              creation without treating staging or inbox as the new source of
              truth.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <StatusChip label="Staging" value={candidate.hasStaging ? "Source found" : "Missing"} />
              <StatusChip label="Inbox" value={candidate.hasInbox ? "Source found" : "Missing"} />
              <StatusChip label="Scott" value={sourceStatusLabel(candidate.scottStatus)} />
              <StatusChip
                label="Charlie"
                value={charlieCandidateLabel(candidate.charlieStatus, candidate.hasCharlieContent)}
              />
              <StatusChip label="Research" value={sourceStatusLabel(candidate.researchStatus)} />
              <StatusChip label="Extras" value={sourceStatusLabel(candidate.extrasStatus)} />
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/6 p-5 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
            {candidate.hasCanonicalPacket ? (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  Canonical packet
                </div>
                <div className="mt-1 text-[rgba(245,239,230,0.94)]">
                  {candidate.packetTitle || candidate.packetSlug}
                </div>
                <div className="mt-3">
                  <Link
                    href={`/team/show-prep/${candidate.packetSlug || candidate.slug}`}
                    className="inline-flex items-center justify-center rounded-full border border-flare/30 bg-flare/14 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/45 hover:bg-flare/20"
                  >
                    Open Canonical Packet
                  </Link>
                </div>
              </div>
            ) : null}

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                Recommended next step
              </div>
              <div className="mt-1 text-[rgba(245,239,230,0.94)]">
                {candidate.recommendedNextAction}
              </div>
            </div>

            {candidate.manifestPath ? (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  Manifest
                </div>
                <div className="mt-1 break-all font-mono text-[rgba(245,239,230,0.94)]">
                  {candidate.manifestPath}
                </div>
              </div>
            ) : null}

            {candidate.plannedReleaseDate ? (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.66)]">
                  Planned release date
                </div>
                <div className="mt-1 text-[rgba(245,239,230,0.94)]">
                  {candidate.plannedReleaseDate}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-8 xl:grid-cols-2">
        <SourcePreviewCard
          eyebrow="Scott Source"
          title="Scott Source Preview"
          source={scottPreview}
          emptyMessage="No Scott source preview is available yet."
        />

        <SourcePreviewCard
          eyebrow="Charlie Source"
          title="Charlie Source Preview"
          source={charliePreview}
          emptyMessage="No Charlie material is available yet."
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <SourceListSection
          eyebrow="Research"
          title="Research Files"
          sources={candidate.researchSources}
          emptyMessage="No research files are attached yet."
        />

        <SourceListSection
          eyebrow="Extras / Drafts"
          title="Extras and Older Drafts"
          sources={candidate.extraSources}
          emptyMessage="No extras or old drafts are attached yet."
        />
      </div>

      <PaperCard>
        <PageEyebrow>Source Provenance</PageEyebrow>
        <h2 className="m-0 mt-2 text-[1.7rem] leading-tight tracking-[-0.03em] text-[#1d1712]">
          Provenance and Source Status
        </h2>

        <div className="mt-5 space-y-4 text-[0.98rem] leading-7 text-[rgba(33,24,18,0.88)]">
          <div className="rounded-[24px] border border-[rgba(37,28,20,0.12)] bg-[rgba(255,255,255,0.5)] px-5 py-4">
            <strong className="text-[#1d1712]">Source paths found:</strong>
            <ul className="mb-0 mt-3 space-y-2 pl-5">
              {candidate.sourcePaths.map((sourcePath) => (
                <li key={sourcePath}>
                  <code>{sourcePath}</code>
                </li>
              ))}
            </ul>
          </div>

          {candidate.issues.length ? (
            <div className="rounded-[24px] border border-[rgba(176,117,42,0.18)] bg-[rgba(255,244,219,0.7)] px-5 py-4">
              <strong className="text-[#1d1712]">Manifest issues:</strong>
              <ul className="mb-0 mt-3 space-y-2 pl-5">
                {candidate.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!candidate.issues.length ? (
            <p className="m-0">
              No explicit manifest issues are recorded for this candidate.
            </p>
          ) : null}
        </div>
      </PaperCard>
    </section>
  );
}
