import Link from "next/link";
import type { ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Route,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { resolveTeamAccess } from "@/lib/content-access";
import {
  createHgoEpisodePublishCandidateFileName,
  createHgoEpisodePublishQueue,
  type HgoEpisodePublishQueueItem,
} from "@/lib/hgo/publish-candidate-packet";
import { createHgoStagedProjectionArtifactFileName } from "@/lib/hgo/staged-projection-artifact";
import {
  listHgoStagedArtifactsForOwner,
  type HgoStagedArtifactRecordDto,
} from "@/lib/server/hgo-staged-artifacts";
import ArtifactHandoffPanel from "../hgo-staged-artifacts/ArtifactHandoffPanel";

function getOwnerEmail(access: Awaited<ReturnType<typeof resolveTeamAccess>>) {
  return (
    access.session?.user?.primaryEmail?.trim().toLowerCase() ||
    access.email?.trim().toLowerCase() ||
    ""
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.66)]">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold text-[var(--text-light)]">
        {value}
      </div>
    </div>
  );
}

function readinessTone(item: HgoEpisodePublishQueueItem<HgoStagedArtifactRecordDto>) {
  if (item.record.archivedAt || item.record.reviewStatus === "archived") {
    return "border-zinc-300/20 bg-zinc-300/8 text-zinc-100";
  }

  if (item.packet.readiness.state === "ready-for-human-publish-review") {
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  }

  return "border-rose-300/30 bg-rose-300/10 text-rose-100";
}

function QueueCard({
  item,
}: {
  item: HgoEpisodePublishQueueItem<HgoStagedArtifactRecordDto>;
}) {
  const { packet, record } = item;
  const publishCandidateJson = JSON.stringify(packet, null, 2);
  const publishCandidateFileName =
    createHgoEpisodePublishCandidateFileName(packet);
  const artifactJson = JSON.stringify(record.artifactJson, null, 2);
  const artifactFileName = createHgoStagedProjectionArtifactFileName(
    record.artifactJson as Parameters<
      typeof createHgoStagedProjectionArtifactFileName
    >[0],
  );

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/8 p-5 text-[var(--text-light)] shadow-glass">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${readinessTone(item)}`}>
              {packet.readiness.state}
            </span>
            <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.78)]">
              {record.reviewStatus}
            </span>
          </div>
          <h3 className="m-0 mt-4 text-[1.45rem] leading-tight text-[var(--text-light)]">
            {packet.episodePage.title}
          </h3>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-[rgba(245,239,230,0.8)]">
          <div className="text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
            Updated
          </div>
          <div className="mt-1 font-semibold text-[var(--text-light)]">
            {formatDateTime(record.updatedAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-emerald-100/75">
            <Route aria-hidden="true" className="h-4 w-4" />
            Proposed route
          </div>
          <code className="block break-all rounded-xl bg-black/20 px-3 py-2 text-sm text-emerald-50">
            {packet.episodePage.proposedRoute}
          </code>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
            Artifact source
          </div>
          <div className="grid gap-1 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
            <span>
              Record: <code>{record.recordId}</code>
            </span>
            <span>
              Hash: <code>{record.artifactHash}</code>
            </span>
            <span>
              Reviewed: {formatDateTime(record.reviewedAt)}
              {record.reviewedByEmail ? ` by ${record.reviewedByEmail}` : ""}
            </span>
          </div>
        </div>
      </div>

      {packet.readiness.blockers.length ? (
        <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-300/10 p-4 text-rose-50">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
            <TriangleAlert aria-hidden="true" className="h-4 w-4" />
            Blockers
          </div>
          <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
            {packet.readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {packet.readiness.warnings.length ? (
        <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 text-amber-50">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
            <FileWarning aria-hidden="true" className="h-4 w-4" />
            Warnings
          </div>
          <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
            {packet.readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
        <div className="mb-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
          Human review steps
        </div>
        <ul className="m-0 space-y-1 pl-5">
          {packet.readiness.requiredHumanActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
        <div className="mb-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
          Rollback posture
        </div>
        <div>
          Artifact rollback:{" "}
          <code>{packet.rollback.artifactRollback}</code>
        </div>
        <div>
          Public rollback required:{" "}
          <strong>{packet.rollback.publicRollbackRequired ? "yes" : "no"}</strong>
        </div>
      </div>

      <ArtifactHandoffPanel
        artifactFileName={artifactFileName}
        artifactJson={artifactJson}
        artifactTitle={packet.episodePage.slug}
        publishCandidateFileName={publishCandidateFileName}
        publishCandidateJson={publishCandidateJson}
      />
    </article>
  );
}

function QueueSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: HgoEpisodePublishQueueItem<HgoStagedArtifactRecordDto>[];
  empty: string;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl leading-tight text-[var(--text-light)]">
          {title}
        </h2>
        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm font-semibold text-[rgba(245,239,230,0.78)]">
          {items.length}
        </span>
      </div>
      {items.length ? (
        items.map((item) => (
          <QueueCard key={item.record.recordId} item={item} />
        ))
      ) : (
        <GlassPanel className="p-5 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
          {empty}
        </GlassPanel>
      )}
    </section>
  );
}

export default async function TeamHgoPublishQueuePage() {
  const access = await resolveTeamAccess();
  const ownerEmail = getOwnerEmail(access);
  const records = ownerEmail
    ? await listHgoStagedArtifactsForOwner({
        ownerEmail,
        includeArchived: true,
        take: 50,
      })
    : [];
  const queue = createHgoEpisodePublishQueue(records);

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>HGO</PageEyebrow>
          <PageEyebrow>Episode Publish Queue</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
          <div>
            <h2 className="m-0 max-w-[820px] text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              Episode publish candidates
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              A private queue for saved HGO staged artifacts that are moving
              toward episode-page review. The queue keeps proposed routes,
              blockers, human review steps, and rollback posture together.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200/20 bg-emerald-200/10 p-4 text-sm leading-6 text-emerald-50">
            Queue packets are planning artifacts only. They do not create
            public routes, mutate content files, call providers, certify source
            review, or replace `/episodes`.
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
            href="/team/hgo-staged-artifacts"
          >
            Staged Artifacts
          </Link>
          <Link
            className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
            href="/projection-stage/import"
          >
            HGO Import
          </Link>
        </div>
      </GlassPanel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Saved"
          value={queue.totals.all}
          icon={<ClipboardList aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Ready"
          value={queue.totals.ready}
          icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Not Ready"
          value={queue.totals.notReady}
          icon={<TriangleAlert aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Warnings"
          value={queue.totals.warnings}
          icon={<FileWarning aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Archived"
          value={queue.totals.archived}
          icon={<Archive aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
      </section>

      <QueueSection
        title="Ready for human publish review"
        items={queue.ready}
        empty="No saved artifacts are ready for human publish review."
      />

      <QueueSection
        title="Needs more work"
        items={queue.notReady}
        empty="No active artifacts are blocked from publish review."
      />

      <QueueSection
        title="Archived"
        items={queue.archived}
        empty="No archived staged artifacts are in this queue."
      />

      <GlassPanel className="p-5 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
        <div className="flex items-start gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 flex-none text-[var(--accent)]"
          />
          <p className="m-0">
            Public publishing remains a separate later step with an explicit
            route diff, content rollback path, source review, and deploy record.
          </p>
        </div>
      </GlassPanel>
    </section>
  );
}
