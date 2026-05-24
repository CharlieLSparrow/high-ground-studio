import {
  Archive,
  CheckCircle2,
  FileJson,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { resolveTeamAccess } from "@/lib/content-access";
import {
  createHgoEpisodePublishCandidateFileName,
  createHgoEpisodePublishCandidatePacket,
} from "@/lib/hgo/publish-candidate-packet";
import { createHgoStagedProjectionArtifactFileName } from "@/lib/hgo/staged-projection-artifact";
import {
  listHgoStagedArtifactsForOwner,
  type HgoStagedArtifactRecordDto,
} from "@/lib/server/hgo-staged-artifacts";
import ArtifactHandoffPanel from "./ArtifactHandoffPanel";
import { markHgoStagedArtifactReviewAction } from "./actions";

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

function statusTone(record: HgoStagedArtifactRecordDto) {
  if (record.archivedAt || record.promotionReadiness === "archived") {
    return "border-zinc-300/20 bg-zinc-300/8 text-zinc-100";
  }

  if (record.promotionReadiness === "candidate") {
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  }

  if (record.promotionReadiness === "blocked") {
    return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  }

  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
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

function ReviewActionForm({
  recordId,
  reviewStatus,
  label,
  icon,
  tone,
}: {
  recordId: string;
  reviewStatus: string;
  label: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <form action={markHgoStagedArtifactReviewAction}>
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="reviewStatus" value={reviewStatus} />
      <button
        type="submit"
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${tone}`}
      >
        {icon}
        {label}
      </button>
    </form>
  );
}

function ArtifactCard({ record }: { record: HgoStagedArtifactRecordDto }) {
  const isArchived = Boolean(record.archivedAt);
  const publishCandidatePacket = createHgoEpisodePublishCandidatePacket({
    record,
    createdAt: record.updatedAt,
  });
  const publishCandidateJson = JSON.stringify(publishCandidatePacket, null, 2);
  const publishCandidateFileName = createHgoEpisodePublishCandidateFileName(
    publishCandidatePacket,
  );
  const artifactJson = JSON.stringify(record.artifactJson, null, 2);
  const artifactFileName = createHgoStagedProjectionArtifactFileName(
    record.artifactJson as Parameters<
      typeof createHgoStagedProjectionArtifactFileName
    >[0],
  );

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/8 p-5 text-[var(--text-light)] shadow-glass">
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(record)}`}>
          {record.promotionReadiness}
        </span>
        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.78)]">
          {record.reviewStatus}
        </span>
        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.78)]">
          {record.projectionStatus} / {record.projectionVisibility}
        </span>
      </div>

      <h3 className="m-0 mt-4 text-[1.45rem] leading-tight text-[var(--text-light)]">
        {record.projectionTitle}
      </h3>

      <p className="mb-0 mt-2 break-all font-mono text-xs text-[rgba(245,239,230,0.66)]">
        {record.recordId}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3">
          <div className="text-xs font-semibold uppercase text-rose-100">
            Blockers
          </div>
          <div className="mt-1 text-2xl font-semibold">{record.blockerCount}</div>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
          <div className="text-xs font-semibold uppercase text-amber-100">
            Warnings
          </div>
          <div className="mt-1 text-2xl font-semibold">{record.warningCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="text-xs font-semibold uppercase text-[rgba(245,239,230,0.62)]">
            Slug
          </div>
          <div className="mt-1 break-all text-sm font-semibold">
            {record.projectionSlug}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="text-xs font-semibold uppercase text-[rgba(245,239,230,0.62)]">
            Saved
          </div>
          <div className="mt-1 text-sm font-semibold">
            {formatDateTime(record.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
        <div>
          <strong className="text-[rgba(245,239,230,0.94)]">Hash:</strong>{" "}
          <code>{record.artifactHash}</code>
        </div>
        <div>
          <strong className="text-[rgba(245,239,230,0.94)]">Next action:</strong>{" "}
          {record.recommendedNextAction}
        </div>
        <div>
          <strong className="text-[rgba(245,239,230,0.94)]">Real content:</strong>{" "}
          {record.containsRealContent}
        </div>
        <div>
          <strong className="text-[rgba(245,239,230,0.94)]">Review events:</strong>{" "}
          {record.eventCount}
        </div>
        <div>
          <strong className="text-[rgba(245,239,230,0.94)]">Last reviewed:</strong>{" "}
          {formatDateTime(record.reviewedAt)}
          {record.reviewedByEmail ? ` by ${record.reviewedByEmail}` : ""}
        </div>
      {record.note ? (
          <div>
            <strong className="text-[rgba(245,239,230,0.94)]">Note:</strong>{" "}
            {record.note}
          </div>
        ) : null}
      </div>

      <ArtifactHandoffPanel
        artifactFileName={artifactFileName}
        artifactJson={artifactJson}
        artifactTitle={record.projectionSlug}
        publishCandidateFileName={publishCandidateFileName}
        publishCandidateJson={publishCandidateJson}
      />

      <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-100/75">
              Episode page handoff
            </div>
            <h4 className="m-0 mt-1 text-lg leading-tight text-emerald-50">
              Publish-candidate packet
            </h4>
          </div>
          <span className="rounded-full border border-emerald-200/25 bg-black/20 px-3 py-1 font-mono text-xs text-emerald-50">
            {publishCandidatePacket.readiness.state}
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-100/70">
              Proposed route
            </div>
            <code className="mt-1 block break-all rounded-xl bg-black/20 px-3 py-2 text-emerald-50">
              {publishCandidatePacket.episodePage.proposedRoute}
            </code>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-100/70">
              Packet file
            </div>
            <code className="mt-1 block break-all rounded-xl bg-black/20 px-3 py-2 text-emerald-50">
              {publishCandidateFileName}
            </code>
          </div>
        </div>

        {publishCandidatePacket.readiness.blockers.length ? (
          <div className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/10 p-3 text-rose-50">
            <div className="text-xs font-semibold uppercase">Blockers</div>
            <ul className="m-0 mt-2 space-y-1 pl-5">
              {publishCandidatePacket.readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-emerald-200/25 bg-black/15 p-3">
            Ready for human publish review. This still does not create a public
            route, call providers, certify source review, or mutate stored
            artifact JSON.
          </div>
        )}

        {publishCandidatePacket.readiness.warnings.length ? (
          <div className="mt-3 rounded-xl border border-amber-200/25 bg-amber-200/10 p-3 text-amber-50">
            <div className="text-xs font-semibold uppercase">Warnings</div>
            <ul className="m-0 mt-2 space-y-1 pl-5">
              {publishCandidatePacket.readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            View private packet JSON
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/25 p-3 text-xs leading-5 text-emerald-50">
            {publishCandidateJson}
          </pre>
        </details>
      </div>

      {!isArchived ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <ReviewActionForm
            recordId={record.recordId}
            reviewStatus="needs-fixes"
            label="Needs fixes"
            icon={<Wrench aria-hidden="true" className="h-4 w-4" />}
            tone="border-rose-200/25 bg-rose-300/12 text-rose-50 hover:bg-rose-300/18"
          />
          <ReviewActionForm
            recordId={record.recordId}
            reviewStatus="human-review"
            label="Human review"
            icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
            tone="border-amber-200/25 bg-amber-300/12 text-amber-50 hover:bg-amber-300/18"
          />
          <ReviewActionForm
            recordId={record.recordId}
            reviewStatus="approved-for-future-staging"
            label="Stage candidate"
            icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            tone="border-emerald-200/25 bg-emerald-300/12 text-emerald-50 hover:bg-emerald-300/18"
          />
          <ReviewActionForm
            recordId={record.recordId}
            reviewStatus="archived"
            label="Archive"
            icon={<Archive aria-hidden="true" className="h-4 w-4" />}
            tone="border-white/10 bg-black/20 text-[rgba(245,239,230,0.82)] hover:bg-white/10"
          />
        </div>
      ) : null}
    </article>
  );
}

export default async function TeamHgoStagedArtifactsPage() {
  const access = await resolveTeamAccess();
  const ownerEmail = getOwnerEmail(access);
  const records = ownerEmail
    ? await listHgoStagedArtifactsForOwner({
        ownerEmail,
        includeArchived: true,
        take: 50,
      })
    : [];
  const activeRecords = records.filter((record) => !record.archivedAt);
  const blocked = records.filter(
    (record) => record.promotionReadiness === "blocked",
  ).length;
  const candidates = records.filter(
    (record) => record.promotionReadiness === "candidate",
  ).length;

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>HGO</PageEyebrow>
          <PageEyebrow>Private Staged Artifacts</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
          <div>
            <h2 className="m-0 max-w-[820px] text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              Saved staged review packets
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This is the private holding area for HGO staged artifacts saved
              from `/projection-stage/import`. Saving here does not publish a
              page, create an episode route, call providers, or certify source
              review.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">
            Embedded browser artifacts remain immutable review packets. Server
            persistence metadata lives outside the packet so public promotion can
            stay a separate workflow.
          </div>
        </div>
      </GlassPanel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saved"
          value={records.length}
          icon={<FileJson aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Active"
          value={activeRecords.length}
          icon={<ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Blocked"
          value={blocked}
          icon={<TriangleAlert aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
        <StatCard
          label="Candidates"
          value={candidates}
          icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}
        />
      </section>

      {records.length ? (
        <section className="grid gap-4">
          {records.map((record) => (
            <ArtifactCard key={record.id} record={record} />
          ))}
        </section>
      ) : (
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="flex items-start gap-4">
            <Archive
              aria-hidden="true"
              className="mt-1 h-5 w-5 text-[var(--accent)]"
            />
            <div>
              <h3 className="m-0 text-xl leading-tight">
                No staged artifacts saved yet
              </h3>
              <p className="mb-0 mt-3 max-w-[760px] text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                Paste a Content Studio production packet or HGO projection JSON
                into `/projection-stage/import`, generate the staged artifact,
                then save it as a private review artifact.
              </p>
            </div>
          </div>
        </GlassPanel>
      )}
    </section>
  );
}
