import { createHash, randomUUID } from "node:crypto";
import {
  TRANSCRIPT_ACTION_CANDIDATE_KIND,
  TRANSCRIPT_PACKET_SOURCE,
  buildTranscriptPacketBrief,
  createTranscriptActionCandidate,
  isTranscriptActionCandidate,
  isTranscriptActionReviewStatus,
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionCandidate,
} from "@high-ground/quipsly-domain/coaching-packet";

import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

type BuildCoachingPacketArgs = {
  prisma: any;
  transcriptJobId: string;
  authorUserId?: string | null;
  force?: boolean;
};

type SessionPacketPurpose = "COACHING" | "PODCAST" | "RESEARCH_INTERVIEW" | "INTERNAL_MEETING";

const SESSION_PACKET_TEMPLATE_VERSION = "quipsly-session-packet-v3";
export const TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA = "quipsly-transcript-packet-snapshot-v1";

const ACTION_PATTERNS = [
  /\b(i|we|you|they)\s+(need|needs|should|will|can|could|must|have)\s+to\b/i,
  /\b(i'll|we'll|you'll|let's|follow up|send|schedule|prepare|finish|review|publish|record|write|draft|check)\b/i,
  /\b(next step|action item|homework|before next time|for next time)\b/i,
];

export type { TranscriptActionCandidate } from "@high-ground/quipsly-domain/coaching-packet";

const REVIEW_LANE_DEFINITIONS = [
  {
    id: "client-follow-up",
    label: "Client follow-up notes",
    meaning: "Candidate notes that may become client-facing recap material after human review.",
    pattern: /\b(client|coachee|you|goal|stuck|decision|commitment|homework|follow up|next step)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "coaching-insights",
    label: "Insights and decisions",
    meaning: "Candidate insights and decisions to review without exposing private coach interpretation.",
    pattern: /\b(insight|realized|learned|decision|decided|pattern|meaning|important|changed|understand)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "obstacles-and-support",
    label: "Obstacles and support",
    meaning: "Candidate obstacles, resources, and support to revisit with the client.",
    pattern: /\b(stuck|block|obstacle|hard|difficult|support|help|resource|accountability|challenge)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "goals-and-tasks",
    label: "Goals and tasks",
    meaning: "Candidate commitments, goals, and todos that may become Nest tasks or coaching goals.",
    pattern: /\b(goal|task|todo|to-do|commit|commitment|before next|for next|need to|should|will|finish|prepare)\b/i,
    purposes: ["COACHING", "PODCAST", "RESEARCH_INTERVIEW", "INTERNAL_MEETING"],
  },
  {
    id: "next-session-prep",
    label: "Next-session prep",
    meaning: "Material that helps prepare the next coaching, podcast, or research session.",
    pattern: /\b(next session|next time|before we meet|bring back|follow up|prep|prepare|homework|review)\b/i,
    purposes: ["COACHING", "PODCAST", "RESEARCH_INTERVIEW", "INTERNAL_MEETING"],
  },
  {
    id: "podcast-production",
    label: "Podcast and episode notes",
    meaning: "Candidate beats, episode notes, title ideas, and production hooks for podcast or video work.",
    pattern: /\b(podcast|episode|clip|short|youtube|video|publish|title|hook|segment|chapter|article|post)\b/i,
    purposes: ["PODCAST"],
  },
  {
    id: "fact-checks-and-rights",
    label: "Fact checks and source rights",
    meaning: "Claims, sources, clips, sponsors, and rights questions to verify before publication.",
    pattern: /\b(fact|check|source|citation|claim|rights|license|permission|copyright|sponsor|verify)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW"],
  },
  {
    id: "quote-candidates",
    label: "Quote candidates",
    meaning: "Memorable lines that may become quote cards, social copy, article pull quotes, or QuipLore seeds.",
    pattern: /\b(remember|truth|lesson|means|because|story|wisdom|quote|important|realized|learned)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW"],
  },
  {
    id: "article-seeds",
    label: "Article and post seeds",
    meaning: "Ideas that may become articles, posts, book notes, or research packets.",
    pattern: /\b(article|post|write|draft|book|research|source|example|lesson|story|framework|principle)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW"],
  },
  {
    id: "clip-candidates",
    label: "Clip candidates",
    meaning: "Moments with enough shape or energy to review as possible short clips.",
    pattern: /\?|\b(wait|wow|love|huge|funny|story|example|realized|important|problem|answer|mistake)\b/i,
    purposes: ["PODCAST"],
  },
] as const;

function packetPurpose(value: unknown): SessionPacketPurpose {
  return ["COACHING", "PODCAST", "RESEARCH_INTERVIEW", "INTERNAL_MEETING"].includes(cleanText(value))
    ? cleanText(value) as SessionPacketPurpose
    : "COACHING";
}

export function reviewLaneDefinitionsForPurpose(value: unknown) {
  const purpose = packetPurpose(value);
  return REVIEW_LANE_DEFINITIONS.filter((lane) => (lane.purposes as readonly string[]).includes(purpose));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function packetSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function reviewTime(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export type PacketTranscriptSegment = {
  id: string;
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number | null;
  providerText: string;
  providerSpeakerLabel: string | null;
  providerTextSha256: string;
  reviewStatus: "provider" | "human-reviewed";
  acceptedReviewId: string | null;
  acceptedCorrectionId: string | null;
};

/**
 * Resolves immutable provider segments into the exact text packet builders may
 * read. Accepted corrections are overlays; a current confirmed-as-is receipt
 * advances review status without changing provider text.
 */
export function projectTranscriptSegmentsForPacket(segments: unknown): PacketTranscriptSegment[] {
  return (Array.isArray(segments) ? segments : []).map((segment) => {
    const providerText = typeof segment?.text === "string" ? segment.text : "";
    const providerSpeakerLabel = cleanText(segment?.speakerLabel) || null;
    const providerTextSha256 = packetSha256(providerText);
    const acceptedCorrection = [...(Array.isArray(segment?.corrections) ? segment.corrections : [])]
      .filter((correction) => correction?.status === "accepted"
        && correction?.baseTextSha256 === providerTextSha256
        && (cleanText(correction?.expectedSpeakerLabel) || null) === providerSpeakerLabel)
      .sort((left, right) => reviewTime(right?.updatedAt) - reviewTime(left?.updatedAt))[0] ?? null;
    const acceptedVerification = acceptedCorrection ? null : [...(Array.isArray(segment?.verifications) ? segment.verifications : [])]
      .filter((verification) => verification?.reviewKind === "confirmed-as-is"
        && verification?.providerTextSha256 === providerTextSha256
        && (cleanText(verification?.providerSpeakerLabel) || null) === providerSpeakerLabel)
      .sort((left, right) => reviewTime(right?.createdAt) - reviewTime(left?.createdAt))[0] ?? null;
    const correctedText = cleanText(acceptedCorrection?.correctedText);
    const correctedSpeaker = cleanText(acceptedCorrection?.correctedSpeakerLabel);
    const acceptedReviewId = cleanText(acceptedCorrection?.id) || cleanText(acceptedVerification?.id) || null;

    return {
      id: String(segment?.id ?? ""),
      speakerLabel: correctedSpeaker || providerSpeakerLabel,
      startSeconds: Number(segment?.startSeconds),
      endSeconds: Number(segment?.endSeconds),
      text: correctedText || cleanText(providerText),
      confidence: typeof segment?.confidence === "number" ? segment.confidence : null,
      providerText,
      providerSpeakerLabel,
      providerTextSha256,
      reviewStatus: acceptedReviewId ? "human-reviewed" : "provider",
      acceptedReviewId,
      acceptedCorrectionId: cleanText(acceptedCorrection?.id) || null,
    };
  });
}

export function transcriptPacketSnapshot(segments: unknown) {
  const projected = projectTranscriptSegmentsForPacket(segments);
  const segmentReviews = projected.map((segment) => ({
    segmentId: segment.id,
    providerTextSha256: segment.providerTextSha256,
    resolvedTextSha256: packetSha256(segment.text),
    resolvedSpeakerLabel: segment.speakerLabel,
    acceptedReviewId: segment.acceptedReviewId,
    acceptedCorrectionId: segment.acceptedCorrectionId,
    reviewStatus: segment.reviewStatus,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
  }));
  const sha256 = packetSha256(JSON.stringify(segmentReviews));
  return {
    schema: TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA,
    sha256,
    segmentCount: projected.length,
    humanReviewedSegmentCount: projected.filter((segment) => segment.reviewStatus === "human-reviewed").length,
    providerOnlySegmentCount: projected.filter((segment) => segment.reviewStatus === "provider").length,
    segmentReviews,
    projected,
  };
}

export function packetSnapshotMatches(sourceJson: unknown, segments: unknown) {
  const source = typeof sourceJson === "object" && sourceJson !== null && !Array.isArray(sourceJson)
    ? sourceJson as Record<string, unknown>
    : {};
  const snapshot = typeof source.transcriptSnapshot === "object" && source.transcriptSnapshot !== null && !Array.isArray(source.transcriptSnapshot)
    ? source.transcriptSnapshot as Record<string, unknown>
    : {};
  const current = transcriptPacketSnapshot(segments);
  return snapshot.schema === TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA
    && snapshot.sha256 === current.sha256;
}

function noteTime(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestPacketNote(left: any, right: any) {
  const createdDelta = noteTime(right?.createdAt) - noteTime(left?.createdAt);
  if (createdDelta !== 0) return createdDelta;
  const updatedDelta = noteTime(right?.updatedAt) - noteTime(left?.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;
  return cleanText(right?.id).localeCompare(cleanText(left?.id));
}

export function selectLatestCorrelatedPacketNotes(packetNotes: any[]) {
  const summaries = packetNotes
    .filter((note) => note?.kind === "SUMMARY")
    .sort(newestPacketNote);
  const summary = summaries[0] || null;
  const summarySource = typeof summary?.sourceJson === "object" && summary.sourceJson !== null
    ? summary.sourceJson as Record<string, unknown>
    : {};
  const packetBuildId = cleanText(summarySource.packetBuildId);
  const allHighlights = packetNotes.filter((note) => note?.kind === "HIGHLIGHT");
  const highlights = packetBuildId
    ? allHighlights.filter((note) => {
        const source = typeof note?.sourceJson === "object" && note.sourceJson !== null
          ? note.sourceJson as Record<string, unknown>
          : {};
        return cleanText(source.packetBuildId) === packetBuildId;
      })
    : allHighlights;

  return {
    summary,
    highlights,
    packetBuildId: packetBuildId || null,
    correlationMode: packetBuildId ? "PACKET_BUILD_ID" as const : "LEGACY_TRANSCRIPT_FALLBACK" as const,
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

function transcriptActionCandidate(input: {
  segment: any;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
}): TranscriptActionCandidate {
  const segmentId = String(input.segment.id);
  return createTranscriptActionCandidate({
    id: `${TRANSCRIPT_ACTION_CANDIDATE_KIND}:${input.transcriptJobId}:${segmentId}`,
    title: actionTitle(input.segment),
    detail: segmentLine(input.segment),
    transcriptJobId: input.transcriptJobId,
    recordingAssetId: input.recordingAssetId,
    roomId: input.roomId,
    packetBuildId: input.packetBuildId,
    segmentId,
    speakerLabel: cleanText(input.segment.speakerLabel) || null,
    startSeconds: Number(input.segment.startSeconds) || 0,
    endSeconds: Number(input.segment.endSeconds) || 0,
  });
}

export function packetActionCandidatesFromSource(value: unknown): TranscriptActionCandidate[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const source = value as Record<string, unknown>;
  const candidates = source.actionCandidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (isTranscriptActionCandidate(candidate)) return [candidate];
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    if (
      record.kind !== TRANSCRIPT_ACTION_CANDIDATE_KIND
      || !cleanText(record.id)
      || !cleanText(record.title)
      || !cleanText(record.segmentId)
    ) return [];
    // Read compatibility for packet candidates created before the correlated
    // provenance fields were required. The enclosing summary supplies any
    // evidence that existed at that time; review still fails closed if a
    // complete binding cannot be reconstructed.
    return [{
      id: cleanText(record.id),
      kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
      reviewStatus: isTranscriptActionReviewStatus(record.reviewStatus)
        ? record.reviewStatus
        : "READY_FOR_HUMAN_REVIEW",
      title: cleanText(record.title),
      detail: cleanText(record.detail),
      transcriptJobId: cleanText(record.transcriptJobId) || cleanText(source.transcriptJobId),
      recordingAssetId: cleanText(record.recordingAssetId) || cleanText(source.recordingAssetId),
      roomId: cleanText(record.roomId) || cleanText(source.roomId),
      packetBuildId: cleanText(record.packetBuildId) || cleanText(source.packetBuildId),
      segmentId: cleanText(record.segmentId),
      speakerLabel: cleanText(record.speakerLabel) || null,
      startSeconds: typeof record.startSeconds === "number" ? record.startSeconds : 0,
      endSeconds: typeof record.endSeconds === "number" ? record.endSeconds : 0,
      humanApprovalRequired: typeof record.humanApprovalRequired === "boolean"
        ? record.humanApprovalRequired
        : true,
      committedActionItemId: cleanText(record.committedActionItemId) || null,
    } satisfies TranscriptActionCandidate];
  });
}

/**
 * Older packet builds persisted inferred candidates as OPEN ActionItem rows. We
 * leave those rows intact for auditability, but callers must keep treating them
 * as review candidates until an explicit accept flow materializes a non-candidate
 * ActionItem. This avoids a destructive compatibility migration.
 */
export function isUnreviewedTranscriptActionItem(item: any) {
  return isUnreviewedTranscriptActionItemSource(item?.sourceJson);
}

function legacyActionCandidate(item: any): TranscriptActionCandidate | null {
  if (!isUnreviewedTranscriptActionItem(item)) return null;
  const source = item.sourceJson as Record<string, unknown>;
  const transcriptJobId = cleanText(source.transcriptJobId);
  const recordingAssetId = cleanText(source.recordingAssetId);
  const roomId = cleanText(source.roomId) || cleanText(item.roomId);
  const packetBuildId = cleanText(source.packetBuildId);
  const segmentId = cleanText(source.segmentId) || String(item.id);
  return {
    id: `${TRANSCRIPT_ACTION_CANDIDATE_KIND}:${transcriptJobId || "legacy"}:${segmentId}`,
    kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
    reviewStatus: "READY_FOR_HUMAN_REVIEW",
    title: cleanText(item.title) || "Review this follow-up",
    detail: cleanText(item.detail),
    transcriptJobId,
    recordingAssetId,
    roomId,
    packetBuildId,
    segmentId,
    speakerLabel: cleanText(source.speakerLabel) || null,
    startSeconds: typeof source.startSeconds === "number" ? source.startSeconds : 0,
    endSeconds: typeof source.endSeconds === "number" ? source.endSeconds : 0,
    humanApprovalRequired: true,
    committedActionItemId: null,
  };
}

export function mergePacketActionCandidates(input: {
  sourceJson: unknown;
  legacyActionItems?: any[];
}) {
  const candidates = packetActionCandidatesFromSource(input.sourceJson);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const item of input.legacyActionItems || []) {
    const candidate = legacyActionCandidate(item);
    if (candidate && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return Array.from(byId.values());
}

function segmentPreview(segment: any) {
  const text = cleanText(segment.text);
  return {
    segmentId: segment.id,
    speakerLabel: cleanText(segment.speakerLabel) || "Unknown speaker",
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    timeLabel: `${formatTime(segment.startSeconds)}-${formatTime(segment.endSeconds)}`,
    text: text.length > 240 ? `${text.slice(0, 237)}...` : text,
  };
}

export { buildTranscriptPacketBrief } from "@high-ground/quipsly-domain/coaching-packet";

function buildTranscriptPacketReviewLanes(purpose: SessionPacketPurpose, segments: any[], highlights: any[], actionSegments: any[]) {
  const laneCandidates = reviewLaneDefinitionsForPurpose(purpose).map((lane) => {
    const seen = new Set<string>();
    const matches = [];
    const pool = lane.id === "goals-and-tasks" || lane.id === "next-session-prep"
      ? [...actionSegments, ...highlights, ...segments]
      : [...highlights, ...segments];

    for (const segment of pool) {
      if (matches.length >= 5) break;
      const id = String(segment.id || `${segment.startSeconds}-${segment.endSeconds}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const text = cleanText(segment.text);
      if (!text || !lane.pattern.test(text)) continue;
      matches.push(segmentPreview(segment));
    }

    return {
      id: lane.id,
      label: lane.label,
      status: matches.length ? "READY_FOR_HUMAN_REVIEW" : "EMPTY",
      itemCount: matches.length,
      meaning: lane.meaning,
      sourceTruth: "Derived from transcript segments only; recording assets remain source truth.",
      reviewRule:
        "Human approval is required before this lane becomes client notes, goals, podcast copy, shorts, articles, quotes, or published material.",
      items: matches,
    };
  });

  return laneCandidates.map((lane) => ({
    ...lane,
    humanApprovalRequired: true,
    externalSideEffects: false,
  }));
}

function summarizeSegments(
  purpose: SessionPacketPurpose,
  segments: any[],
  brief: ReturnType<typeof buildTranscriptPacketBrief>,
) {
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
    purpose === "PODCAST"
      ? "Candidate podcast production packet generated from transcript timing and speaker labels."
      : purpose === "COACHING"
        ? "Candidate private coaching packet generated from transcript timing and speaker labels."
        : "Candidate session packet generated from transcript timing and speaker labels.",
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
    "Review note: this is a deterministic candidate packet, not a final interpretation or publication. Human review must adjust emphasis, names, visibility, and follow-through commitments.",
  ].join("\n");
}

export async function buildCoachingPacketFromTranscriptJob(args: BuildCoachingPacketArgs) {
  const job = await args.prisma.transcriptJob.findUnique({
    where: { id: args.transcriptJobId },
    include: {
      room: { include: { booking: true } },
      asset: true,
      segments: {
        orderBy: { startSeconds: "asc" },
        include: {
          corrections: {
            where: { status: "accepted" },
            orderBy: { updatedAt: "desc" },
          },
          verifications: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  if (!job) {
    return { ok: false, status: 404, error: "Transcript job was not found." };
  }

  if (!job.asset) {
    return { ok: false, status: 409, error: "Transcript job has no recording asset evidence." };
  }

  const transcriptGate = await mobileCaptureTranscriptProcessingGate({
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

  const transcriptSnapshot = transcriptPacketSnapshot(job.segments);
  const packetSegments = transcriptSnapshot.projected;
  const { projected: _projected, ...transcriptSnapshotEvidence } = transcriptSnapshot;

  const packetTitle = `Transcript packet: ${job.id}`;
  const purpose = packetPurpose(job.room?.purpose);
  const existing = await args.prisma.coachingNote.findFirst({
    where: {
      roomId: job.roomId,
      kind: "SUMMARY",
      title: packetTitle,
    },
    include: { actionItems: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing && !args.force && packetSnapshotMatches(existing.sourceJson, job.segments)) {
    const existingSource = typeof existing.sourceJson === "object" && existing.sourceJson !== null
      ? existing.sourceJson as Record<string, any>
      : {};
    const existingReviewLanes = Array.isArray(existingSource.reviewLanes) ? existingSource.reviewLanes : [];
    const existingActionCandidates = mergePacketActionCandidates({
      sourceJson: existingSource,
      legacyActionItems: existing.actionItems,
    });
    const committedActionItems = (existing.actionItems || []).filter(
      (item: any) => !isUnreviewedTranscriptActionItem(item),
    );
    return {
      ok: true,
      transcriptJobId: job.id,
      roomId: job.roomId,
      summaryNoteId: existing.id,
      packetBuildId: cleanText(existingSource.packetBuildId) || null,
      packetPurpose: packetPurpose(existingSource.packetPurpose || purpose),
      actionCandidateIds: existingActionCandidates.map((candidate) => candidate.id),
      actionCandidateCount: existingActionCandidates.length,
      actionItemCount: committedActionItems.length,
      reviewLanes: existingReviewLanes,
      reviewLaneCount: existingReviewLanes.length,
      reviewLaneReadyCount: existingReviewLanes.filter((lane: any) => lane?.status === "READY_FOR_HUMAN_REVIEW").length,
      reusedExistingPacket: true,
      transcriptSnapshotSha256: transcriptSnapshot.sha256,
      humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
      providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
    };
  }

  const highlights = [...packetSegments]
    .map((segment: any) => ({ segment, score: scoreHighlight(segment) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.segment);

  const actionSegments = packetSegments
    .filter((segment: any) => ACTION_PATTERNS.some((pattern) => pattern.test(cleanText(segment.text))))
    .slice(0, 10);

  const packetBuildId = randomUUID();
  const sourceJson = {
    source: TRANSCRIPT_PACKET_SOURCE,
    packetBuildId,
    transcriptJobId: job.id,
    recordingAssetId: job.assetId,
    roomId: job.roomId,
    provider: job.provider,
    packetPurpose: purpose,
    packetTemplateVersion: SESSION_PACKET_TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    deterministic: true,
    reviewRequired: true,
    transcriptSnapshot: transcriptSnapshotEvidence,
    transcriptReviewCoverage: {
      segmentCount: transcriptSnapshot.segmentCount,
      humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
      providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
      fullyHumanReviewed: transcriptSnapshot.providerOnlySegmentCount === 0,
    },
  };

  const reviewLanes = buildTranscriptPacketReviewLanes(purpose, packetSegments, highlights, actionSegments);
  const packetBrief = buildTranscriptPacketBrief(packetSegments, highlights, actionSegments);
  const actionCandidates: TranscriptActionCandidate[] = actionSegments.map((segment: any) => transcriptActionCandidate({
    segment,
    transcriptJobId: job.id,
    recordingAssetId: job.assetId,
    roomId: job.roomId,
    packetBuildId,
  }));

  const summaryNote = await args.prisma.coachingNote.create({
    data: {
      roomId: job.roomId,
      bookingId: job.room?.bookingId ?? null,
      authorUserId: args.authorUserId || null,
      kind: "SUMMARY",
      visibility: "AUTHOR_PRIVATE",
      title: packetTitle,
      body: summarizeSegments(purpose, packetSegments, packetBrief),
      sourceJson: {
        ...sourceJson,
        packetBrief,
        reviewLanes,
        reviewLaneCount: reviewLanes.length,
        reviewLaneReadyCount: reviewLanes.filter((lane) => lane.status === "READY_FOR_HUMAN_REVIEW").length,
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
        visibility: "AUTHOR_PRIVATE",
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
    packetPurpose: purpose,
    highlightNoteIds: highlightNotes.map((note: any) => note.id),
    actionCandidateIds: actionCandidates.map((candidate) => candidate.id),
    actionItemIds: [],
    highlightCount: highlightNotes.length,
    actionCandidateCount: actionCandidates.length,
    actionItemCount: 0,
    reviewLanes,
    reviewLaneCount: reviewLanes.length,
    reviewLaneReadyCount: reviewLanes.filter((lane) => lane.status === "READY_FOR_HUMAN_REVIEW").length,
    reusedExistingPacket: false,
    rebuiltForTranscriptReviewChange: Boolean(existing && !args.force),
    transcriptSnapshotSha256: transcriptSnapshot.sha256,
    humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
    providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
  };
}
