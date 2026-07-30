import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import {
  PROGRAM_DECISION_KINDS,
  PROGRAM_EDIT_VERSION,
  type EditActorType,
  type EpisodeEditDeskPayload,
  type ProgramDecision,
  type ProgramDecisionKind,
  type ProgramEditSource,
  type ProgramEditState,
  type EpisodeWatchDerivative,
  sourceIDsForDecision,
} from "@/lib/editor/program-edit-contract";

export type EditActor = {
  userId?: string;
  email?: string;
  label?: string;
  type: EditActorType;
};

export class EpisodeEditConflict extends Error {
  constructor(public readonly currentRevision: number) {
    super("The shared edit changed before this operation could be saved.");
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function optionalNumberValue(value: unknown): number | undefined {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && !value.trim())
  ) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function webUrl(...values: unknown[]): string | undefined {
  const value = textValue(...values);
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "note";
}

function sourceRole(label: string): ProgramEditSource["role"] {
  const lower = label.toLowerCase();
  if (lower.includes("charlie")) return "primary";
  if (lower.includes("homer") || lower.includes("scott")) return "secondary";
  if (lower.includes("clip") || lower.includes("watch") || lower.includes("reference")) return "clip";
  if (lower.includes("audio") || lower.includes("spine")) return "audio";
  return "reference";
}

function normalizeSources(timelineJson: unknown, productionJson: unknown): ProgramEditSource[] {
  const root = record(timelineJson);
  const sequence = Array.isArray(root.sequences) ? record(root.sequences[0]) : root;
  const production = record(productionJson);
  const candidates = [sequence.sources, sequence.lanes, sequence.videoLanes, production.sources, production.importedMedia];
  const rows = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!rows) return [];

  const seen = new Set<string>();
  return rows.flatMap((row, index) => {
    const lane = record(row);
    const media = record(lane.sourceVideo ?? lane.media ?? lane.asset ?? lane.source);
    const metadata = record(lane.metadata);
    const id = textValue(lane.id, media.id, lane.assetId, `source-${index}`) ?? `source-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const label = textValue(lane.label, lane.name, lane.title, media.label, media.name, media.filename, `Source ${index + 1}`) ?? `Source ${index + 1}`;
    const proxyUrl = webUrl(media.proxyURL, media.proxyUrl, lane.proxyURL, lane.proxyUrl, media.playbackUrl);
    const playbackUrl = proxyUrl ?? webUrl(media.url, media.remoteUrl, lane.url, lane.playbackUrl);
    return [{
      id,
      label,
      role: textValue(metadata.mediaKind)?.toLowerCase() === "audio"
        ? "audio"
        : sourceRole(textValue(metadata.role, label) ?? label),
      playbackUrl,
      proxyUrl,
      offsetSeconds: numberValue(lane.offsetSeconds, lane.offset, media.offsetSeconds, media.offset, media.sequenceStart),
      durationSeconds: numberValue(lane.durationSeconds, lane.duration, media.durationSeconds, media.duration),
      syncStatus: textValue(lane.syncStatus, media.syncStatus),
    } satisfies ProgramEditSource];
  });
}

function normalizeDecisions(timelineJson: unknown, cutoff: Date): ProgramDecision[] {
  const root = record(timelineJson);
  const sequence = Array.isArray(root.sequences) ? record(root.sequences[0]) : root;
  const rows = Array.isArray(sequence.programDecisions)
    ? sequence.programDecisions
    : Array.isArray(root.programDecisions)
      ? root.programDecisions
      : [];
  return rows.flatMap((row, index) => {
    const decision = record(row);
    const kind = textValue(decision.kind, decision.decisionKind);
    if (!kind || !PROGRAM_DECISION_KINDS.includes(kind as ProgramDecisionKind)) return [];
    const sourceLaneIDs = Array.isArray(decision.sourceLaneIDs)
      ? decision.sourceLaneIDs.filter((value): value is string => typeof value === "string")
      : [];
    const sourceActor = record(decision.actor);
    const actorLabel = textValue(sourceActor.label, sourceActor.email, decision.createdBy, decision.actorLabel);
    const actorType: EditActorType = sourceActor.type === "agent" || /codex|agent/i.test(actorLabel ?? "")
      ? "agent"
      : "import";
    const sourceTimestamp = textValue(decision.createdAt, decision.timestamp, sourceActor.createdAt);
    const parsedTimestamp = sourceTimestamp ? new Date(sourceTimestamp) : null;
    const hasExactTimestamp = parsedTimestamp && Number.isFinite(parsedTimestamp.getTime());
    return [{
      id: textValue(decision.id, `imported-decision-${index}`) ?? `imported-decision-${index}`,
      startTime: numberValue(decision.startTime, decision.sequenceTime, decision.startSeconds),
      kind: kind as ProgramDecisionKind,
      sourceLaneIDs,
      clipLaneID: textValue(decision.clipLaneID),
      clipMotion: decision.clipMotion === "holdFrame" ? "holdFrame" : "playing",
      clipHoldSourceTime: numberValue(decision.clipHoldSourceTime) || undefined,
      audioPolicy: textValue(decision.audioPolicy) as ProgramDecision["audioPolicy"],
      audioSourceLaneIDs: Array.isArray(decision.audioSourceLaneIDs)
        ? decision.audioSourceLaneIDs.filter((value): value is string => typeof value === "string")
        : undefined,
      actor: { type: actorType, label: actorLabel ?? "Legacy Quipsly edit" },
      createdAt: hasExactTimestamp ? parsedTimestamp.toISOString() : undefined,
      provenance: hasExactTimestamp
        ? { timestampPrecision: "exact" }
        : { timestampPrecision: "before-cutoff", createdBefore: cutoff.toISOString() },
    } satisfies ProgramDecision];
  }).sort((a, b) => a.startTime - b.startTime);
}

export function normalizeWatchDerivatives(
  productionJson: unknown,
): EpisodeWatchDerivative[] {
  const production = record(productionJson);
  const rows = Array.isArray(production.timelineClips)
    ? production.timelineClips
    : [];
  return rows.flatMap((value) => {
    const row = record(value);
    if (row.generatedFrom !== "quipsly-episode-room-watch.v1") return [];
    const recordingSync = record(row.recordingSync);
    const id = textValue(row.id);
    const assetId = textValue(row.assetId);
    const episodeRoomSessionId = textValue(recordingSync.episodeRoomSessionId);
    const watchSegmentId = textValue(recordingSync.watchSegmentId);
    const startReceiptId = textValue(recordingSync.startReceiptId);
    const endReceiptId = textValue(recordingSync.endReceiptId);
    const watchedAt = textValue(recordingSync.watchedAt);
    const recordingRoomId = textValue(recordingSync.recordingRoomId);
    const recordingStartedAt = textValue(recordingSync.recordingStartedAt);
    const kind = row.kind === "audio" ? "audio" : row.kind === "video" ? "video" : null;
    const startSeconds = optionalNumberValue(row.startIn);
    const durationSeconds = optionalNumberValue(row.duration);
    const sourceStartSeconds = optionalNumberValue(row.sourceStart);
    const sourceEndSeconds = optionalNumberValue(row.sourceEnd);
    if (
      !id
      || !assetId
      || !kind
      || !episodeRoomSessionId
      || !watchSegmentId
      || !startReceiptId
      || !endReceiptId
      || !watchedAt
      || startSeconds === undefined
      || startSeconds < 0
      || durationSeconds === undefined
      || durationSeconds < 0.05
      || sourceStartSeconds === undefined
      || sourceStartSeconds < 0
      || sourceEndSeconds === undefined
      || sourceEndSeconds < sourceStartSeconds
    ) {
      return [];
    }
    return [{
      id,
      assetId,
      name: textValue(row.name) ?? "Watched clip",
      kind,
      startSeconds,
      durationSeconds,
      sourceStartSeconds,
      sourceEndSeconds,
      color: textValue(row.color) ?? (kind === "audio" ? "#8f6fc2" : "#d37b43"),
      episodeRoomSessionId,
      watchSegmentId,
      startReceiptId,
      endReceiptId,
      watchedAt,
      ...(recordingRoomId ? { recordingRoomId } : {}),
      ...(recordingStartedAt ? { recordingStartedAt } : {}),
    } satisfies EpisodeWatchDerivative];
  }).sort((left, right) => (
    left.startSeconds - right.startSeconds
    || left.watchedAt.localeCompare(right.watchedAt)
  ));
}

function findAudioUrl(productionJson: unknown): string | undefined {
  const root = record(productionJson);
  const audio = record(root.audio ?? root.audioSpine ?? root.masteredAudio);
  return webUrl(root.listenAudioUrl, root.masterAudioUrl, root.audioSpineUrl, audio.proxyUrl, audio.url);
}

function initialState(episode: { timelineJson: unknown; productionJson: unknown; updatedAt: Date }): ProgramEditState {
  const timeline = record(episode.timelineJson);
  const sequence = Array.isArray(timeline.sequences) ? record(timeline.sequences[0]) : timeline;
  const production = record(episode.productionJson);
  const sources = normalizeSources(episode.timelineJson, episode.productionJson);
  const durationSeconds = Math.max(
    numberValue(sequence.durationSeconds, sequence.duration, timeline.durationSeconds, production.durationSeconds),
    ...sources.map((source) => source.durationSeconds + source.offsetSeconds),
  );
  return {
    version: PROGRAM_EDIT_VERSION,
    durationSeconds,
    sources,
    listenAudioUrl: findAudioUrl(episode.productionJson),
    programDecisions: normalizeDecisions(episode.timelineJson, episode.updatedAt),
  };
}

function parseState(value: unknown): ProgramEditState {
  const state = record(value);
  return {
    version: PROGRAM_EDIT_VERSION,
    durationSeconds: numberValue(state.durationSeconds),
    sources: Array.isArray(state.sources) ? state.sources as ProgramEditSource[] : [],
    listenAudioUrl: textValue(state.listenAudioUrl),
    programDecisions: Array.isArray(state.programDecisions)
      ? (state.programDecisions as ProgramDecision[]).slice().sort((a, b) => a.startTime - b.startTime)
      : [],
  };
}

async function episodeRows(projectSlug: string) {
  const prisma = getPrismaClient();
  return prisma.studioEpisodeProduction.findMany({
    where: { project: { slug: projectSlug } },
    orderBy: [{ createdAt: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      projectId: true,
      documentId: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
      timelineJson: true,
      transcriptJson: true,
      productionJson: true,
      document: { select: { id: true, title: true } },
    },
  });
}

export async function ensureEpisodeEditBranch(projectSlug: string, episodeSlug: string, actor: EditActor) {
  const prisma = getPrismaClient();
  const episode = await prisma.studioEpisodeProduction.findFirst({
    where: { slug: episodeSlug, project: { slug: projectSlug } },
    include: { document: { select: { id: true, title: true } } },
  });
  if (!episode) throw new Error("Episode not found.");

  let baseline = await prisma.studioEditBaseline.findFirst({
    where: { episodeProductionId: episode.id, stableKey: "source-sync-baseline" },
    orderBy: { version: "desc" },
  });
  if (!baseline) {
    const state = initialState(episode);
    baseline = await prisma.studioEditBaseline.create({
      data: {
        projectId: episode.projectId,
        episodeProductionId: episode.id,
        stableKey: "source-sync-baseline",
        version: 1,
        label: `${episode.title} protected sync baseline`,
        durationSeconds: state.durationSeconds,
        sourceFingerprint: fingerprint(state.sources),
        sourceManifestJson: json({ sources: state.sources, listenAudioUrl: state.listenAudioUrl }),
        syncSummaryJson: json({
          sourceCount: state.sources.length,
          proxyReadyCount: state.sources.filter((source) => Boolean(source.proxyUrl)).length,
          status: state.sources.length ? "available" : "needs-source-manifest",
        }),
        importReceiptJson: json({
          source: "StudioEpisodeProduction.timelineJson",
          importedAt: new Date().toISOString(),
          legacyDecisionCount: state.programDecisions.length,
          timestampPrecision: "before-cutoff",
          sourceCreatedBefore: episode.updatedAt.toISOString(),
          note: "Legacy decisions existed before this import. Individual creation dates were not fabricated.",
        }),
        importedByUserId: actor.userId,
        importedByEmail: actor.email,
      },
    });
  }

  let branch = await prisma.studioEditBranch.findUnique({
    where: { baselineId_slug: { baselineId: baseline.id, slug: "shared-editor-cut" } },
  });
  if (!branch) {
    const state = initialState(episode);
    branch = await prisma.studioEditBranch.create({
      data: {
        baselineId: baseline.id,
        slug: "shared-editor-cut",
        name: "Shared editor cut",
        stateJson: json(state),
        stateFingerprint: fingerprint(state),
        createdByUserId: actor.userId,
        createdByEmail: actor.email,
        createdByActorType: actor.type,
        operations: {
          create: {
            revision: 0,
            clientRequestId: `legacy-import:${episode.id}:${episode.updatedAt.toISOString()}`,
            expectedRevision: 0,
            actorUserId: actor.userId,
            actorEmail: actor.email,
            actorLabel: actor.label,
            actorType: "import",
            operationType: "IMPORT_LEGACY_BASELINE",
            payloadJson: json({ importedDecisionCount: state.programDecisions.length }),
            afterJson: json(state),
            sourceTimestampPrecision: "before-cutoff",
            sourceCreatedBefore: episode.updatedAt,
          },
        },
      },
    });
  }
  return { episode, baseline, branch };
}

export async function loadEpisodeEditDesk(
  projectSlug: string,
  episodeSlug: string | undefined,
  canEdit: boolean,
): Promise<EpisodeEditDeskPayload> {
  const prisma = getPrismaClient();
  const episodes = await episodeRows(projectSlug);
  const selected = episodes.find((episode) => episode.slug === episodeSlug) ?? episodes[0] ?? null;
  if (!selected) {
    return {
      projectSlug,
      episodes: [],
      selectedEpisode: null,
      baseline: null,
      branch: null,
      state: { version: PROGRAM_EDIT_VERSION, durationSeconds: 0, sources: [], programDecisions: [] },
      watchDerivatives: [],
      annotations: [],
      transcript: null,
      document: null,
      canEdit,
    };
  }
  const baseline = await prisma.studioEditBaseline.findFirst({
    where: { episodeProductionId: selected.id, stableKey: "source-sync-baseline" },
    orderBy: { version: "desc" },
  });
  const branch = baseline
    ? await prisma.studioEditBranch.findUnique({
        where: { baselineId_slug: { baselineId: baseline.id, slug: "shared-editor-cut" } },
      })
    : null;
  const annotations = branch
    ? await prisma.studioTimelineAnnotation.findMany({
        where: { branchId: branch.id, archivedAt: null },
        orderBy: [{ startSeconds: "asc" }, { createdAt: "asc" }],
      })
    : [];
  return {
    projectSlug,
    episodes: episodes.map((episode) => ({
      id: episode.id,
      slug: episode.slug,
      title: episode.title,
      status: episode.status,
      updatedAt: episode.updatedAt.toISOString(),
    })),
    selectedEpisode: {
      id: selected.id,
      slug: selected.slug,
      title: selected.title,
      status: selected.status,
      updatedAt: selected.updatedAt.toISOString(),
    },
    baseline: baseline ? {
      id: baseline.id,
      label: baseline.label,
      version: baseline.version,
      durationSeconds: baseline.durationSeconds,
      sourceFingerprint: baseline.sourceFingerprint,
      syncSummary: record(baseline.syncSummaryJson),
      importReceipt: record(baseline.importReceiptJson),
    } : null,
    branch: branch ? {
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      headRevision: branch.headRevision,
      updatedAt: branch.updatedAt.toISOString(),
    } : null,
    state: branch ? parseState(branch.stateJson) : initialState(selected),
    watchDerivatives: normalizeWatchDerivatives(selected.productionJson),
    annotations: annotations.map((annotation) => ({
      id: annotation.id,
      startSeconds: annotation.startSeconds,
      endSeconds: annotation.endSeconds,
      kind: annotation.kind,
      title: annotation.title,
      body: annotation.body,
      hookKey: annotation.hookKey,
      tags: Array.isArray(annotation.tagsJson)
        ? annotation.tagsJson as Array<{ id: string; slug: string; label: string }>
        : [],
      createdByEmail: annotation.createdByEmail,
      createdByActorType: annotation.createdByActorType,
      createdAt: annotation.createdAt.toISOString(),
    })),
    transcript: selected.transcriptJson,
    document: selected.document,
    canEdit,
  };
}

export async function saveProgramDecision(input: {
  projectSlug: string;
  episodeSlug: string;
  kind: ProgramDecisionKind;
  sequenceTime: number;
  expectedRevision: number;
  clientRequestId: string;
  actor: EditActor;
}) {
  const prisma = getPrismaClient();
  const { branch } = await ensureEpisodeEditBranch(input.projectSlug, input.episodeSlug, input.actor);
  await prisma.$transaction(async (tx) => {
    const current = await tx.studioEditBranch.findUniqueOrThrow({ where: { id: branch.id } });
    if (current.headRevision !== input.expectedRevision) throw new EpisodeEditConflict(current.headRevision);
    const before = parseState(current.stateJson);
    const sourceSelection = sourceIDsForDecision(input.kind, before.sources);
    const decision: ProgramDecision = {
      id: randomUUID(),
      startTime: Math.max(0, input.sequenceTime),
      kind: input.kind,
      sourceLaneIDs: sourceSelection.sourceLaneIDs,
      clipLaneID: sourceSelection.clipLaneID,
      clipMotion: "playing",
      audioPolicy: input.kind === "skip" ? "silence" : "hostMix",
      actor: input.actor,
      createdAt: new Date().toISOString(),
      provenance: { timestampPrecision: "exact" },
    };
    const after: ProgramEditState = {
      ...before,
      programDecisions: before.programDecisions
        .filter((item) => Math.abs(item.startTime - decision.startTime) > 1 / 60)
        .concat(decision)
        .sort((a, b) => a.startTime - b.startTime),
    };
    const nextRevision = current.headRevision + 1;
    const updated = await tx.studioEditBranch.updateMany({
      where: { id: current.id, headRevision: current.headRevision },
      data: { headRevision: nextRevision, stateJson: json(after), stateFingerprint: fingerprint(after) },
    });
    if (updated.count !== 1) throw new EpisodeEditConflict(current.headRevision);
    await tx.studioEditOperation.create({
      data: {
        branchId: current.id,
        revision: nextRevision,
        clientRequestId: input.clientRequestId,
        expectedRevision: input.expectedRevision,
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        actorLabel: input.actor.label,
        actorType: input.actor.type,
        operationType: "SET_PROGRAM_DECISION",
        sequenceTime: decision.startTime,
        payloadJson: json({ kind: input.kind }),
        beforeJson: json(before),
        afterJson: json(after),
      },
    });
  });
}

export async function saveTimelineAnnotation(input: {
  projectSlug: string;
  episodeSlug: string;
  sequenceTime: number;
  expectedRevision: number;
  clientRequestId: string;
  kind: string;
  body: string;
  tags: string[];
  actor: EditActor;
}) {
  const prisma = getPrismaClient();
  const { episode, branch } = await ensureEpisodeEditBranch(input.projectSlug, input.episodeSlug, input.actor);
  await prisma.$transaction(async (tx) => {
    const current = await tx.studioEditBranch.findUniqueOrThrow({ where: { id: branch.id } });
    if (current.headRevision !== input.expectedRevision) throw new EpisodeEditConflict(current.headRevision);
    const tags = [] as Array<{ id: string; slug: string; label: string }>;
    for (const label of input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12)) {
      const slug = slugify(label);
      const tag = await tx.studioTag.upsert({
        where: { projectId_slug: { projectId: episode.projectId, slug } },
        update: { label, isActive: true },
        create: { projectId: episode.projectId, slug, label },
      });
      tags.push({ id: tag.id, slug: tag.slug, label: tag.label });
    }
    const annotation = await tx.studioTimelineAnnotation.create({
      data: {
        branchId: current.id,
        startSeconds: Math.max(0, input.sequenceTime),
        kind: input.kind,
        body: input.body.trim(),
        hookKey: input.kind === "hook" ? slugify(input.body) : null,
        tagsJson: json(tags),
        createdByUserId: input.actor.userId,
        createdByEmail: input.actor.email,
        createdByActorType: input.actor.type,
        clientRequestId: input.clientRequestId,
      },
    });
    const nextRevision = current.headRevision + 1;
    const updated = await tx.studioEditBranch.updateMany({
      where: { id: current.id, headRevision: current.headRevision },
      data: { headRevision: nextRevision },
    });
    if (updated.count !== 1) throw new EpisodeEditConflict(current.headRevision);
    await tx.studioEditOperation.create({
      data: {
        branchId: current.id,
        revision: nextRevision,
        clientRequestId: input.clientRequestId,
        expectedRevision: input.expectedRevision,
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        actorLabel: input.actor.label,
        actorType: input.actor.type,
        operationType: "ADD_TIMELINE_ANNOTATION",
        sequenceTime: annotation.startSeconds,
        payloadJson: json({ annotationId: annotation.id, kind: input.kind, body: input.body, tags }),
        afterJson: json({ annotationId: annotation.id }),
      },
    });
  });
}
