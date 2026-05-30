import {
  type DerivedSegment,
  type EpisodeManifest,
  type EpisodeTranscript,
  type ProgramState,
  type TranscriptSegment,
} from "@high-ground/studio-cut-schema";
import type {
  AgentDecisionOperation,
  AgentDecisionOpsPayload,
} from "./agentDecisionOps";

export type TranscriptReviewTask = {
  priority: "high" | "medium" | "low";
  kind:
    | "transcript_episode_mismatch"
    | "transcript_gap"
    | "transcript_clip_reference"
    | "transcript_filler_cluster"
    | "transcript_speaker_state_mismatch";
  message: string;
  segmentId?: string;
  speakerRole?: string;
  currentState?: ProgramState;
  startSourceTimeMs?: number;
  endSourceTimeMs?: number;
  suggestedOperation?: Extract<AgentDecisionOperation, { op: "addDecision" }>;
  suggestedOperations?: AgentDecisionOperation[];
};

export type TranscriptReview = {
  status: "missing" | "ready" | "check";
  summary: {
    episodeId?: string;
    segmentCount: number;
    wordCount: number;
    transcriptDurationMs: number;
    coveragePercent: number;
    largestGapMs: number;
    speakerDurationsMs: Record<string, number>;
    speakerSegmentCounts: Record<string, number>;
    clipReferenceCount: number;
    fillerMarkerCount: number;
  };
  tasks: TranscriptReviewTask[];
  warnings: string[];
};

export function buildTranscriptReview({
  manifest,
  transcript,
  derivedSegments,
  sourceDurationMs,
}: {
  manifest: EpisodeManifest | null;
  transcript: EpisodeTranscript | null;
  derivedSegments: readonly DerivedSegment[];
  sourceDurationMs: number;
}): TranscriptReview {
  if (!transcript) {
    return {
      status: "missing",
      summary: createEmptyTranscriptSummary(),
      tasks: [],
      warnings: ["No timed transcript imported."],
    };
  }

  const warnings: string[] = [];
  const tasks: TranscriptReviewTask[] = [];
  const summary = createEmptyTranscriptSummary(transcript.episodeId);
  const sortedSegments = [...transcript.segments].sort(
    (firstSegment, secondSegment) =>
      firstSegment.startSourceTimeMs - secondSegment.startSourceTimeMs ||
      firstSegment.endSourceTimeMs - secondSegment.endSourceTimeMs ||
      firstSegment.id.localeCompare(secondSegment.id),
  );
  const hasClipPane = Boolean(manifest?.sourceMonitorProxy.panes.clip);
  const speakerFocusThresholdMs = Math.min(
    Math.max(Math.round(sourceDurationMs / 20), 3000),
    30000,
  );
  let previousEndMs = 0;

  if (manifest && transcript.episodeId !== manifest.id) {
    warnings.push(
      `Transcript episodeId ${transcript.episodeId} does not match manifest ${manifest.id}.`,
    );
    tasks.push({
      priority: "high",
      kind: "transcript_episode_mismatch",
      message:
        "Imported transcript targets a different episode id. Verify before using transcript-aware suggestions.",
    });
  }

  for (const segment of sortedSegments) {
    const startMs = clampMs(segment.startSourceTimeMs, sourceDurationMs);
    const endMs = clampMs(segment.endSourceTimeMs, sourceDurationMs);
    const durationMs = Math.max(0, endMs - startMs);
    const gapBeforeMs = Math.max(0, startMs - previousEndMs);
    const speakerRole = segment.speakerRole ?? inferSpeakerRole(segment.speaker);
    const text = segment.text.toLowerCase();
    const wordCount = countWords(text);

    previousEndMs = Math.max(previousEndMs, endMs);
    summary.segmentCount += 1;
    summary.wordCount += wordCount;
    summary.transcriptDurationMs += durationMs;
    summary.largestGapMs = Math.max(summary.largestGapMs, gapBeforeMs);
    summary.speakerDurationsMs[speakerRole] =
      (summary.speakerDurationsMs[speakerRole] ?? 0) + durationMs;
    summary.speakerSegmentCounts[speakerRole] =
      (summary.speakerSegmentCounts[speakerRole] ?? 0) + 1;

    if (gapBeforeMs >= 5000) {
      const gapStartMs = startMs - gapBeforeMs;
      const restoreState = getStateAtSourceTime(derivedSegments, startMs);
      tasks.push({
        priority: "medium",
        kind: "transcript_gap",
        message: `Transcript gap before ${formatSourceTime(startMs)} lasts ${formatSourceTime(gapBeforeMs)}.`,
        startSourceTimeMs: gapStartMs,
        endSourceTimeMs: startMs,
        suggestedOperations: [
          {
            op: "setRangeState",
            startSourceTimeMs: gapStartMs,
            endSourceTimeMs: startMs,
            state: "cut",
            ...(restoreState ? { restoreState } : {}),
            note: "Transcript gap; review before cutting inactive/silent span.",
            confidence: 0.45,
            approvalRequired: true,
            reason: "Transcript gap may indicate silence, missing transcript, or sync drift.",
          },
        ],
      });
    }

    if (mentionsClip(text)) {
      summary.clipReferenceCount += 1;
      tasks.push({
        priority: hasClipPane ? "medium" : "high",
        kind: "transcript_clip_reference",
        message:
          "Transcript references looking/showing/watching something; review whether a Clip semantic state belongs here.",
        segmentId: segment.id,
        speakerRole,
        startSourceTimeMs: startMs,
        endSourceTimeMs: endMs,
        ...(hasClipPane
          ? {
              suggestedOperation: {
                op: "addDecision",
                sourceTimeMs: startMs,
                state: getClipStateForSpeaker(speakerRole),
                note: "Transcript appears to reference visual clip context; verify before applying.",
                confidence: 0.65,
                approvalRequired: true,
                reason: "Transcript references on-screen visual context.",
              },
            }
          : {}),
      });
    }

    const fillerHits = countFillerHits(text);
    summary.fillerMarkerCount += fillerHits;
    if (fillerHits >= 3) {
      const restoreState = getStateAtSourceTime(derivedSegments, endMs);
      tasks.push({
        priority: "low",
        kind: "transcript_filler_cluster",
        message: `Transcript segment has ${fillerHits} filler markers; review for a possible tightening edit.`,
        segmentId: segment.id,
        startSourceTimeMs: startMs,
        endSourceTimeMs: endMs,
        suggestedOperations: [
          {
            op: "setRangeState",
            startSourceTimeMs: startMs,
            endSourceTimeMs: endMs,
            state: "cut",
            ...(restoreState ? { restoreState } : {}),
            note: "Filler cluster; verify before tightening.",
            confidence: 0.35,
            approvalRequired: true,
            reason: "Transcript contains repeated filler markers.",
          },
        ],
      });
    }

    if (
      durationMs >= speakerFocusThresholdMs &&
      (speakerRole === "charlie" || speakerRole === "homer")
    ) {
      const currentState = getStateAtSourceTime(derivedSegments, startMs);
      if (currentState && currentState !== speakerRole && currentState !== "both") {
        tasks.push({
          priority: "medium",
          kind: "transcript_speaker_state_mismatch",
          message: `${speakerRole} speaks for ${formatSourceTime(durationMs)} starting at ${formatSourceTime(startMs)}, but current state is ${currentState}.`,
          segmentId: segment.id,
          speakerRole,
          currentState,
          startSourceTimeMs: startMs,
          endSourceTimeMs: endMs,
          suggestedOperation: {
            op: "addDecision",
            sourceTimeMs: startMs,
            state: speakerRole,
            note: "Transcript speaker focus mismatch; verify before applying.",
            confidence: 0.7,
            approvalRequired: true,
            reason: "Transcript speaker focus differs from the current program state.",
          },
        });
      }
    }
  }

  summary.transcriptDurationMs = Math.min(
    summary.transcriptDurationMs,
    sourceDurationMs,
  );
  summary.coveragePercent = sourceDurationMs
    ? roundTo(summary.transcriptDurationMs / sourceDurationMs, 4)
    : 0;

  if (summary.coveragePercent < 0.5) {
    warnings.push(
      `Transcript covers only ${Math.round(summary.coveragePercent * 100)}% of episode duration.`,
    );
  }

  if (summary.largestGapMs >= 30000) {
    warnings.push(
      `Transcript has a large gap of ${formatSourceTime(summary.largestGapMs)}.`,
    );
  }

  return {
    status: warnings.length > 0 || tasks.length > 0 ? "check" : "ready",
    summary,
    tasks,
    warnings,
  };
}

export function buildTranscriptSuggestedDecisionOps({
  projectId,
  branchId,
  review,
}: {
  projectId: string;
  branchId: string;
  review: TranscriptReview;
}): AgentDecisionOpsPayload {
  const seenOperations = new Set<string>();
  const operations = review.tasks.flatMap((task) => {
    const suggestedOperations = [
      ...(task.suggestedOperation ? [task.suggestedOperation] : []),
      ...(task.suggestedOperations ?? []),
    ];

    if (suggestedOperations.length === 0) {
      return [];
    }

    return suggestedOperations.flatMap((suggestedOperation) => {
      const operation = normalizeTranscriptSuggestedOperation(
        suggestedOperation,
        task,
      );
      const operationKey = getSuggestedOperationKey(operation);

      if (seenOperations.has(operationKey)) {
        return [];
      }

      seenOperations.add(operationKey);
      return [operation];
    });
  });

  return {
    schemaVersion: 1,
    projectId,
    branchId,
    operations,
  };
}

function normalizeTranscriptSuggestedOperation(
  operation: AgentDecisionOperation,
  task: TranscriptReviewTask,
): AgentDecisionOperation {
  const taskNote = [
    operation.op === "addDecision" || operation.op === "setRangeState"
      ? operation.note
      : "",
    `Transcript task: ${task.kind}`,
    task.segmentId ? `segment ${task.segmentId}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (operation.op === "addDecision") {
    return {
      ...operation,
      sourceTimeMs: Math.max(0, Math.round(operation.sourceTimeMs)),
      note: taskNote,
    };
  }

  if (operation.op === "setRangeState") {
    return {
      ...operation,
      startSourceTimeMs: Math.max(0, Math.round(operation.startSourceTimeMs)),
      endSourceTimeMs: Math.max(0, Math.round(operation.endSourceTimeMs)),
      note: taskNote,
    };
  }

  return operation;
}

function getSuggestedOperationKey(operation: AgentDecisionOperation) {
  if (operation.op === "addDecision") {
    return `${operation.op}:${operation.sourceTimeMs}:${operation.state}`;
  }

  if (operation.op === "setRangeState") {
    return `${operation.op}:${operation.startSourceTimeMs}:${operation.endSourceTimeMs}:${operation.state}`;
  }

  return `${operation.op}:${operation.id}`;
}

function createEmptyTranscriptSummary(episodeId?: string): TranscriptReview["summary"] {
  return {
    ...(episodeId ? { episodeId } : {}),
    segmentCount: 0,
    wordCount: 0,
    transcriptDurationMs: 0,
    coveragePercent: 0,
    largestGapMs: 0,
    speakerDurationsMs: {},
    speakerSegmentCounts: {},
    clipReferenceCount: 0,
    fillerMarkerCount: 0,
  };
}

function getStateAtSourceTime(
  segments: readonly DerivedSegment[],
  sourceTimeMs: number,
) {
  return segments.find(
    (segment) =>
      segment.startSourceTimeMs <= sourceTimeMs &&
      sourceTimeMs < (segment.endSourceTimeMs ?? Number.POSITIVE_INFINITY),
  )?.state;
}

function getClipStateForSpeaker(speakerRole: string): ProgramState {
  if (speakerRole === "charlie") {
    return "charlie_clip";
  }

  if (speakerRole === "homer") {
    return "homer_clip";
  }

  return "both_clip";
}

function inferSpeakerRole(speaker: string) {
  const normalized = speaker.toLowerCase();
  if (normalized.includes("charlie")) {
    return "charlie";
  }

  if (normalized.includes("homer")) {
    return "homer";
  }

  return "unknown";
}

function mentionsClip(text: string) {
  return [
    "watch this",
    "watch the",
    "look at",
    "show this",
    "show the",
    "pull up",
    "on screen",
    "the clip",
    "this clip",
    "video",
    "screen share",
  ].some((phrase) => text.includes(phrase));
}

function countFillerHits(text: string) {
  const padded = ` ${text.replace(/[,.?]/g, " ")} `;
  return [" um ", " uh ", " er ", " ah ", " you know ", " kind of ", " sort of "].reduce(
    (count, phrase) => count + padded.split(phrase).length - 1,
    0,
  );
}

function countWords(text: string) {
  return text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampMs(value: number, durationMs: number) {
  return Math.min(durationMs, Math.max(0, Math.round(value)));
}

function roundTo(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatSourceTime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
