import "server-only";
import type { TranscriptionProgressSource } from "../transcription-progress";
import { isOriginalSessionRecordingAsset } from "../session-recording-sources";
import { readSessionRecordingAttempts } from "./session-recording-attempts";
import { transcriptFailurePresentation } from "./transcript-failure-presentation";

import {
  readTranscriptCorrectionDesk,
  type TranscriptCorrectionActor,
} from "./transcript-corrections";
import {
  assembleSessionTranscriptProgramClock,
  SessionTranscriptAssemblyError,
} from "./session-transcript-assembly";
import {
  readSessionReviewedSourcePlacements,
  SessionReviewedSourcePlacementError,
} from "./session-reviewed-source-placement";
import {
  selectSessionTranscriptRecordingLanes,
  transcriptSourceCaptureGroupId,
  type SessionTranscriptSourceCandidate,
} from "./session-transcript-source-selection";

export const SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA =
  "quipsly-session-transcript-correction-desk-v1" as const;

type Candidate = SessionTranscriptSourceCandidate & {
  status: string;
  checksum: string | null;
  localManifestJson: unknown;
  participant?: {displayName: string | null} | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isParticipantIsolatedDesk(desk: any) {
  return (
    desk?.processing?.routing?.sourceTopology === "participant-isolated" &&
    desk.processing.routing.speakerAuthority === "source-binding"
  );
}

function sourceSummary(desk: any, source: Candidate, timing?: any) {
  return {
    transcriptJobId: desk.transcriptJobId,
    recordingAssetId: source.id,
    participantId: source.participantId,
    sourceSha256: text(desk.sourceSha256).toLowerCase() || null,
    recording: desk.recording,
    playback: desk.playback,
    spectralContext: desk.spectralContext,
    gate: desk.gate,
    processing: desk.processing,
    evidence: desk.evidence,
    captureGroupId:
      timing?.captureGroupId ??
      (transcriptSourceCaptureGroupId(source.localManifestJson) || null),
    programOffsetSeconds: timing?.programOffsetSeconds ?? 0,
    timingAuthority: timing?.timingAuthority ?? "single-source-origin",
    timingUncertaintyMilliseconds:
      timing?.timingUncertaintyMilliseconds ?? null,
    timingReviewRequired: timing?.timingReviewRequired ?? false,
    sampleAccurateClaimed: false as const,
  };
}

/**
 * Returns the ordinary correction desk as one Session conversation while
 * preserving each participant source as the authority for playback and writes.
 * Focused-source reads intentionally bypass assembly.
 */
export async function readSessionTranscriptCorrectionDesk(input: {
  prisma: any;
  roomId: string;
  actor: TranscriptCorrectionActor;
  recordingAssetId?: string | null;
  transcriptJobId?: string | null;
}) {
  const anchor = await readTranscriptCorrectionDesk(input);
  if (input.recordingAssetId || input.transcriptJobId) {
    return anchor;
  }

  const assets = (await input.prisma.recordingAsset.findMany({
    where: {
      roomId: input.roomId,
      kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] },
      participantId: { not: null },
      recordedStartedAt: { not: null },
    },
    orderBy: [{ recordedStartedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      participantId: true,
      participant: {select: {displayName: true}},
      kind: true,
      checksum: true,
      recordedStartedAt: true,
      recordedStoppedAt: true,
      localManifestJson: true,
      transcriptJobs: {
        where: { status: "COMPLETED", segments: { some: {} } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  })) as Candidate[];
  // Select the current take before deciding which sources are readable. An
  // unfinished upload must not disappear or expose an earlier take's words.
  // The canonical desk below still verifies source identity and readable bytes.
  const rows = assets.filter(isOriginalSessionRecordingAsset).map(source => ({
    ...source,
    transcriptJobs: source.status === "VERIFIED" ? source.transcriptJobs : [],
  }));
  const lanes = selectSessionTranscriptRecordingLanes({
    rows,
    attempts: await readSessionRecordingAttempts(input.prisma, input.roomId, rows),
  }).filter((source): source is Candidate => Boolean(source));
  const pendingLanes = lanes.filter(source => !source.transcriptJobs[0]?.id);
  const pendingCount = pendingLanes.length;
  const pendingJobs = pendingCount ? await input.prisma.transcriptJob.findMany({
    where: {roomId: input.roomId, assetId: {in: pendingLanes.map(source => source.id)}},
    orderBy: [{createdAt: "desc"}, {id: "desc"}],
    distinct: ["assetId"],
    select: {id: true, assetId: true, status: true, provider: true, errorMessage: true, _count: {select: {segments: true, words: true}}},
  }) : [];
  const pendingSources: TranscriptionProgressSource[] = pendingLanes.map(source => {
    if (source.status !== "VERIFIED") {
      const attention = ["HELD", "FAILED", "CORRUPTED", "QUARANTINED"].includes(source.status);
      return {recordingAssetId: source.id, participantLabel: text(source.participant?.displayName) || "Participant recording",
        transcriptJobId: null, status: attention ? "UPLOAD_ATTENTION" : "WAITING_FOR_UPLOAD",
        error: attention ? "Open Recordings to check this upload. Its transcript will appear here when the recording is available."
          : "Keep Quipsly open on the recording device until its upload finishes. The transcript will update here.",
        retryable: false};
    }
    const job = pendingJobs.find((job: any) => job.assetId === source.id);
    const failure = transcriptFailurePresentation(job);
    return {recordingAssetId: source.id, participantLabel: text(source.participant?.displayName) || "Participant recording",
      transcriptJobId: job?.id ?? null, status: job?.status ?? null, error: failure.errorMessage,
      failureCode: failure.failureCode, retryable: failure.failureCode ? failure.retryable : undefined};
  });
  const selected = lanes.filter(source => source.transcriptJobs[0]?.id);
  if (!selected.length) {
    if (pendingCount) {
      // Transcription readiness does not determine media availability. Resolve
      // only this take's verified sources through the same authorized desk;
      // the anchor may belong to an older take and must never fill this slot.
      const pendingDesks = await Promise.all(pendingLanes.filter(source => source.status === "VERIFIED").map(async source => {
        const desk = await readTranscriptCorrectionDesk({...input, recordingAssetId: source.id});
        if (desk.recording?.id !== source.id || desk.recording?.participantId !== source.participantId
          || !text(source.checksum) || text(desk.recording.sourceSha256).toLowerCase() !== text(source.checksum).toLowerCase()) return null;
        return {desk: {...desk, sourceSha256: desk.recording.sourceSha256}, source};
      }));
      const currentDesks = pendingDesks.filter((value): value is NonNullable<typeof value> => Boolean(value));
      const current = currentDesks.find(value => value.desk.gate?.allowed && value.desk.playback) ?? currentDesks.at(0);
      return {
        ...(current?.desk ?? {
          ...anchor,
          transcriptJobId: null, recording: null, playback: null, spectralContext: null,
          transcriptStatus: null, processing: null, evidence: null, sourceSha256: null,
          gate: { allowed: false, error: "This recording is not ready to play yet. Check its upload in Recordings." },
        }),
        segments: [], speakerGroups: [],
        sessionTranscript: {
          schema: SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA,
          status: "incomplete" as const,
          reason: "Transcription progress for this recording is shown below. Earlier recordings remain available in Recordings.",
          sourceCount: 0, pendingSourceCount: pendingCount, pendingSources, programClock: null,
          sources: currentDesks.map(value => sourceSummary(value.desk, value.source)),
        },
      };
    }
    return anchor;
  }

  const desks = await Promise.all(
    selected.map((source) =>
      readTranscriptCorrectionDesk({
        ...input,
        recordingAssetId: source.id,
        transcriptJobId: source.transcriptJobs[0]!.id,
      }),
    ),
  );
  const validDesk = (desk: any, index: number) =>
    desk.gate?.allowed &&
    isParticipantIsolatedDesk(desk) &&
    desk.transcriptJobId === selected[index]!.transcriptJobs[0]!.id &&
    desk.recording?.participantId === selected[index]!.participantId &&
    text(desk.sourceSha256).toLowerCase() ===
      text(selected[index]!.checksum).toLowerCase();
  const validDesks = desks.filter(validDesk);
  const visibleDesk = validDesks[0] ?? anchor;

  if (selected.length === 1 && validDesks.length === 1) {
    return {
      ...visibleDesk,
      sessionTranscript: {
        schema: SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA,
        status: pendingCount ? "incomplete" as const : "single-source" as const,
        reason:
          pendingCount ? "You can work with the available transcript now. Progress for the remaining recordings is shown below."
            : "Transcript from one participant recording.",
        sourceCount: 1,
        pendingSourceCount: pendingCount,
        pendingSources,
        programClock: null,
        sources: [sourceSummary(visibleDesk, selected[0]!)],
      },
    };
  }
  const invalidIndex = desks.findIndex(
    (desk, index) => !validDesk(desk, index),
  );
  if (invalidIndex >= 0) {
    return {
      ...visibleDesk,
      sessionTranscript: {
        schema: SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA,
        status: "incomplete" as const,
        reason:
          selected.length === 1
            ? "The participant-owned transcript is still held or changed identity. The current accessible transcript remains reviewable."
            : "Another participant source is still held or changed identity. The exact current source remains reviewable.",
        sourceCount: validDesks.length,
        pendingSourceCount: pendingCount,
        pendingSources,
        programClock: null,
        sources: desks.map((desk, index) =>
          sourceSummary(desk, selected[index]!),
        ),
      },
    };
  }

  try {
    const reviewedPlacements = await readSessionReviewedSourcePlacements({
      prisma: input.prisma,
      roomId: input.roomId,
      recordingAssetIds: selected.map((source) => source.id),
    });
    const programClock = assembleSessionTranscriptProgramClock(
      selected.map((source) => {
        const manifest = object(source.localManifestJson);
        return {
          recordingAssetId: source.id,
          transcriptJobId: source.transcriptJobs[0]!.id,
          captureGroupId: text(manifest.captureGroupId) || null,
          recordedStartedAt: source.recordedStartedAt,
          alignment: manifest.alignment,
        };
      }),
      { reviewedPlacements },
    );
    const timingByRecordingId = new Map(
      programClock.sources.map((source) => [source.recordingAssetId, source]),
    );
    const sources = desks.map((desk, index) =>
      sourceSummary(
        desk,
        selected[index]!,
        timingByRecordingId.get(selected[index]!.id),
      ),
    );
    const segments = desks
      .flatMap((desk, index) => {
        const source = sources[index]!;
        return desk.segments.map((segment: any) => ({
          ...segment,
          transcriptJobId: source.transcriptJobId,
          recordingAssetId: source.recordingAssetId,
          sourceStartSeconds: Number(segment.startSeconds),
          sourceEndSeconds: Number(segment.endSeconds),
          programStartSeconds:
            source.programOffsetSeconds + Number(segment.startSeconds),
          programEndSeconds:
            source.programOffsetSeconds + Number(segment.endSeconds),
          sourcePlayback: source.playback,
        }));
      })
      .sort(
        (left, right) =>
          left.programStartSeconds - right.programStartSeconds ||
          left.id.localeCompare(right.id),
      );

    return {
      ...desks[0],
      segments,
      sessionTranscript: {
        schema: SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA,
        status: pendingCount ? "incomplete" as const : "assembled" as const,
        reason: pendingCount ? "Available participant transcripts are on the timeline now. Progress for the remaining recordings is shown below." : programClock.reason,
        sourceCount: sources.length,
        pendingSourceCount: pendingCount,
        pendingSources,
        programClock,
        sources,
      },
    };
  } catch (error) {
    if (
      !(error instanceof SessionTranscriptAssemblyError) &&
      !(error instanceof SessionReviewedSourcePlacementError)
    )
      throw error;
    return {
      ...visibleDesk,
      sessionTranscript: {
        schema: SESSION_TRANSCRIPT_CORRECTION_DESK_SCHEMA,
        status: "held" as const,
        reason: error.message,
        sourceCount: desks.length,
        pendingSourceCount: pendingCount,
        pendingSources,
        programClock: null,
        sources: desks.map((desk, index) =>
          sourceSummary(desk, selected[index]!),
        ),
      },
    };
  }
}
