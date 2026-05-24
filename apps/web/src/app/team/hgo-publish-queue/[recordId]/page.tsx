import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileJson,
  FileWarning,
  History,
  ListChecks,
  Route,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { resolveTeamAccess } from "@/lib/content-access";
import {
  createHgoEpisodePublishCandidateFileName,
  createHgoEpisodePublishCandidatePacket,
  createHgoEpisodePublishReviewBrief,
  createHgoEpisodePublishReviewBriefFileName,
} from "@/lib/hgo/publish-candidate-packet";
import {
  createHgoStagedProjectionArtifactFileName,
  validateHgoStagedProjectionArtifact,
} from "@/lib/hgo/staged-projection-artifact";
import {
  createHgoEpisodePublishDraftFileName,
  createHgoEpisodePublishDraftFrontmatterFileName,
  createHgoEpisodePublishDraftMdxFileName,
  createHgoEpisodePublishDraftPacket,
} from "@/lib/hgo/publish-draft-packet";
import { getHgoStagedArtifactForOwner } from "@/lib/server/hgo-staged-artifacts";
import ArtifactHandoffPanel from "../../hgo-staged-artifacts/ArtifactHandoffPanel";

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

function SectionBlock({
  title,
  icon,
  children,
  tone = "neutral",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "safe" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-white/10 bg-black/15 text-[rgba(245,239,230,0.82)]",
    safe: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
    warning: "border-amber-200/25 bg-amber-200/10 text-amber-50",
    danger: "border-rose-300/25 bg-rose-300/10 text-rose-50",
  };

  return (
    <section className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "safe" | "warning" | "danger" | "neutral";
}) {
  const tones = {
    safe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-200/30 bg-amber-200/10 text-amber-50",
    danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
    neutral: "border-white/10 bg-white/6 text-[rgba(245,239,230,0.78)]",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function DefinitionList({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="m-0 grid gap-3 text-sm leading-6 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
            {row.label}
          </dt>
          <dd className="m-0 mt-1 break-words text-[var(--text-light)]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function TeamHgoPublishQueueDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const access = await resolveTeamAccess();
  const ownerEmail = getOwnerEmail(access);

  if (!ownerEmail) {
    notFound();
  }

  const record = await getHgoStagedArtifactForOwner({
    ownerEmail,
    recordId: decodeURIComponent(recordId),
  });

  if (!record) {
    notFound();
  }

  const packet = createHgoEpisodePublishCandidatePacket({
    record,
    createdAt: record.updatedAt,
  });
  const parsedArtifact = validateHgoStagedProjectionArtifact(record.artifactJson);

  if (!parsedArtifact.artifact) {
    notFound();
  }

  const reviewBrief = createHgoEpisodePublishReviewBrief({
    candidate: packet,
    createdAt: record.updatedAt,
  });
  const publishDraft = createHgoEpisodePublishDraftPacket({
    artifact: parsedArtifact.artifact,
    candidate: packet,
    createdAt: record.updatedAt,
  });
  const artifactJson = JSON.stringify(record.artifactJson, null, 2);
  const artifactFileName = createHgoStagedProjectionArtifactFileName(
    parsedArtifact.artifact,
  );
  const publishCandidateJson = JSON.stringify(packet, null, 2);
  const publishCandidateFileName =
    createHgoEpisodePublishCandidateFileName(packet);
  const publishReviewBriefJson = JSON.stringify(reviewBrief, null, 2);
  const publishReviewBriefFileName =
    createHgoEpisodePublishReviewBriefFileName(reviewBrief);
  const publishDraftJson = JSON.stringify(publishDraft, null, 2);
  const publishDraftFileName = createHgoEpisodePublishDraftFileName(publishDraft);
  const publishDraftMdxFileName =
    createHgoEpisodePublishDraftMdxFileName(publishDraft);
  const publishDraftFrontmatterJson = JSON.stringify(
    publishDraft.frontmatter,
    null,
    2,
  );
  const publishDraftFrontmatterFileName =
    createHgoEpisodePublishDraftFrontmatterFileName(publishDraft);
  const isReady =
    packet.readiness.state === "ready-for-human-publish-review";

  return (
    <section className="space-y-6">
      <Link
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
        href="/team/hgo-publish-queue"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Publish Queue
      </Link>

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>HGO</PageEyebrow>
          <PageEyebrow>Publish Review Detail</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={isReady ? "safe" : "danger"}>
                {packet.readiness.state}
              </StatusPill>
              <StatusPill tone="neutral">{record.reviewStatus}</StatusPill>
              <StatusPill tone="neutral">
                {record.promotionReadiness}
              </StatusPill>
            </div>
            <h2 className="m-0 mt-4 max-w-[860px] text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              {packet.episodePage.title}
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This is the private operator view for one saved staged artifact.
              It gathers the immutable artifact, publish-candidate packet, and
              publish-review brief before any public route or content file is
              created. It can also derive a private publish-draft packet and
              render preview without writing public content.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
                href={`/team/hgo-publish-queue/${encodeURIComponent(record.recordId)}/preview`}
              >
                <Eye aria-hidden="true" className="h-4 w-4" />
                Private Render Preview
              </Link>
            </div>
          </div>

          <SectionBlock
            title="Proposed Route"
            icon={<Route aria-hidden="true" className="h-4 w-4" />}
            tone="safe"
          >
            <code className="block break-all rounded-xl bg-black/20 px-3 py-2 text-sm">
              {packet.episodePage.proposedRoute}
            </code>
          </SectionBlock>
        </div>
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          <SectionBlock
            title="Review State"
            icon={<ListChecks aria-hidden="true" className="h-4 w-4" />}
            tone={isReady ? "safe" : "danger"}
          >
            {packet.readiness.blockers.length ? (
              <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
                {packet.readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm leading-6">
                No packet blockers are present. Human review is still required
                before publishing.
              </p>
            )}
          </SectionBlock>

          {packet.readiness.warnings.length ? (
            <SectionBlock
              title="Warnings"
              icon={<FileWarning aria-hidden="true" className="h-4 w-4" />}
              tone="warning"
            >
              <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
                {packet.readiness.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}

          <SectionBlock
            title="Human Checklist"
            icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
          >
            <ul className="m-0 space-y-1 pl-5 text-sm leading-6">
              {reviewBrief.reviewState.requiredHumanActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
              <li>Confirm the proposed route does not collide with existing episode content.</li>
              <li>Review the generated private MDX draft and frontmatter exports before copying anything into staging.</li>
              <li>Record the final deploy revision and rollback revision when a future public publish happens.</li>
            </ul>
          </SectionBlock>

          <SectionBlock
            title="Proposed Files"
            icon={<FileJson aria-hidden="true" className="h-4 w-4" />}
          >
            <div className="grid gap-3">
              {[
                ...reviewBrief.proposedWork.files,
                {
                  path: publishDraft.proposedFiles.privateDraftPath,
                  purpose:
                    "Generated private MDX draft target carried in the publish-draft packet.",
                  status: "proposed-not-created" as const,
                },
              ].map((file) => (
                <div
                  className="rounded-xl border border-white/10 bg-white/6 p-3"
                  key={`${file.path}-${file.status}`}
                >
                  <code className="block break-all text-sm text-[var(--text-light)]">
                    {file.path}
                  </code>
                  <p className="m-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                    {file.purpose}
                  </p>
                  <span className="mt-2 inline-flex rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.72)]">
                    {file.status}
                  </span>
                </div>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock
            title="Validation Commands"
            icon={<Terminal aria-hidden="true" className="h-4 w-4" />}
          >
            <div className="grid gap-2">
              {reviewBrief.proposedWork.validationCommands.map((command) => (
                <code
                  className="block overflow-x-auto rounded-xl bg-black/25 px-3 py-2 text-sm text-[var(--text-light)]"
                  key={command}
                >
                  {command}
                </code>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock
            title="Draft Packet"
            icon={<FileJson aria-hidden="true" className="h-4 w-4" />}
            tone="warning"
          >
            <p className="m-0 text-sm leading-6">
              The generated draft packet includes a private MDX draft body and
              proposed frontmatter. It is review material only and does not
              write files or publish the proposed route.
            </p>
            <DefinitionList
              rows={[
                {
                  label: "Draft file",
                  value: <code>{publishDraft.proposedFiles.privateDraftPath}</code>,
                },
                {
                  label: "Deferred public file",
                  value: <code>{publishDraft.proposedFiles.deferredPublicPath}</code>,
                },
                {
                  label: "Citation review",
                  value: publishDraft.frontmatter.citationReview,
                },
                {
                  label: "Public safety",
                  value: publishDraft.frontmatter.publicSafetyReview,
                },
                {
                  label: "MDX export",
                  value: <code>{publishDraftMdxFileName}</code>,
                },
                {
                  label: "Frontmatter export",
                  value: <code>{publishDraftFrontmatterFileName}</code>,
                },
              ]}
            />
          </SectionBlock>
        </div>

        <aside className="space-y-4">
          <SectionBlock
            title="Artifact Identity"
            icon={<FileJson aria-hidden="true" className="h-4 w-4" />}
          >
            <DefinitionList
              rows={[
                { label: "Record", value: <code>{record.recordId}</code> },
                { label: "Artifact", value: <code>{record.artifactId}</code> },
                { label: "Hash", value: <code>{record.artifactHash}</code> },
                { label: "Projection", value: <code>{record.projectionId}</code> },
                { label: "Updated", value: formatDateTime(record.updatedAt) },
                { label: "Reviewed", value: formatDateTime(record.reviewedAt) },
              ]}
            />
          </SectionBlock>

          <SectionBlock
            title="Safety Flags"
            icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
            tone="safe"
          >
            <DefinitionList
              rows={[
                {
                  label: "Creates public route",
                  value: reviewBrief.safety.createsPublicRoute ? "yes" : "no",
                },
                {
                  label: "Mutates database",
                  value: reviewBrief.safety.mutatesDatabase ? "yes" : "no",
                },
                {
                  label: "Calls providers",
                  value: reviewBrief.safety.callsProviders ? "yes" : "no",
                },
                {
                  label: "Publishes live page",
                  value: publishDraft.safety.publishesLivePage ? "yes" : "no",
                },
                {
                  label: "Mutates artifact",
                  value: publishDraft.safety.mutatesStagedArtifact ? "yes" : "no",
                },
                {
                  label: "Writes content files",
                  value: publishDraft.safety.writesContentFiles ? "yes" : "no",
                },
              ]}
            />
          </SectionBlock>

          <SectionBlock
            title="Rollback Posture"
            icon={<History aria-hidden="true" className="h-4 w-4" />}
            tone="warning"
          >
            <p className="m-0 text-sm leading-6">
              {reviewBrief.rollback.currentPacketRollback}
            </p>
            <ul className="m-0 mt-3 space-y-1 pl-5 text-sm leading-6">
              {reviewBrief.rollback.futurePublishRollback.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </SectionBlock>

          {record.archivedAt ? (
            <SectionBlock
              title="Archived"
              icon={<TriangleAlert aria-hidden="true" className="h-4 w-4" />}
              tone="danger"
            >
              <p className="m-0 text-sm leading-6">
                Archived at {formatDateTime(record.archivedAt)}. Treat this as
                reference material unless it is restored through the staged
                artifact workflow.
              </p>
            </SectionBlock>
          ) : null}
        </aside>
      </div>

      <ArtifactHandoffPanel
        artifactFileName={artifactFileName}
        artifactJson={artifactJson}
        artifactTitle={packet.episodePage.slug}
        publishCandidateFileName={publishCandidateFileName}
        publishCandidateJson={publishCandidateJson}
        publishReviewBriefFileName={publishReviewBriefFileName}
        publishReviewBriefJson={publishReviewBriefJson}
        publishDraftFileName={publishDraftFileName}
        publishDraftJson={publishDraftJson}
        publishDraftMdxFileName={publishDraftMdxFileName}
        publishDraftMdx={publishDraft.mdxDraft}
        publishDraftFrontmatterFileName={publishDraftFrontmatterFileName}
        publishDraftFrontmatterJson={publishDraftFrontmatterJson}
      />
    </section>
  );
}
