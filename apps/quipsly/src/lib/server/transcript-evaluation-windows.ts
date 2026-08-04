import "server-only";

import { createHash } from "node:crypto";

import {
  COACHING_TRANSCRIPT_EVALUATION_CONDITIONS,
  PODCAST_TRANSCRIPT_EVALUATION_CONDITIONS,
  type TranscriptEvaluationCondition,
  type TranscriptEvaluationWorkload,
} from "@high-ground/quipsly-media-processing";

import {
  buildMobileCaptureConsentVersions,
  mobileCaptureConsentVersion,
} from "./mobile-capture-consent-readiness.js";
import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock.js";

export const TRANSCRIPT_EVALUATION_WINDOW_SCHEMA = "quipsly-transcript-evaluation-window-v1";
export const TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS = 60;
export const TRANSCRIPT_EVALUATION_WINDOW_MAXIMUM_SECONDS = 180;

type Actor = { id: string; email?: string | null; isStaff: boolean };

export class TranscriptEvaluationWindowError extends Error {
  constructor(
    message: string,
    public readonly code = "TRANSCRIPT_EVALUATION_WINDOW_INVALID",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "TranscriptEvaluationWindowError";
  }
}

const CONDITIONS: Record<TranscriptEvaluationWorkload, readonly TranscriptEvaluationCondition[]> = {
  podcast: PODCAST_TRANSCRIPT_EVALUATION_CONDITIONS,
  coaching: COACHING_TRANSCRIPT_EVALUATION_CONDITIONS,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Value(value: unknown) {
  return sha256(stableJson(value));
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function tokenize(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function currentAcceptedCorrection(segment: any) {
  return (Array.isArray(segment?.corrections) ? segment.corrections : [])
    .filter((correction: any) => correction.status === "accepted")
    .sort((left: any, right: any) => {
      const byUpdated = String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
      return byUpdated || String(right.id).localeCompare(String(left.id));
    })[0] ?? null;
}

function currentVerification(segment: any) {
  const providerTextSha256 = sha256(String(segment?.text ?? ""));
  return (Array.isArray(segment?.verifications) ? segment.verifications : [])
    .filter((verification: any) => (
      verification.reviewKind === "confirmed-as-is"
      && verification.providerTextSha256 === providerTextSha256
      && (verification.providerSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
      && Number(verification.startSecondsSnapshot) === Number(segment.startSeconds)
      && Number(verification.endSecondsSnapshot) === Number(segment.endSeconds)
    ))
    .sort((left: any, right: any) => {
      const byCreated = String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
      return byCreated || String(right.id).localeCompare(String(left.id));
    })[0] ?? null;
}

function validAcceptedCorrection(segment: any, correction: any) {
  return Boolean(
    correction
    && correction.baseTextSha256 === sha256(String(segment.text ?? ""))
    && correction.expectedText === segment.text
    && (correction.expectedSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
    && Number(correction.startSecondsSnapshot) === Number(segment.startSeconds)
    && Number(correction.endSecondsSnapshot) === Number(segment.endSeconds)
    && correction.reviewedByUserId
    && correction.reviewedAt,
  );
}

function speakerSnapshot(segments: any[], label: string) {
  const evidence = segments
    .filter((segment) => (segment.speakerLabel ?? null) === label)
    .map((segment) => ({
      id: text(segment.id),
      startSeconds: Number(segment.startSeconds),
      endSeconds: Number(segment.endSeconds),
      textSha256: sha256(String(segment.text ?? "")),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
  return sha256Value({ providerSpeakerLabel: label, evidence });
}

function activeSpeakerLabels(job: any) {
  const attributions = new Map<string, string>();
  for (const attribution of Array.isArray(job?.speakerAttributions) ? job.speakerAttributions : []) {
    const label = text(attribution.providerSpeakerLabel);
    if (
      attribution.status === "active"
      && label
      && attribution.providerSnapshotSha256 === speakerSnapshot(job.segments ?? [], label)
      && text(attribution.participantDisplaySnapshot)
    ) {
      attributions.set(label, text(attribution.participantDisplaySnapshot));
    }
  }
  return attributions;
}

function referenceForJob(job: any, selectedSegmentIds?: ReadonlySet<string>, timeOffsetSeconds = 0) {
  const allSegments = [...(Array.isArray(job?.segments) ? job.segments : [])]
    .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds) || String(left.id).localeCompare(String(right.id)));
  const segments = selectedSegmentIds
    ? allSegments.filter((segment) => selectedSegmentIds.has(text(segment.id)))
    : allSegments;
  const attributedSpeakers = activeSpeakerLabels(job);
  const referenceWords: Array<{
    text: string;
    startSeconds: number | null;
    endSeconds: number | null;
    speakerId: string | null;
  }> = [];
  const reviewReceipts: Array<Record<string, unknown>> = [];
  const unreviewedSegmentIds: string[] = [];
  let speakerReviewedWordCount = 0;

  for (const segment of segments) {
    const correction = currentAcceptedCorrection(segment);
    const verification = currentVerification(segment);
    const correctionIsCurrent = validAcceptedCorrection(segment, correction);
    if (!correctionIsCurrent && !verification) {
      unreviewedSegmentIds.push(text(segment.id));
      continue;
    }
    const providerLabel = text(segment.speakerLabel) || null;
    const reviewedSpeaker = correctionIsCurrent && text(correction.correctedSpeakerLabel)
      ? text(correction.correctedSpeakerLabel)
      : providerLabel
        ? attributedSpeakers.get(providerLabel) ?? null
        : null;
    const correctedText = correctionIsCurrent && typeof correction.correctedText === "string"
      ? correction.correctedText.trim()
      : null;
    const providerWords = Array.isArray(segment.words) ? segment.words : [];
    const words = correctedText !== null
      ? tokenize(correctedText).map((word) => ({
          text: word,
          startSeconds: null,
          endSeconds: null,
          speakerId: reviewedSpeaker,
        }))
      : providerWords.length > 0
        ? providerWords.map((word: any) => ({
            text: text(word.punctuatedWord) || text(word.word),
            startSeconds: finite(word.startSeconds) === null ? null : rounded(finite(word.startSeconds)! - timeOffsetSeconds),
            endSeconds: finite(word.endSeconds) === null ? null : rounded(finite(word.endSeconds)! - timeOffsetSeconds),
            speakerId: reviewedSpeaker,
          })).filter((word: any) => Boolean(word.text))
        : tokenize(String(segment.text ?? "")).map((word) => ({
            text: word,
            startSeconds: null,
            endSeconds: null,
            speakerId: reviewedSpeaker,
          }));
    referenceWords.push(...words);
    speakerReviewedWordCount += reviewedSpeaker ? words.length : 0;
    reviewReceipts.push(correctionIsCurrent ? {
      kind: "accepted-correction",
      id: correction.id,
      segmentId: segment.id,
      providerTextSha256: sha256(String(segment.text ?? "")),
      reviewedAt: correction.reviewedAt instanceof Date ? correction.reviewedAt.toISOString() : correction.reviewedAt,
    } : {
      kind: "confirmed-as-is",
      id: verification.id,
      segmentId: segment.id,
      providerTextSha256: verification.providerTextSha256,
      reviewedAt: verification.createdAt instanceof Date ? verification.createdAt.toISOString() : verification.createdAt,
    });
  }

  const contentSha256 = referenceWords.length > 0 ? sha256Value(referenceWords) : null;
  return {
    segmentIds: segments.map((segment) => text(segment.id)),
    referenceWords,
    reviewReceipts,
    unreviewedSegmentIds,
    referenceContentSha256: contentSha256,
    referenceRevisionId: contentSha256 ? `reviewed-reference-${contentSha256.slice(0, 24)}` : null,
    speakerReviewedWordCount,
    wordCount: referenceWords.length,
  };
}

type TranscriptEvaluationRange = {
  startSegmentId: string;
  endSegmentId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  segmentIds: string[];
};

function availableSegments(job: any) {
  return [...(Array.isArray(job?.segments) ? job.segments : [])]
    .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds) || String(left.id).localeCompare(String(right.id)))
    .map((segment) => ({
      id: text(segment.id),
      startSeconds: rounded(Number(segment.startSeconds)),
      endSeconds: rounded(Number(segment.endSeconds)),
      reviewed: validAcceptedCorrection(segment, currentAcceptedCorrection(segment)) || Boolean(currentVerification(segment)),
    }))
    .filter((segment) => segment.id && Number.isFinite(segment.startSeconds) && Number.isFinite(segment.endSeconds) && segment.endSeconds >= segment.startSeconds);
}

function selectedRange(job: any, startSegmentId: unknown, endSegmentId: unknown): TranscriptEvaluationRange {
  const segments = availableSegments(job);
  const sourceDurationSeconds = finite(job?.asset?.durationSeconds);
  if (sourceDurationSeconds === null || sourceDurationSeconds < TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS) {
    throw new TranscriptEvaluationWindowError("The protected source is too short for an accuracy window.", "SOURCE_DURATION_REQUIRED", 409);
  }
  const startId = text(startSegmentId);
  const endId = text(endSegmentId);
  const startIndex = segments.findIndex((segment) => segment.id === startId);
  const endIndex = segments.findIndex((segment) => segment.id === endId);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new TranscriptEvaluationWindowError("Choose a valid transcript-aligned start and end for the accuracy window.", "WINDOW_RANGE_INVALID");
  }
  const chosen = segments.slice(startIndex, endIndex + 1);
  let startSeconds = chosen[0]!.startSeconds;
  let endSeconds = chosen.at(-1)!.endSeconds;
  const missingSeconds = Math.max(0, TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS - (endSeconds - startSeconds));
  const growRight = Math.min(missingSeconds, Math.max(0, sourceDurationSeconds - endSeconds));
  endSeconds = rounded(endSeconds + growRight);
  startSeconds = rounded(Math.max(0, startSeconds - (missingSeconds - growRight)));

  // Silence may safely pad a corpus window, but a padded boundary must never
  // cut through or conceal another transcript turn. Close over every overlap
  // and preserve all of those segment IDs in the frozen evidence snapshot.
  let included = chosen;
  for (;;) {
    included = segments.filter((segment) => segment.endSeconds > startSeconds + 0.001 && segment.startSeconds < endSeconds - 0.001);
    const nextStart = Math.min(startSeconds, ...included.map((segment) => segment.startSeconds));
    const nextEnd = Math.max(endSeconds, ...included.map((segment) => segment.endSeconds));
    if (Math.abs(nextStart - startSeconds) < 0.001 && Math.abs(nextEnd - endSeconds) < 0.001) break;
    startSeconds = rounded(nextStart);
    endSeconds = rounded(nextEnd);
  }
  const durationSeconds = rounded(endSeconds - startSeconds);
  if (durationSeconds < TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS || durationSeconds > TRANSCRIPT_EVALUATION_WINDOW_MAXIMUM_SECONDS) {
    throw new TranscriptEvaluationWindowError(
      `Accuracy windows must be ${TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS}–${TRANSCRIPT_EVALUATION_WINDOW_MAXIMUM_SECONDS} seconds and align to transcript turns.`,
      "WINDOW_DURATION_REQUIRED",
      409,
    );
  }
  if (included.some((segment) => !segment.reviewed)) {
    throw new TranscriptEvaluationWindowError("Every transcript turn inside the selected window must be playback-reviewed.", "COMPLETE_PLAYBACK_REVIEW_REQUIRED", 409);
  }
  return {
    startSegmentId: startId,
    endSegmentId: endId,
    startSeconds,
    endSeconds,
    durationSeconds,
    segmentIds: included.map((segment) => segment.id),
  };
}

function suggestedRange(job: any): TranscriptEvaluationRange | null {
  const segments = availableSegments(job);
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (!segments[startIndex]!.reviewed) continue;
    let finalReviewedIndex = startIndex;
    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      if (!segments[endIndex]!.reviewed) break;
      finalReviewedIndex = endIndex;
      const duration = segments[endIndex]!.endSeconds - segments[startIndex]!.startSeconds;
      if (duration > TRANSCRIPT_EVALUATION_WINDOW_MAXIMUM_SECONDS) break;
      if (duration >= TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS) {
        return selectedRange(job, segments[startIndex]!.id, segments[endIndex]!.id);
      }
    }
    try {
      return selectedRange(job, segments[startIndex]!.id, segments[finalReviewedIndex]!.id);
    } catch (error) {
      if (!(error instanceof TranscriptEvaluationWindowError)) throw error;
    }
  }
  return null;
}

function providerSnapshot(job: any, selectedSegmentIds?: ReadonlySet<string>, timeOffsetSeconds = 0) {
  const result = object(job?.resultJson);
  const selectedSegments = (Array.isArray(job?.segments) ? job.segments : [])
    .filter((segment: any) => !selectedSegmentIds || selectedSegmentIds.has(text(segment.id)));
  const words = selectedSegments
    .flatMap((segment: any) => (Array.isArray(segment.words) ? segment.words : []).map((word: any) => ({
      id: text(word.id),
      text: text(word.punctuatedWord) || text(word.word),
      startSeconds: finite(word.startSeconds) === null ? null : rounded(finite(word.startSeconds)! - timeOffsetSeconds),
      endSeconds: finite(word.endSeconds) === null ? null : rounded(finite(word.endSeconds)! - timeOffsetSeconds),
      speakerId: text(word.speakerLabel) || null,
      channel: Number.isInteger(word.channel) ? word.channel : null,
    })))
    .filter((word: any) => Boolean(word.text));
  return {
    schema: "quipsly-transcript-evaluation-provider-snapshot-v1",
    transcriptJobId: text(job?.id),
    provider: text(job?.provider) || "unknown",
    model: text(result.model) || text(object(result.engine).modelIdentifier) || null,
    language: text(job?.language) || text(object(result.engine).localeIdentifier) || null,
    providerRequestId: text(job?.providerRequestId) || null,
    workerBuildId: text(job?.workerBuildId) || null,
    segmentEvidence: selectedSegments.map((segment: any) => ({
      id: text(segment.id),
      providerTextSha256: sha256(String(segment.text ?? "")),
      startSeconds: rounded(Number(segment.startSeconds) - timeOffsetSeconds),
      endSeconds: rounded(Number(segment.endSeconds) - timeOffsetSeconds),
      providerSpeakerLabel: text(segment.speakerLabel) || null,
    })),
    words,
  };
}

function playbackFromAsset(asset: any) {
  const promotion = object(object(asset?.localManifestJson).promotion);
  const sourceId = text(promotion.sourceId);
  return sourceId && text(promotion.playbackUrl) === `/api/ingest/media/${sourceId}`
    ? { sourceId, recordingAssetId: text(asset.id) }
    : null;
}

function sourceSha256(job: any) {
  const jobSha = text(job?.sourceSha256).toLowerCase();
  const assetSha = text(job?.asset?.checksum).toLowerCase();
  if (jobSha && assetSha && jobSha !== assetSha) return null;
  const value = jobSha || assetSha;
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function canApproveRoom(room: any, actor: Actor) {
  if (actor.isStaff || room?.createdByUserId === actor.id) return true;
  if ((room?.participants ?? []).some((participant: any) => participant.userId === actor.id)) return true;
  if (room?.booking?.coachUserId === actor.id || room?.booking?.clientUserId === actor.id) return true;
  return (room?.project?.accessGrants ?? []).some(
    (grant: any) => grant.status === "ACTIVE" && (grant.role === "OWNER" || grant.role === "EDITOR"),
  );
}

function classification(input: { workload: unknown; conditions: unknown }) {
  const workload = text(input.workload) as TranscriptEvaluationWorkload;
  if (!(workload in CONDITIONS)) throw new TranscriptEvaluationWindowError("Choose podcast or coaching as the evaluation workload.", "WORKLOAD_REQUIRED");
  const allowed = new Set<string>(CONDITIONS[workload]);
  const conditions = Array.isArray(input.conditions)
    ? [...new Set(input.conditions.map(text).filter(Boolean))].sort()
    : [];
  if (conditions.length < 1 || conditions.length > allowed.size || conditions.some((condition) => !allowed.has(condition))) {
    throw new TranscriptEvaluationWindowError(`Choose one or more valid ${workload} recording conditions.`, "CONDITION_REQUIRED");
  }
  return { workload, conditions: conditions as TranscriptEvaluationCondition[] };
}

function completeWindowPlaybackEvidence(value: unknown, range: TranscriptEvaluationRange, playbackSourceId: string) {
  const evidence = object(value);
  const firstBin = Math.floor(range.startSeconds);
  const finalBinExclusive = Math.ceil(range.endSeconds);
  const expectedBins = Array.from({ length: finalBinExclusive - firstBin }, (_, index) => firstBin + index);
  const rawBins: unknown[] = Array.isArray(evidence.listenedSecondBins) ? evidence.listenedSecondBins : [];
  const bins = rawBins.length
    ? [...new Set<number>(rawBins.filter((bin: unknown): bin is number => typeof bin === "number" && Number.isInteger(bin) && bin >= firstBin && bin < finalBinExclusive))].sort((left, right) => left - right)
    : [];
  const completedAt = text(evidence.completedAt);
  const parsedCompletedAt = Date.parse(completedAt);
  const valid = evidence.schema === "quipsly-window-playback-v1"
    && text(evidence.playbackSourceId) === playbackSourceId
    && Math.abs(Number(evidence.startSeconds) - range.startSeconds) < 0.01
    && Math.abs(Number(evidence.endSeconds) - range.endSeconds) < 0.01
    && bins.length === expectedBins.length
    && bins.every((bin, index) => bin === expectedBins[index])
    && Number.isFinite(parsedCompletedAt)
    && parsedCompletedAt <= Date.now() + 5 * 60_000;
  if (!valid) {
    throw new TranscriptEvaluationWindowError(
      `Play the complete ${Math.round(range.durationSeconds)}-second selected window before approving its accuracy reference.`,
      "COMPLETE_WINDOW_PLAYBACK_REQUIRED",
      409,
    );
  }
  return {
    schema: "quipsly-window-playback-v1",
    playbackSourceId,
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    durationSeconds: range.durationSeconds,
    listenedSecondBins: bins,
    completedAt: new Date(parsedCompletedAt).toISOString(),
  };
}

function publicWindow(window: any, currentReferenceSha256: string | null) {
  const conditions = Array.isArray(window.conditionsJson)
    ? window.conditionsJson.filter((value: unknown): value is string => typeof value === "string")
    : [];
  return {
    id: window.id as string,
    workload: window.workload as TranscriptEvaluationWorkload,
    conditions,
    sourceStartSeconds: window.sourceStartSeconds as number,
    sourceEndSeconds: window.sourceEndSeconds as number,
    sourceDurationSeconds: window.sourceDurationSeconds as number,
    sourceSha256: window.sourceSha256 as string,
    consentVersionSha256: window.consentVersionSha256 as string,
    referenceRevisionId: window.referenceRevisionId as string,
    referenceContentSha256: window.referenceContentSha256 as string,
    referenceWordCount: Array.isArray(window.referenceWordsJson) ? window.referenceWordsJson.length : 0,
    completeSourcePlayback: ["quipsly-complete-source-playback-v1", "quipsly-window-playback-v1"].includes(text(object(window.sourcePlaybackEvidenceJson).schema)),
    approvedAt: window.approvedAt instanceof Date ? window.approvedAt.toISOString() : window.approvedAt,
    staleAgainstCurrentReview: currentReferenceSha256 !== null
      && window.referenceContentSha256 !== currentReferenceSha256,
  };
}

export function transcriptEvaluationReadiness(input: {
  room: any;
  job: any;
  actor: Actor;
  gateAllowed: boolean;
  playback: ReturnType<typeof playbackFromAsset>;
}) {
  const segments = availableSegments(input.job);
  const range = suggestedRange(input.job);
  const reference = range
    ? referenceForJob(input.job, new Set(range.segmentIds), range.startSeconds)
    : referenceForJob(input.job);
  const duration = finite(input.job?.asset?.durationSeconds);
  const source = sourceSha256(input.job);
  const canApprove = canApproveRoom(input.room, input.actor);
  const blockers: Array<{ code: string; detail: string }> = [];
  if (!input.gateAllowed) blockers.push({ code: "TRANSCRIPT_RELEASE_REQUIRED", detail: "Current source and transcription release must remain valid." });
  if (!canApprove) blockers.push({ code: "EDITOR_OR_PARTICIPANT_REQUIRED", detail: "A Session participant, coach, client, editor, owner, or staff reviewer must approve an accuracy window." });
  if (!input.playback) blockers.push({ code: "PLAYBACK_REQUIRED", detail: "Protected source playback must be available." });
  if (duration === null || duration < TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS) {
    blockers.push({ code: "SOURCE_DURATION_REQUIRED", detail: `The source must contain at least ${TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS} seconds of audio.` });
  }
  if (!range) {
    blockers.push({ code: "WINDOW_RANGE_REQUIRED", detail: `Choose ${TRANSCRIPT_EVALUATION_WINDOW_MINIMUM_SECONDS}–${TRANSCRIPT_EVALUATION_WINDOW_MAXIMUM_SECONDS} contiguous seconds whose transcript turns have all been playback-reviewed.` });
  }
  if (!source) blockers.push({ code: "SOURCE_SHA_REQUIRED", detail: "The transcript job and recording must agree on an immutable SHA-256." });
  if (reference.segmentIds.length === 0) blockers.push({ code: "TRANSCRIPT_SEGMENTS_REQUIRED", detail: "At least one provider segment is required." });
  if (range && reference.unreviewedSegmentIds.length > 0) blockers.push({ code: "COMPLETE_PLAYBACK_REVIEW_REQUIRED", detail: `${reference.unreviewedSegmentIds.length} of ${reference.segmentIds.length} selected segments still need a playback-backed correction or confirmation.` });
  if (!reference.referenceContentSha256 || reference.wordCount === 0) blockers.push({ code: "REFERENCE_WORDS_REQUIRED", detail: "The reviewed reference must contain words." });
  const versions = buildMobileCaptureConsentVersions({
    participants: input.room?.participants ?? [],
    consents: input.room?.recordingConsents ?? [],
  });
  const consentVersionSha256 = versions.length ? mobileCaptureConsentVersion(versions) : null;
  if (!consentVersionSha256) blockers.push({ code: "CONSENT_VERSION_REQUIRED", detail: "An exact recording and transcription consent version is required." });
  return {
    schema: TRANSCRIPT_EVALUATION_WINDOW_SCHEMA,
    eligible: blockers.length === 0,
    canApprove,
    sourceDurationSeconds: duration,
    sourceSha256: source,
    consentVersionSha256,
    reviewedSegmentCount: reference.segmentIds.length - reference.unreviewedSegmentIds.length,
    totalSegmentCount: reference.segmentIds.length,
    referenceWordCount: reference.wordCount,
    speakerReviewedWordCount: reference.speakerReviewedWordCount,
    timingEvidenceWordCount: reference.referenceWords.filter((word) => word.startSeconds !== null && word.endSeconds !== null).length,
    availableSegments: segments,
    suggestedRange: range,
    blockers,
    conditions: CONDITIONS,
    suggestedWorkload: input.room?.purpose === "COACHING" ? "coaching" : "podcast",
    approvedWindows: (input.job?.evaluationWindows ?? []).map((window: any) => {
      const frozenSegmentIds = Array.isArray(window.sourceSegmentIdsJson)
        ? window.sourceSegmentIdsJson.map(text).filter(Boolean)
        : [];
      const currentReference = referenceForJob(
        input.job,
        frozenSegmentIds.length ? new Set(frozenSegmentIds) : undefined,
        Number(window.sourceStartSeconds) || 0,
      );
      return publicWindow(window, currentReference.referenceContentSha256);
    }),
    boundaries: {
      transcriptAlignedWindows: true,
      deterministicDerivativeRequired: true,
      playbackReviewRequired: true,
      providerTranscriptImmutable: true,
      appendOnlyWindow: true,
      providerInvocation: false,
      transcriptTextExcludedFromPublicProjection: true,
      speakerCoverageMayRemainInsufficient: true,
    },
  };
}

async function loadEvaluationEvidence(prisma: any, roomId: string, actor: Actor, requireApproval: boolean) {
  const email = text(actor.email).toLowerCase();
  const room = await prisma.callRoom.findFirst({
    where: {
      id: roomId,
      ...(actor.isStaff ? {} : {
        OR: [
          { createdByUserId: actor.id },
          { participants: { some: { userId: actor.id, accessStatus: "ACTIVE" } } },
          { booking: { coachUserId: actor.id } },
          { booking: { clientUserId: actor.id } },
          ...(email ? [{ project: { accessGrants: { some: {
            email,
            status: "ACTIVE",
            ...(requireApproval ? { role: { in: ["OWNER", "EDITOR"] } } : {}),
          } } } }] : []),
        ],
      }),
    },
    select: {
      id: true,
      purpose: true,
      createdByUserId: true,
      booking: { select: { coachUserId: true, clientUserId: true } },
      participants: { select: { id: true, userId: true, role: true } },
      recordingConsents: {
        select: {
          id: true,
          participantId: true,
          userId: true,
          status: true,
          policyVersion: true,
          canRecordAudio: true,
          canRecordVideo: true,
          canTranscribe: true,
          consentedAt: true,
          revokedAt: true,
          metadataJson: true,
          updatedAt: true,
        },
      },
      project: {
        select: {
          accessGrants: {
            where: email ? { email, status: "ACTIVE" } : { id: "__none__" },
            select: { role: true, status: true },
          },
        },
      },
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          provider: true,
          language: true,
          sourceSha256: true,
          sourceGeneration: true,
          providerRequestId: true,
          workerBuildId: true,
          resultJson: true,
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          speakerAttributions: {
            where: { status: "active" },
            select: {
              id: true,
              status: true,
              providerSpeakerLabel: true,
              participantDisplaySnapshot: true,
              providerSnapshotSha256: true,
            },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            select: {
              id: true,
              speakerLabel: true,
              startSeconds: true,
              endSeconds: true,
              text: true,
              words: {
                orderBy: { providerWordIndex: "asc" },
                select: {
                  id: true,
                  punctuatedWord: true,
                  word: true,
                  startSeconds: true,
                  endSeconds: true,
                  speakerLabel: true,
                  channel: true,
                },
              },
              corrections: {
                where: { status: "accepted" },
                orderBy: { updatedAt: "desc" },
                select: {
                  id: true,
                  status: true,
                  baseTextSha256: true,
                  expectedText: true,
                  expectedSpeakerLabel: true,
                  startSecondsSnapshot: true,
                  endSecondsSnapshot: true,
                  correctedText: true,
                  correctedSpeakerLabel: true,
                  reviewedByUserId: true,
                  reviewedAt: true,
                  updatedAt: true,
                },
              },
              verifications: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  reviewKind: true,
                  providerTextSha256: true,
                  providerSpeakerLabel: true,
                  startSecondsSnapshot: true,
                  endSecondsSnapshot: true,
                  createdAt: true,
                },
              },
            },
          },
          evaluationWindows: { orderBy: { approvedAt: "desc" } },
        },
      },
    },
  });
  if (!room) throw new TranscriptEvaluationWindowError(
    requireApproval ? "This account cannot approve an evaluation window for the Session." : "Session not found or not accessible.",
    requireApproval ? "EVALUATION_APPROVAL_FORBIDDEN" : "SESSION_NOT_FOUND",
    requireApproval ? 403 : 404,
  );
  const job = room.transcriptJobs[0] ?? null;
  if (!job?.asset) throw new TranscriptEvaluationWindowError("A recording-backed transcript is required.", "RECORDING_TRANSCRIPT_REQUIRED", 409);
  const gate = await (async () => {
    // These reads also run inside an interactive serializable transaction.
    // Keep them sequential so the pg adapter never multiplexes one transaction
    // client, which pg 9 will reject rather than merely warn about.
    const receipts = await prisma.mobileCaptureFinalizationReceipt.findMany({ where: { recordingAssetId: job.asset.id }, orderBy: { createdAt: "asc" } });
    const currentRoom = await prisma.callRoom.findUnique({ where: { id: roomId }, include: { participants: true, recordingConsents: true } });
    return mobileCaptureProcessingGateFromEvidence({ recordingAsset: job.asset, receipts, room: currentRoom, transcript: true });
  })();
  return { room, job, gate, playback: playbackFromAsset(job.asset) };
}

function replayMatches(window: any, input: {
  roomId: string;
  transcriptJobId: string;
  windowKeySha256: string;
}) {
  return window.roomId === input.roomId
    && window.transcriptJobId === input.transcriptJobId
    && window.windowKeySha256 === input.windowKeySha256;
}

export async function approveTranscriptEvaluationWindow(input: {
  prisma: any;
  actor: Actor;
  roomId: string;
  clientRequestId: string;
  workload: unknown;
  conditions: unknown;
  startSegmentId: unknown;
  endSegmentId: unknown;
  reviewNote?: string | null;
  sourcePlaybackEvidence: unknown;
}) {
  const roomId = text(input.roomId);
  const clientRequestId = text(input.clientRequestId);
  if (!roomId || !clientRequestId || clientRequestId.length > 160) throw new TranscriptEvaluationWindowError("A Session and bounded operation ID are required.", "OPERATION_ID_REQUIRED");
  const selected = classification({ workload: input.workload, conditions: input.conditions });
  const evidence = await loadEvaluationEvidence(input.prisma, roomId, input.actor, true);
  const readiness = transcriptEvaluationReadiness({
    room: evidence.room,
    job: evidence.job,
    actor: input.actor,
    gateAllowed: evidence.gate.allowed,
    playback: evidence.playback,
  });
  if (!readiness.eligible) throw new TranscriptEvaluationWindowError(readiness.blockers[0]?.detail || "The source is not ready for accuracy evaluation.", readiness.blockers[0]?.code || "EVALUATION_NOT_READY", 409);
  const range = selectedRange(evidence.job, input.startSegmentId, input.endSegmentId);
  const reference = referenceForJob(evidence.job, new Set(range.segmentIds), range.startSeconds);
  if (reference.unreviewedSegmentIds.length || !reference.referenceContentSha256 || !reference.referenceRevisionId || reference.wordCount === 0) {
    throw new TranscriptEvaluationWindowError("The selected window does not have a complete human-reviewed reference.", "REFERENCE_WORDS_REQUIRED", 409);
  }
  const consentVersionSha256 = readiness.consentVersionSha256!;
  const provider = providerSnapshot(evidence.job, new Set(range.segmentIds), range.startSeconds);
  const sourcePlaybackEvidence = completeWindowPlaybackEvidence(
    input.sourcePlaybackEvidence,
    range,
    evidence.playback!.sourceId,
  );
  const snapshot = {
    schema: TRANSCRIPT_EVALUATION_WINDOW_SCHEMA,
    approvedByUserId: input.actor.id,
    roomId,
    transcriptJobId: evidence.job.id,
    recordingAssetId: evidence.job.asset.id,
    workload: selected.workload,
    conditions: selected.conditions,
    sourceStartSeconds: range.startSeconds,
    sourceEndSeconds: range.endSeconds,
    sourceDurationSeconds: range.durationSeconds,
    sourceSha256: readiness.sourceSha256!,
    sourceGeneration: text(evidence.job.sourceGeneration) || null,
    playbackSourceId: evidence.playback!.sourceId,
    consentVersionSha256,
    referenceRevisionId: reference.referenceRevisionId!,
    referenceContentSha256: reference.referenceContentSha256!,
    referenceWords: reference.referenceWords,
    sourceSegmentIds: reference.segmentIds,
    sourceReviewReceipts: reference.reviewReceipts,
    sourcePlaybackEvidence,
    providerSnapshot: provider,
  };
  const windowKeySha256 = sha256Value(snapshot);
  const replay = await input.prisma.transcriptEvaluationWindow.findUnique({
    where: { approvedByUserId_clientRequestId: { approvedByUserId: input.actor.id, clientRequestId } },
  });
  if (replay) {
    if (!replayMatches(replay, { roomId, transcriptJobId: evidence.job.id, windowKeySha256 })) throw new TranscriptEvaluationWindowError("That operation ID is already bound to different evaluation evidence.", "OPERATION_ID_CONFLICT", 409);
    return { ok: true, idempotentReplay: true, window: publicWindow(replay, reference.referenceContentSha256), readiness };
  }

  try {
    const saved = await input.prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-evaluation-window:${evidence.job.id}`);
      const current = await loadEvaluationEvidence(tx, roomId, input.actor, true);
      const currentReadiness = transcriptEvaluationReadiness({ room: current.room, job: current.job, actor: input.actor, gateAllowed: current.gate.allowed, playback: current.playback });
      const currentRange = selectedRange(current.job, input.startSegmentId, input.endSegmentId);
      const currentReference = referenceForJob(current.job, new Set(currentRange.segmentIds), currentRange.startSeconds);
      const currentSnapshot = {
        ...snapshot,
        recordingAssetId: current.job.asset.id,
        sourceStartSeconds: currentRange.startSeconds,
        sourceDurationSeconds: currentRange.durationSeconds,
        sourceEndSeconds: currentRange.endSeconds,
        sourceSha256: currentReadiness.sourceSha256,
        sourceGeneration: text(current.job.sourceGeneration) || null,
        playbackSourceId: current.playback?.sourceId ?? null,
        consentVersionSha256: currentReadiness.consentVersionSha256,
        referenceRevisionId: currentReference.referenceRevisionId,
        referenceContentSha256: currentReference.referenceContentSha256,
        referenceWords: currentReference.referenceWords,
        sourceSegmentIds: currentReference.segmentIds,
        sourceReviewReceipts: currentReference.reviewReceipts,
        providerSnapshot: providerSnapshot(current.job, new Set(currentRange.segmentIds), currentRange.startSeconds),
      };
      if (!currentReadiness.eligible || sha256Value(currentSnapshot) !== windowKeySha256) {
        throw new TranscriptEvaluationWindowError("Transcript, consent, source, or review evidence changed during approval. Refresh and review again.", "EVALUATION_EVIDENCE_CHANGED", 409);
      }
      return tx.transcriptEvaluationWindow.create({
        data: {
          roomId,
          transcriptJobId: current.job.id,
          recordingAssetId: current.job.asset.id,
          approvedByUserId: input.actor.id,
          approvedByEmailSnapshot: text(input.actor.email) || null,
          clientRequestId,
          windowKeySha256,
          workload: selected.workload,
          conditionsJson: selected.conditions,
          sourceStartSeconds: currentRange.startSeconds,
          sourceEndSeconds: currentRange.endSeconds,
          sourceDurationSeconds: currentRange.durationSeconds,
          sourceSha256: currentReadiness.sourceSha256!,
          sourceGeneration: text(current.job.sourceGeneration) || null,
          playbackSourceId: current.playback!.sourceId,
          consentVersionSha256: currentReadiness.consentVersionSha256!,
          referenceRevisionId: currentReference.referenceRevisionId!,
          referenceContentSha256: currentReference.referenceContentSha256!,
          referenceWordsJson: currentReference.referenceWords,
          sourceSegmentIdsJson: currentReference.segmentIds,
          sourceReviewReceiptsJson: currentReference.reviewReceipts,
          sourcePlaybackEvidenceJson: sourcePlaybackEvidence,
          providerSnapshotJson: currentSnapshot.providerSnapshot,
          reviewNote: text(input.reviewNote) || "Approved from a complete playback-reviewed, transcript-aligned source window in Nest.",
          approvedAt: new Date(),
        },
      });
    }, { isolationLevel: "Serializable" });
    return { ok: true, idempotentReplay: false, window: publicWindow(saved, reference.referenceContentSha256), readiness };
  } catch (error) {
    const code = text(object(error).code);
    if (code !== "P2002" && code !== "P2034") throw error;
    const winner = await input.prisma.transcriptEvaluationWindow.findFirst({
      where: { OR: [
        { approvedByUserId: input.actor.id, clientRequestId },
        { windowKeySha256 },
      ] },
    });
    if (!winner || !replayMatches(winner, { roomId, transcriptJobId: evidence.job.id, windowKeySha256 })) throw new TranscriptEvaluationWindowError("Another evaluation-window approval won with different evidence. Refresh before retrying.", "EVALUATION_APPROVAL_CONFLICT", 409);
    return { ok: true, idempotentReplay: true, window: publicWindow(winner, reference.referenceContentSha256), readiness };
  }
}

export async function readTranscriptEvaluationReadiness(input: {
  prisma: any;
  actor: Actor;
  roomId: string;
}) {
  const evidence = await loadEvaluationEvidence(input.prisma, input.roomId, input.actor, false);
  return transcriptEvaluationReadiness({
    room: evidence.room,
    job: evidence.job,
    actor: input.actor,
    gateAllowed: evidence.gate.allowed,
    playback: evidence.playback,
  });
}
