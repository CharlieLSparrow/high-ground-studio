"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";

type PacketView = {
  title: string;
  slug: string;
  episodeNumber: number | null;
  workflowStatus: string;
  publicationStatus: string;
  publicTitle: string;
  publishSlug: string;
  description: string;
  confidence: string;
  packetPath: string;
  hasScottCore: boolean;
  hasCharlieMaterial: boolean;
  hasResearchNotes: boolean;
  hasClipNotes: boolean;
  hasYouTube: boolean;
  unresolvedQuestionCount: number;
};

type SourceStatus = "missing" | "empty" | "present";

type CandidateView = {
  slug: string;
  title: string;
  episodeNumber: number | null;
  stagingPath: string | null;
  inboxPath: string | null;
  manifestPath: string | null;
  packetSlug: string | null;
  hasCanonicalPacket: boolean;
  packetTitle: string;
  confidence: string;
  needsReview: boolean | null;
  scottStatus: SourceStatus;
  charlieStatus: SourceStatus;
  researchStatus: SourceStatus;
  extrasStatus: SourceStatus;
  hasStaging: boolean;
  hasInbox: boolean;
  hasScottSource: boolean;
  hasCharlieContent: boolean;
  hasResearch: boolean;
  hasExtras: boolean;
  recommendedNextAction:
    | "Already packeted"
    | "Create canonical packet"
    | "Review source material"
    | "Needs source cleanup";
  sourcePaths: string[];
};

type PrepStateFilter =
  | "prep-ready-packets"
  | "potential-episodes"
  | "needs-packet"
  | "already-packeted";

type SourceAvailabilityFilter =
  | "has-scott"
  | "missing-scott"
  | "has-charlie"
  | "missing-charlie"
  | "has-research"
  | "has-clip-or-extras";

type RecommendedActionFilter = CandidateView["recommendedNextAction"];

const PREP_STATE_OPTIONS: Array<{ value: PrepStateFilter; label: string }> = [
  { value: "prep-ready-packets", label: "Prep-ready packets" },
  { value: "potential-episodes", label: "Potential episodes" },
  { value: "needs-packet", label: "Needs packet" },
  { value: "already-packeted", label: "Already packeted" },
];

const SOURCE_OPTIONS: Array<{
  value: SourceAvailabilityFilter;
  label: string;
}> = [
  { value: "has-scott", label: "Has Scott source/core" },
  { value: "missing-scott", label: "Missing Scott source/core" },
  { value: "has-charlie", label: "Has Charlie material" },
  { value: "missing-charlie", label: "Missing Charlie material" },
  { value: "has-research", label: "Has research" },
  { value: "has-clip-or-extras", label: "Has clip notes / extras" },
];

const RECOMMENDED_ACTION_OPTIONS: Array<{
  value: RecommendedActionFilter;
  label: string;
}> = [
  { value: "Create canonical packet", label: "Create canonical packet" },
  { value: "Review source material", label: "Review source material" },
  { value: "Needs source cleanup", label: "Needs source cleanup" },
  { value: "Already packeted", label: "Already packeted" },
];

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function sourceStatusLabel(status: SourceStatus) {
  switch (status) {
    case "present":
      return "Source found";
    case "empty":
      return "Empty";
    default:
      return "Missing";
  }
}

function charlieCandidateLabel(candidate: CandidateView) {
  if (candidate.hasCharlieContent) {
    return "Real content";
  }

  if (candidate.charlieStatus === "present") {
    return "Source found only";
  }

  return sourceStatusLabel(candidate.charlieStatus);
}

function toggleValue<T extends string>(items: T[], value: T) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

function SectionStatus({ label, value }: { label: string; value: string }) {
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

function RecommendedActionChip({
  action,
}: {
  action: CandidateView["recommendedNextAction"];
}) {
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

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6 text-[rgba(245,239,230,0.9)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-flare"
      />
      <span>{label}</span>
    </label>
  );
}

function filterPackets(
  packets: PacketView[],
  search: string,
  prepStates: PrepStateFilter[],
  sourceFilters: SourceAvailabilityFilter[],
  recommendedActions: RecommendedActionFilter[],
) {
  return packets.filter((packet) => {
    const packetSearchBase = [
      packet.title,
      packet.slug,
      packet.episodeNumber !== null ? String(packet.episodeNumber) : "",
    ]
      .join(" ")
      .toLowerCase();

    if (search && !packetSearchBase.includes(search)) {
      return false;
    }

    if (prepStates.length > 0) {
      const tags: PrepStateFilter[] = ["prep-ready-packets", "already-packeted"];
      if (!prepStates.some((filter) => tags.includes(filter))) {
        return false;
      }
    }

    if (recommendedActions.length > 0 && !recommendedActions.includes("Already packeted")) {
      return false;
    }

    for (const filter of sourceFilters) {
      if (filter === "has-scott" && !packet.hasScottCore) return false;
      if (filter === "missing-scott" && packet.hasScottCore) return false;
      if (filter === "has-charlie" && !packet.hasCharlieMaterial) return false;
      if (filter === "missing-charlie" && packet.hasCharlieMaterial) return false;
      if (filter === "has-research" && !packet.hasResearchNotes) return false;
      if (filter === "has-clip-or-extras" && !packet.hasClipNotes) return false;
    }

    return true;
  });
}

function filterCandidates(
  candidates: CandidateView[],
  search: string,
  prepStates: PrepStateFilter[],
  sourceFilters: SourceAvailabilityFilter[],
  recommendedActions: RecommendedActionFilter[],
) {
  return candidates.filter((candidate) => {
    const candidateSearchBase = [
      candidate.title,
      candidate.slug,
      candidate.episodeNumber !== null ? String(candidate.episodeNumber) : "",
    ]
      .join(" ")
      .toLowerCase();

    if (search && !candidateSearchBase.includes(search)) {
      return false;
    }

    if (prepStates.length > 0) {
      const tags: PrepStateFilter[] = [
        "potential-episodes",
        candidate.hasCanonicalPacket ? "already-packeted" : "needs-packet",
      ];
      if (!prepStates.some((filter) => tags.includes(filter))) {
        return false;
      }
    }

    if (
      recommendedActions.length > 0 &&
      !recommendedActions.includes(candidate.recommendedNextAction)
    ) {
      return false;
    }

    for (const filter of sourceFilters) {
      if (filter === "has-scott" && !candidate.hasScottSource) return false;
      if (filter === "missing-scott" && candidate.hasScottSource) return false;
      if (filter === "has-charlie" && !candidate.hasCharlieContent) return false;
      if (filter === "missing-charlie" && candidate.hasCharlieContent) return false;
      if (filter === "has-research" && !candidate.hasResearch) return false;
      if (filter === "has-clip-or-extras" && !candidate.hasExtras) return false;
    }

    return true;
  });
}

export default function ShowPrepFiltersClient({
  packets,
  candidates,
}: {
  packets: PacketView[];
  candidates: CandidateView[];
}) {
  const [search, setSearch] = useState("");
  const [prepStates, setPrepStates] = useState<PrepStateFilter[]>([]);
  const [sourceFilters, setSourceFilters] = useState<SourceAvailabilityFilter[]>([]);
  const [recommendedActions, setRecommendedActions] = useState<
    RecommendedActionFilter[]
  >([]);

  const normalizedSearch = normalizeSearch(search);

  // Why client-side filtering here:
  // This is an internal cockpit over already-loaded inventory, not a giant
  // public catalog. Client-side filtering keeps the interaction immediate
  // without promoting filter state into routing or a database before the tool
  // has earned that complexity.
  const visiblePackets = useMemo(
    () =>
      filterPackets(
        packets,
        normalizedSearch,
        prepStates,
        sourceFilters,
        recommendedActions,
      ),
    [packets, normalizedSearch, prepStates, sourceFilters, recommendedActions],
  );

  const visibleCandidates = useMemo(
    () =>
      filterCandidates(
        candidates,
        normalizedSearch,
        prepStates,
        sourceFilters,
        recommendedActions,
      ),
    [candidates, normalizedSearch, prepStates, sourceFilters, recommendedActions],
  );

  const totalVisible = visiblePackets.length + visibleCandidates.length;
  const totalAvailable = packets.length + candidates.length;
  const hasActiveFilters =
    Boolean(search.trim()) ||
    prepStates.length > 0 ||
    sourceFilters.length > 0 ||
    recommendedActions.length > 0;

  function clearFilters() {
    setSearch("");
    setPrepStates([]);
    setSourceFilters([]);
    setRecommendedActions([]);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
      <aside className="xl:self-start">
        <GlassPanel className="text-[var(--text-light)] xl:sticky xl:top-32 xl:flex xl:h-[calc(100vh-10rem)] xl:flex-col xl:overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <div className="mb-4 flex flex-wrap gap-3">
              <PageEyebrow>Filter Panel</PageEyebrow>
              <PageEyebrow>{totalVisible} Showing</PageEyebrow>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="show-prep-search"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]"
                >
                  Search
                </label>
                <input
                  id="show-prep-search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Title, slug, or episode number"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-[var(--text-light)] placeholder:text-[rgba(245,239,230,0.45)] outline-none transition focus:border-flare/40"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.88)]">
                <div>
                  <strong className="text-[var(--text-light)]">Results:</strong> {totalVisible} of {totalAvailable}
                </div>
                <div>
                  <strong className="text-[var(--text-light)]">Packets:</strong> {visiblePackets.length} of {packets.length}
                </div>
                <div>
                  <strong className="text-[var(--text-light)]">Candidates:</strong> {visibleCandidates.length} of {candidates.length}
                </div>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-flare/35 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear filters
              </button>
            </div>
          </div>

          <div className="p-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <div className="space-y-5">
              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Prep State
                </div>
                <div className="space-y-3">
                  {PREP_STATE_OPTIONS.map((option) => (
                    <FilterCheckbox
                      key={option.value}
                      label={option.label}
                      checked={prepStates.includes(option.value)}
                      onChange={() =>
                        setPrepStates((current) => toggleValue(current, option.value))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Source Availability
                </div>
                <div className="space-y-3">
                  {SOURCE_OPTIONS.map((option) => (
                    <FilterCheckbox
                      key={option.value}
                      label={option.label}
                      checked={sourceFilters.includes(option.value)}
                      onChange={() =>
                        setSourceFilters((current) => toggleValue(current, option.value))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                  Recommended Action
                </div>
                <div className="space-y-3">
                  {RECOMMENDED_ACTION_OPTIONS.map((option) => (
                    <FilterCheckbox
                      key={option.value}
                      label={option.label}
                      checked={recommendedActions.includes(option.value)}
                      onChange={() =>
                        setRecommendedActions((current) =>
                          toggleValue(current, option.value)
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>
      </aside>

      <div className="space-y-8">
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
              <PageEyebrow>{visiblePackets.length} Showing</PageEyebrow>
              <PageEyebrow>{packets.length} Total</PageEyebrow>
            </div>
            <p className="m-0 max-w-[820px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.86)]">
              Writing remains in the packet files. This section is for episodes
              where the canonical packet already exists and can be opened directly
              as the prep room source of truth.
            </p>
          </div>

          {visiblePackets.length ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {visiblePackets.map((packet) => (
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
          ) : (
            <GlassPanel className="p-5 text-[var(--text-light)]">
              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                No prep-ready packets match the current filters.
              </p>
            </GlassPanel>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-3 flex flex-wrap gap-3">
              <PageEyebrow>Potential Episodes</PageEyebrow>
              <PageEyebrow>{visibleCandidates.length} Showing</PageEyebrow>
              <PageEyebrow>{candidates.length} Total</PageEyebrow>
            </div>
            <p className="m-0 max-w-[840px] text-[0.98rem] leading-7 text-[rgba(245,239,230,0.86)]">
              Potential episodes are inventory. Canonical packets are still the
              working source of truth. This section shows what source material
              exists in staging and inbox, whether it already has a packet, and
              what the next sensible move looks like.
            </p>
          </div>

          {visibleCandidates.length ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {visibleCandidates.map((candidate) => (
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
          ) : (
            <GlassPanel className="p-5 text-[var(--text-light)]">
              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                No potential episodes match the current filters.
              </p>
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
