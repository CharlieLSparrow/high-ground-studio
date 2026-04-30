import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import {
  getShowPrepCandidates,
  getShowPrepPackets,
  type ShowPrepCandidate,
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

function charlieCandidateLabel(candidate: ShowPrepCandidate) {
  if (candidate.hasCharlieContent) {
    return "Real content";
  }

  if (candidate.charlieStatus === "present") {
    return "Source found only";
  }

  return sourceStatusLabel(candidate.charlieStatus);
}

function SectionStatus({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[rgba(245,239,230,0.94)]">
        {value}
      </div>
    </div>
  );
}

function RecommendedActionChip({ action }: { action: ShowPrepCandidate["recommendedNextAction"] }) {
  const className =
    action === "Already packeted"
      ? "border-white/12 bg-white/7 text-[rgba(245,239,230,0.88)]"
      : action === "Create canonical packet"
        ? "border-flare/35 bg-flare/14 text-[var(--text-light)]"
        : action === "Needs source cleanup"
          ? "border-[rgba(255,184,77,0.35)] bg-[rgba(255,184,77,0.12)] text-[rgba(255,234,198,0.96)]"
          : "border-white/12 bg-white/6 text-[rgba(245,239,230,0.9)]";

  return (
    <div
      className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${className}`}
    >
      {action}
    </div>
  );
}

export default async function ShowPrepIndexPage() {
  const [packets, candidates] = await Promise.all([
    getShowPrepPackets(),
    getShowPrepCandidates(),
  ]);

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap gap-3">
          <PageEyebrow>Show Prep</PageEyebrow>
          <PageEyebrow>{packets.length} Prep-Ready Packets</PageEyebrow>
          <PageEyebrow>{candidates.length} Potential Episodes</PageEyebrow>
        </div>

        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
          Read-only cockpit over the source material
        </h2>

        <p className="mb-0 mt-4 max-w-[820px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
          Canonical packets are the working source of truth. Potential episodes
          are inventory gathered from staging and inbox so Homer and Charlie can
          see the full field before deciding what to packet next.
        </p>
      </GlassPanel>

      <div className="space-y-5">
        <div>
          <div className="mb-3 flex flex-wrap gap-3">
            <PageEyebrow>Prep-Ready Packets</PageEyebrow>
            <PageEyebrow>{packets.length} Canonical</PageEyebrow>
          </div>
          <p className="m-0 max-w-[820px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.86)]">
            Writing remains in the packet files. This section is for episodes
            where the canonical packet already exists and can be opened directly
            as the prep room source of truth.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {packets.map((packet) => (
            <GlassPanel key={packet.slug} className="p-6 text-[var(--text-light)]">
              <div className="mb-4 flex flex-wrap gap-3">
                <PageEyebrow>
                  {packet.episodeNumber ? `Episode ${packet.episodeNumber}` : "Packet"}
                </PageEyebrow>
                <PageEyebrow>{formatLabel(packet.workflowStatus)}</PageEyebrow>
                <PageEyebrow>{formatLabel(packet.publicationStatus)}</PageEyebrow>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="m-0 text-[1.55rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                    {packet.title}
                  </h3>
                  <div className="mt-2 text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                    {packet.slug}
                  </div>
                </div>

                {packet.description ? (
                  <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.9)]">
                    {packet.description}
                  </p>
                ) : null}

                {packet.publicTitle || packet.publishSlug ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                    <strong className="text-[var(--text-light)]">Public mapping:</strong>{" "}
                    {packet.publicTitle || "Untitled public derivative"}
                    {packet.publishSlug ? ` (${packet.publishSlug})` : ""}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <SectionStatus label="Scott Core" value={packet.hasScottCore ? "Present" : "Missing"} />
                  <SectionStatus label="Charlie" value={packet.hasCharlieMaterial ? "Present" : "Missing"} />
                  <SectionStatus label="Research" value={packet.hasResearchNotes ? "Present" : "Missing"} />
                  <SectionStatus label="Clip Notes" value={packet.hasClipNotes ? "Present" : "Missing"} />
                  <SectionStatus label="YouTube" value={packet.hasYouTube ? "Attached" : "Not yet"} />
                  <SectionStatus label="Open Questions" value={String(packet.unresolvedQuestionCount)} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.84)]">
                  <div>
                    <strong className="text-[var(--text-light)]">Packet file:</strong>{" "}
                    <code>{packet.packetPath}</code>
                  </div>
                  {packet.confidence ? (
                    <div>
                      <strong className="text-[var(--text-light)]">Confidence:</strong>{" "}
                      {formatLabel(packet.confidence)}
                    </div>
                  ) : null}
                </div>

                <div className="pt-2">
                  <Link
                    href={`/team/show-prep/${packet.slug}`}
                    className="inline-flex items-center justify-center rounded-full border border-flare/30 bg-flare/14 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/45 hover:bg-flare/20"
                  >
                    Open Prep Room
                  </Link>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-3 flex flex-wrap gap-3">
            <PageEyebrow>Potential Episodes</PageEyebrow>
            <PageEyebrow>{candidates.length} Inventory</PageEyebrow>
          </div>
          <p className="m-0 max-w-[840px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.86)]">
            Potential episodes are inventory. Canonical packets are still the
            working source of truth. This section shows what source material
            exists in staging and inbox, whether it already has a packet, and
            what the next sensible move looks like.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {candidates.map((candidate) => (
            <GlassPanel
              key={candidate.slug}
              className={`p-6 text-[var(--text-light)] ${candidate.hasCanonicalPacket ? "opacity-[0.78]" : ""}`}
            >
              <div className="mb-4 flex flex-wrap gap-3">
                <PageEyebrow>
                  {candidate.episodeNumber ? `Episode ${candidate.episodeNumber}` : "Candidate"}
                </PageEyebrow>
                {candidate.confidence ? <PageEyebrow>{formatLabel(candidate.confidence)}</PageEyebrow> : null}
                {candidate.needsReview ? <PageEyebrow>Needs Review</PageEyebrow> : null}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-[1.45rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
                      {candidate.title}
                    </h3>
                    <div className="mt-2 text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                      {candidate.slug}
                    </div>
                  </div>

                  <RecommendedActionChip action={candidate.recommendedNextAction} />
                </div>

                {candidate.hasCanonicalPacket ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                    <strong className="text-[var(--text-light)]">Canonical packet:</strong>{" "}
                    {candidate.packetTitle || candidate.packetSlug}
                    {candidate.packetSlug ? ` (${candidate.packetSlug})` : ""}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <SectionStatus label="Staging" value={candidate.hasStaging ? "Source found" : "Missing"} />
                  <SectionStatus label="Inbox" value={candidate.hasInbox ? "Source found" : "Missing"} />
                  <SectionStatus label="Scott" value={sourceStatusLabel(candidate.scottStatus)} />
                  <SectionStatus label="Charlie" value={charlieCandidateLabel(candidate)} />
                  <SectionStatus label="Research" value={sourceStatusLabel(candidate.researchStatus)} />
                  <SectionStatus label="Extras / Drafts" value={sourceStatusLabel(candidate.extrasStatus)} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.84)]">
                  <div>
                    <strong className="text-[var(--text-light)]">Source paths:</strong>{" "}
                    {candidate.sourcePaths.length ? candidate.sourcePaths.join(" • ") : "None found"}
                  </div>
                  {candidate.manifestPath ? (
                    <div>
                      <strong className="text-[var(--text-light)]">Manifest:</strong>{" "}
                      <code>{candidate.manifestPath}</code>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Link
                    href={`/team/show-prep/candidates/${candidate.slug}`}
                    className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/35 hover:text-[var(--accent)]"
                  >
                    Review Sources
                  </Link>

                  {candidate.hasCanonicalPacket ? (
                    <Link
                      href={`/team/show-prep/${candidate.packetSlug || candidate.slug}`}
                      className="inline-flex items-center justify-center rounded-full border border-flare/30 bg-flare/14 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/45 hover:bg-flare/20"
                    >
                      Open Packet Prep Room
                    </Link>
                  ) : null}
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>
    </section>
  );
}
