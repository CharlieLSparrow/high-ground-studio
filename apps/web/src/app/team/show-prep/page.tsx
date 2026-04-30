import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { getShowPrepPackets } from "@/lib/server/show-prep";

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

export default async function ShowPrepIndexPage() {
  const packets = await getShowPrepPackets();

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap gap-3">
          <PageEyebrow>Show Prep</PageEyebrow>
          <PageEyebrow>{packets.length} Episodes</PageEyebrow>
        </div>

        <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
          Read-only cockpit over the episode packets
        </h2>

        <p className="mb-0 mt-4 max-w-[820px] text-[1rem] leading-7 text-[rgba(245,239,230,0.9)]">
          Writing remains in the packet files. This page is a prep dashboard
          over the source material so Homer and Charlie can review Scott core,
          Charlie material, research options, clip notes, and provenance without
          touching the public site.
        </p>
      </GlassPanel>

      <div className="grid gap-6 xl:grid-cols-2">
        {packets.map((packet) => (
          <GlassPanel key={packet.slug} className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap gap-3">
              <PageEyebrow>{packet.episodeNumber ? `Episode ${packet.episodeNumber}` : "Packet"}</PageEyebrow>
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
                <SectionStatus
                  label="Scott Core"
                  value={packet.hasScottCore ? "Present" : "Missing"}
                />
                <SectionStatus
                  label="Charlie"
                  value={packet.hasCharlieMaterial ? "Present" : "Missing"}
                />
                <SectionStatus
                  label="Research"
                  value={packet.hasResearchNotes ? "Present" : "Missing"}
                />
                <SectionStatus
                  label="Clip Notes"
                  value={packet.hasClipNotes ? "Present" : "Missing"}
                />
                <SectionStatus
                  label="YouTube"
                  value={packet.hasYouTube ? "Attached" : "Not yet"}
                />
                <SectionStatus
                  label="Open Questions"
                  value={String(packet.unresolvedQuestionCount)}
                />
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
    </section>
  );
}
