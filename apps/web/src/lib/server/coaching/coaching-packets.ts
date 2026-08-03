import { createHash, randomUUID } from "node:crypto";

import {
  TRANSCRIPT_ACTION_CANDIDATE_KIND,
  TRANSCRIPT_PACKET_SOURCE,
  buildTranscriptPacketBrief,
  createTranscriptActionCandidate,
  isTranscriptActionCandidate,
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionCandidate,
} from "@high-ground/quipsly-domain/coaching-packet";

import { coachingTranscriptReleaseGate } from "@/lib/server/coaching/transcript-release-gate";

type BuildCoachingPacketArgs = {
  prisma: any;
  transcriptJobId: string;
  authorUserId?: string | null;
  force?: boolean;
};

const ACTION_PATTERNS = [
  /\b(i|we|you|they)\s+(need|needs|should|will|can|could|must|have)\s+to\b/i,
  /\b(i'll|we'll|you'll|let's|follow up|send|schedule|prepare|finish|review|publish|record|write|draft|check)\b/i,
  /\b(next step|action item|homework|before next time|for next time)\b/i,
];

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sourceTextSha256(value: unknown) {
  return createHash("sha256").update(cleanText(value), "utf8").digest("hex");
}

function sourceLinkedSegment(segment: any) {
  const segmentId = String(segment.id);
  return {
    ...segment,
    id: segmentId,
    segmentIds: [segmentId],
    sourceTextSha256: sourceTextSha256(segment.text),
  };
}

function formatTime(seconds: unknown) {
  const numeric = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(numeric);
  const minutes = Math.floor(whole / 60);
  const remainingSeconds = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function segmentLine(segment: any) {
  const speaker = cleanText(segment.speakerLabel) || "Unknown speaker";
  return `- ${formatTime(segment.startSeconds)} ${speaker}: ${cleanText(segment.text)}`;
}

function scoreHighlight(segment: any) {
  const text = cleanText(segment.text);
  let score = Math.min(50, text.length / 8);
  if (/\?/.test(text)) score += 8;
  if (/\b(important|remember|realized|because|means|story|lesson|goal|stuck|change|decision|commitment)\b/i.test(text)) score += 12;
  if (ACTION_PATTERNS.some((pattern) => pattern.test(text))) score += 8;
  if (typeof segment.confidence === "number") score += segment.confidence * 5;
  return score;
}

function titleFromSegment(segment: any) {
  const text = cleanText(segment.text);
  const sentence = text.split(/[.!?]/).map((part) => part.trim()).find(Boolean) || text;
  const clipped = sentence.slice(0, 82);
  return clipped.length < sentence.length ? `${clipped}...` : clipped || "Session highlight";
}

function actionTitle(segment: any) {
  const text = cleanText(segment.text);
  const normalized = text.replace(/^(so|okay|ok|yeah|well|and|but)\s+/i, "");
  const sentence = normalized.split(/[.!?]/).map((part) => part.trim()).find(Boolean) || normalized;
  const clipped = sentence.slice(0, 96);
  return clipped.length < sentence.length ? `${clipped}...` : clipped || "Review this follow-up";
}

function actionCandidate(input: {
  segment: any;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
}): TranscriptActionCandidate {
  const segmentId = String(input.segment.id);
  const sourceText = cleanText(input.segment.text);
  return createTranscriptActionCandidate({
    id: `${TRANSCRIPT_ACTION_CANDIDATE_KIND}:${input.transcriptJobId}:${segmentId}`,
    title: actionTitle(input.segment),
    detail: segmentLine(input.segment),
    transcriptJobId: input.transcriptJobId,
    recordingAssetId: input.recordingAssetId,
    roomId: input.roomId,
    packetBuildId: input.packetBuildId,
    segmentId,
    segmentIds: Array.isArray(input.segment.segmentIds)
      ? input.segment.segmentIds.map(String)
      : [segmentId],
    sourceText,
    sourceTextSha256: cleanText(input.segment.sourceTextSha256)
      || sourceTextSha256(sourceText),
    sourceSpan: null,
    transcriptReviewStatus: "provider",
    speakerLabel: cleanText(input.segment.speakerLabel) || null,
    startSeconds: Number(input.segment.startSeconds) || 0,
    endSeconds: Number(input.segment.endSeconds) || 0,
  });
}

export function packetActionCandidatesFromSource(value: unknown): TranscriptActionCandidate[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const candidates = (value as Record<string, unknown>).actionCandidates;
  return Array.isArray(candidates) ? candidates.filter(isTranscriptActionCandidate) : [];
}

export function isUnreviewedTranscriptActionItem(item: any) {
  return isUnreviewedTranscriptActionItemSource(item?.sourceJson);
}

function summarizeSegments(segments: any[], brief: ReturnType<typeof buildTranscriptPacketBrief>) {
  const speakerCounts = new Map<string, number>();
  for (const segment of segments) {
    const speaker = cleanText(segment.speakerLabel) || "Unknown speaker";
    speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
  }
  const speakers = Array.from(speakerCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([speaker, count]) => `${speaker} (${count} turns)`);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const duration = last ? `${formatTime(first?.startSeconds ?? 0)}-${formatTime(last.endSeconds ?? 0)}` : "unknown duration";
  const opening = segments.slice(0, 3).map(segmentLine);
  const closing = segments.slice(-3).map(segmentLine);

  return [
    "Candidate session summary generated from transcript timing and speaker labels.",
    "",
    `Range: ${duration}`,
    `Speaker turn map: ${speakers.length ? speakers.join(", ") : "No speaker labels available"}`,
    "",
    ...brief.sections.flatMap((section) => [
      `${section.label}:`,
      ...(section.items.length
        ? section.items.map((item) => `- ${item.timeLabel} ${item.speakerLabel}: ${item.text}`)
        : ["- No source-linked candidates found."]),
      "",
    ]),
    "Opening context:",
    ...(opening.length ? opening : ["- No opening transcript segments available."]),
    "",
    "Closing context:",
    ...(closing.length ? closing : ["- No closing transcript segments available."]),
    "",
    "Review note: this is a deterministic first packet, not a final coaching interpretation. Human review should adjust emphasis, names, and follow-up commitments.",
  ].join("\n");
}

export async function buildCoachingPacketFromTranscriptJob(args: BuildCoachingPacketArgs) {
  const job = await args.prisma.transcriptJob.findUnique({
    where: { id: args.transcriptJobId },
    include: {
      room: { include: { booking: true } },
      asset: true,
      segments: { orderBy: { startSeconds: "asc" } },
    },
  });

  if (!job) {
    return { ok: false, status: 404, error: "Transcript job was not found." };
  }

  if (!job.asset) {
    return { ok: false, status: 409, error: "Transcript job has no recording asset evidence." };
  }

  const transcriptGate = await coachingTranscriptReleaseGate({
    prisma: args.prisma,
    recordingAsset: job.asset,
  });
  if (!transcriptGate.allowed) {
    return {
      ok: false,
      status: 409,
      errorCode: transcriptGate.errorCode,
      error: transcriptGate.error,
      explicitReleaseRequired: true,
    };
  }

  if (job.status !== "COMPLETED") {
    return { ok: false, status: 409, error: "Transcript must be completed before building a coaching packet." };
  }

  if (!job.segments.length) {
    return { ok: false, status: 409, error: "Transcript has no segments to turn into a coaching packet." };
  }

  const packetTitle = `Transcript packet: ${job.id}`;
  const existing = await args.prisma.coachingNote.findFirst({
    where: {
      roomId: job.roomId,
      kind: "SUMMARY",
      title: packetTitle,
    },
    include: { actionItems: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing && !args.force) {
    const existingSource = typeof existing.sourceJson === "object" && existing.sourceJson !== null
      ? existing.sourceJson as Record<string, unknown>
      : {};
    const actionCandidates = packetActionCandidatesFromSource(existingSource);
    const legacyCandidateRows = (existing.actionItems || []).filter(isUnreviewedTranscriptActionItem);
    const committedActionItems = (existing.actionItems || []).filter(
      (item: any) => !isUnreviewedTranscriptActionItem(item),
    );
    return {
      ok: true,
      transcriptJobId: job.id,
      roomId: job.roomId,
      summaryNoteId: existing.id,
      packetBuildId: cleanText(existingSource.packetBuildId) || null,
      actionCandidateIds: [
        ...actionCandidates.map((candidate) => candidate.id),
        ...legacyCandidateRows.map((item: any) => String(item.id)),
      ],
      actionCandidateCount: actionCandidates.length + legacyCandidateRows.length,
      actionItemCount: committedActionItems.length,
      reusedExistingPacket: true,
    };
  }

  const packetSegments = job.segments.map(sourceLinkedSegment);
  const highlights = [...packetSegments]
    .map((segment: any) => ({ segment, score: scoreHighlight(segment) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.segment);

  const actionSegments = packetSegments
    .filter((segment: any) => ACTION_PATTERNS.some((pattern) => pattern.test(cleanText(segment.text))))
    .slice(0, 10);

  const packetBuildId = randomUUID();
  const actionCandidates: TranscriptActionCandidate[] = actionSegments.map((segment: any) => actionCandidate({
    segment,
    transcriptJobId: job.id,
    recordingAssetId: job.asset.id,
    roomId: job.roomId,
    packetBuildId,
  }));
  const packetBrief = buildTranscriptPacketBrief(packetSegments, highlights, actionSegments);

  const sourceJson = {
    source: TRANSCRIPT_PACKET_SOURCE,
    transcriptJobId: job.id,
    recordingAssetId: job.asset.id,
    roomId: job.roomId,
    packetBuildId,
    provider: job.provider,
    generatedAt: new Date().toISOString(),
    deterministic: true,
    reviewRequired: true,
  };

  const summaryNote = await args.prisma.coachingNote.create({
    data: {
      roomId: job.roomId,
      bookingId: job.room?.bookingId ?? null,
      authorUserId: args.authorUserId || null,
      kind: "SUMMARY",
      title: packetTitle,
      body: summarizeSegments(job.segments, packetBrief),
      sourceJson: {
        ...sourceJson,
        packetBrief,
        actionCandidateKind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
        actionCandidates,
        actionCandidateCount: actionCandidates.length,
        actionCandidateReviewBoundary:
          "Transcript inference remains a review candidate until a human explicitly accepts it into a separate ActionItem record.",
      },
    },
  });

  const highlightNotes = [];
  for (const segment of highlights) {
    const note = await args.prisma.coachingNote.create({
      data: {
        roomId: job.roomId,
        bookingId: job.room?.bookingId ?? null,
        authorUserId: args.authorUserId || null,
        kind: "HIGHLIGHT",
        title: titleFromSegment(segment),
        body: segmentLine(segment),
        sourceJson: {
          ...sourceJson,
          segmentId: segment.id,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          speakerLabel: segment.speakerLabel,
        },
      },
    });
    highlightNotes.push(note);
  }

  return {
    ok: true,
    transcriptJobId: job.id,
    roomId: job.roomId,
    summaryNoteId: summaryNote.id,
    packetBuildId,
    highlightNoteIds: highlightNotes.map((note: any) => note.id),
    actionCandidateIds: actionCandidates.map((candidate: TranscriptActionCandidate) => candidate.id),
    actionItemIds: [],
    highlightCount: highlightNotes.length,
    actionCandidateCount: actionCandidates.length,
    actionItemCount: 0,
    reusedExistingPacket: false,
  };
}
