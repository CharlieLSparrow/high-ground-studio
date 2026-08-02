import { createHash } from "node:crypto";
import { TRANSCRIPT_DERIVED_GOAL_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk, TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import {
  buildTranscriptSourceAnchorFields,
  resolveTranscriptSpanSegments,
} from "@/lib/server/transcript-source-span";

// Kept outside route.ts so transaction helpers remain directly testable.
export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const MAX_TAG_COUNT = 24;
const MAX_TAG_ID_LENGTH = 200;
const MAX_TARGET_DATE_DISTANCE_MS = 10 * 365 * 86_400_000;

export function normalizeTranscriptGoalTagIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAG_COUNT) return null;
  const normalized = value.map((tagId) => text(tagId, MAX_TAG_ID_LENGTH + 1));
  if (normalized.some((tagId) => !tagId || tagId.length > MAX_TAG_ID_LENGTH)) return null;
  return [...new Set(normalized)].sort();
}

export function normalizeTranscriptGoalTargetAt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const targetAt = new Date(value);
  if (!Number.isFinite(targetAt.getTime())) return undefined;
  if (Math.abs(targetAt.getTime() - Date.now()) > MAX_TARGET_DATE_DISTANCE_MS) return undefined;
  return targetAt;
}

export function transcriptGoalMaterializationIntent(input: {
  title: string;
  description: string | null;
  targetAt: Date | null;
  tagIds: string[];
}) {
  return {
    title: input.title,
    description: input.description,
    targetAt: input.targetAt?.toISOString() ?? null,
    tagIds: input.tagIds,
  };
}

export function sameTranscriptGoalMaterializationIntent(
  value: unknown,
  expected: ReturnType<typeof transcriptGoalMaterializationIntent>,
) {
  const saved = record(value);
  if (!Object.keys(saved).length) return false;
  const savedTags = normalizeTranscriptGoalTagIds(saved.tagIds);
  return text(saved.title, 240) === expected.title
    && (typeof saved.description === "string" ? saved.description.trim() || null : null) === expected.description
    && (typeof saved.targetAt === "string" ? saved.targetAt.trim() || null : null) === expected.targetAt
    && savedTags !== null
    && JSON.stringify(savedTags) === JSON.stringify(expected.tagIds);
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function goalIdentity(userId: string, clientRequestId: string) {
  return `transcript-goal-${createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 24)}`;
}

export function transcriptDerivedGoalBoundaries(input: { targetDateCreated?: boolean; tagsApplied?: boolean } = {}) {
  return {
    explicitHumanAction: true,
    sourceAnchorPreserved: true,
    providerTranscriptMutated: false,
    correctionOverlayMutated: false,
    recordingMutated: false,
    taskCreated: false,
    targetDateCreated: input.targetDateCreated === true,
    projectTagsApplied: input.tagsApplied === true,
    reminderCreated: false,
    calendarMutated: false,
    externalDelivery: false,
    publication: false,
  };
}

export async function createTranscriptDerivedGoalInTransaction(input: {
  tx: any;
  actor: { id: string; email?: string | null; isStaff: boolean };
  goal: {
    roomId: string;
    segmentId: string;
    segmentIds?: string[];
    clientRequestId: string;
    expectedProviderTextSha256: string;
    expectedSourceTextSha256?: string;
    title: string;
    description: string | null;
    targetAt: Date | null;
    tagIds: string[];
    surface: string;
  };
}) {
  const { tx, actor, goal: request } = input;
  const id = goalIdentity(actor.id, request.clientRequestId);
  const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId: request.roomId, actor });
  if (!desk.gate.allowed || !desk.playback) {
    throw new TranscriptCorrectionError(desk.gate.error || "Released recording-backed transcript evidence is required.", 409, "TRANSCRIPT_GOAL_EVIDENCE_HELD");
  }
  const evidenceSegments = resolveTranscriptSpanSegments({
    segmentIds: request.segmentIds,
    primarySegmentId: request.segmentId,
    segments: desk.segments,
  });
  const sourceAnchor = evidenceSegments ? buildTranscriptSourceAnchorFields(evidenceSegments) : null;
  if (!sourceAnchor) throw new TranscriptCorrectionError("The transcript evidence span changed or is unavailable.", 409, "STALE_TRANSCRIPT_SEGMENT");
  if (sourceAnchor.providerTextSha256 !== request.expectedProviderTextSha256) {
    throw new TranscriptCorrectionError("Provider transcript evidence changed. Refresh before creating the goal.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const expectedSourceTextSha256 = text(request.expectedSourceTextSha256, 64).toLowerCase();
  if (expectedSourceTextSha256
      && createHash("sha256").update(sourceAnchor.effectiveTextSnapshot, "utf8").digest("hex") !== expectedSourceTextSha256) {
    throw new TranscriptCorrectionError("The complete transcript thought changed. Refresh before creating the goal.", 409, "STALE_TRANSCRIPT_SPAN_EVIDENCE");
  }

  const requestedIntent = transcriptGoalMaterializationIntent({
    title: request.title,
    description: request.description,
    targetAt: request.targetAt,
    tagIds: request.tagIds,
  });
  const replay = await tx.goal.findUnique({
    where: { id },
    include: { tagLinks: { select: { tagId: true } } },
  });
  if (replay) {
    const source = record(replay.sourceJson);
    const legacySingleSegmentEvidenceAbsent = sourceAnchor.segmentIds.length === 1
      && !source.segmentId
      && !source.providerTextSha256
      && !Array.isArray(source.segmentIds);
    const sourceEvidenceMatches = legacySingleSegmentEvidenceAbsent || (
      source.segmentId === request.segmentId
      && source.providerTextSha256 === request.expectedProviderTextSha256
      && JSON.stringify(Array.isArray(source.segmentIds) ? source.segmentIds : [source.segmentId])
        === JSON.stringify(sourceAnchor.segmentIds)
    );
    if (source.schema !== TRANSCRIPT_DERIVED_GOAL_SCHEMA
        || source.clientRequestId !== request.clientRequestId
        || source.createdByUserId !== actor.id
        || replay.roomId !== request.roomId
        || !sourceEvidenceMatches) {
      throw new TranscriptCorrectionError("That goal request identity is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    const existingTagIds = Array.isArray(replay.tagLinks)
      ? replay.tagLinks.map((link: any) => text(link?.tagId, MAX_TAG_ID_LENGTH)).filter(Boolean).sort()
      : [];
    const legacyIntentMatches = !Object.keys(record(source.materializationIntent)).length
      && replay.title === requestedIntent.title
      && (replay.description ?? null) === requestedIntent.description
      && (replay.targetAt instanceof Date ? replay.targetAt.toISOString() : replay.targetAt ?? null) === requestedIntent.targetAt
      && JSON.stringify(existingTagIds) === JSON.stringify(requestedIntent.tagIds);
    if (!sameTranscriptGoalMaterializationIntent(source.materializationIntent, requestedIntent) && !legacyIntentMatches) {
      throw new TranscriptCorrectionError(
        "That goal request was already completed with different wording, target date, or tags. Open the canonical goal to edit it.",
        409,
        "IDEMPOTENCY_CONFLICT",
      );
    }
    return { goal: replay, idempotentReplay: true, appliedTags: Array.isArray(source.appliedTags) ? source.appliedTags : [] };
  }

  let acceptedTags: Array<{ id: string; label: string; slug: string }> = [];
  if (request.tagIds.length && !desk.projectId) {
    throw new TranscriptCorrectionError("This Session needs a canonical Nest project before its goal can use project tags.", 409, "TRANSCRIPT_GOAL_PROJECT_REQUIRED");
  }
  if (request.tagIds.length) {
    acceptedTags = await tx.studioTag.findMany({
      where: { id: { in: request.tagIds }, projectId: desk.projectId, isActive: true, mergedIntoTagId: null },
      orderBy: { id: "asc" },
      select: { id: true, label: true, slug: true },
    });
    if (acceptedTags.length !== request.tagIds.length) {
      throw new TranscriptCorrectionError(
        "One or more selected tags are archived, merged, or outside this Session's project. Refresh before creating the goal.",
        409,
        "TRANSCRIPT_GOAL_TAG_SELECTION_STALE",
      );
    }
  }

  const createdAt = new Date().toISOString();
  const goal = await tx.goal.create({
    data: {
      id,
      ownerUserId: actor.id,
      roomId: request.roomId,
      projectId: desk.projectId ?? null,
      title: request.title,
      description: request.description,
      status: "ACTIVE",
      targetAt: request.targetAt,
      sourceJson: {
        schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA,
        surface: request.surface,
        clientRequestId: request.clientRequestId,
        explicitHumanAction: true,
        createdByUserId: actor.id,
        createdAt,
        roomId: request.roomId,
        transcriptJobId: desk.transcriptJobId,
        ...sourceAnchor,
        recordingAssetId: desk.playback.recordingAssetId,
        playbackSourceId: desk.playback.sourceId,
        materializationIntent: requestedIntent,
        appliedTags: acceptedTags,
        boundaries: transcriptDerivedGoalBoundaries({
          targetDateCreated: request.targetAt !== null,
          tagsApplied: request.tagIds.length > 0,
        }),
      },
    },
  });
  if (request.tagIds.length) {
    await tx.goalTagLink.createMany({
      data: request.tagIds.map((tagId) => ({
        goalId: goal.id,
        tagId,
        createdByUserId: actor.id,
        sourceJson: {
          source: "transcript-goal-materialization",
          clientRequestId: request.clientRequestId,
          roomId: request.roomId,
          externalSideEffects: false,
        },
      })),
    });
  }
  return { goal, idempotentReplay: false, appliedTags: acceptedTags };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sign in before creating a goal from a transcript." }, { status: 401 });
  }
  const input = await body(request);
  const roomId = text(input.roomId, 200);
  const segmentId = text(input.segmentId, 200);
  const clientRequestId = text(input.clientRequestId, 160);
  const expectedProviderTextSha256 = text(input.expectedProviderTextSha256, 64).toLowerCase();
  const title = text(input.title, 240);
  const description = text(input.description, 5_000) || null;
  const targetAt = normalizeTranscriptGoalTargetAt(input.targetAt);
  const tagIds = normalizeTranscriptGoalTagIds(input.tagIds);
  if (!roomId || !segmentId || !clientRequestId || !expectedProviderTextSha256 || !title) {
    return NextResponse.json({ ok: false, error: "Room, segment, provider evidence, request identity, and goal title are required." }, { status: 400 });
  }
  if (targetAt === undefined) {
    return NextResponse.json({ ok: false, error: "Choose a valid target date within ten years." }, { status: 400 });
  }
  if (tagIds === null) {
    return NextResponse.json({ ok: false, error: `Choose at most ${MAX_TAG_COUNT} valid project tags.` }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = { id: session.user.id, email: session.user.primaryEmail || session.user.email, isStaff: session.user.isStaff === true };
  try {
    const result = await prisma.$transaction((tx: any) => createTranscriptDerivedGoalInTransaction({
      tx,
      actor,
      goal: {
        roomId,
        segmentId,
        clientRequestId,
        expectedProviderTextSha256,
        title,
        description,
        targetAt,
        tagIds,
        surface: text(input.surface, 80) || "quipsly-transcript-review",
      },
    }));
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      goal: {
        id: result.goal.id,
        title: result.goal.title,
        description: result.goal.description,
        status: result.goal.status,
        roomId: result.goal.roomId,
        ownerUserId: result.goal.ownerUserId,
        targetAt: result.goal.targetAt instanceof Date ? result.goal.targetAt.toISOString() : result.goal.targetAt,
        tags: result.appliedTags,
        createdAt: result.goal.createdAt instanceof Date ? result.goal.createdAt.toISOString() : result.goal.createdAt,
      },
      boundaries: transcriptDerivedGoalBoundaries({
        targetDateCreated: targetAt !== null,
        tagsApplied: tagIds.length > 0,
      }),
    });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[transcript-goal] explicit goal creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not create this goal. No external action was taken." }, { status: 503 });
  }
}
