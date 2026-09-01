import { createHash, randomUUID } from "node:crypto";
import {
  TRANSCRIPT_ACTION_CANDIDATE_KIND,
  TRANSCRIPT_PACKET_SOURCE,
  TRANSCRIPT_PACKET_SOURCES,
  SESSION_PACKET_TEMPLATE_VERSION,
  buildTranscriptPacketBrief,
  createTranscriptActionCandidate,
  isTranscriptActionCandidate,
  isTranscriptActionReviewStatus,
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionCandidate,
} from "@high-ground/quipsly-domain/coaching-packet";

import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { buildTranscriptSourceAnchorFields } from "@/lib/server/transcript-source-span";
import {
  assembleSessionTranscriptProgramClock,
  SessionTranscriptAssemblyError,
} from "@/lib/server/session-transcript-assembly";
import {
  readSessionReviewedSourcePlacements,
  SessionReviewedSourcePlacementError,
} from "@/lib/server/session-reviewed-source-placement";
import {
  selectSessionTranscriptSources,
  type SessionTranscriptSourceCandidate,
} from "@/lib/server/session-transcript-source-selection";

type BuildCoachingPacketArgs = {
  prisma: any;
  transcriptJobId: string;
  authorUserId?: string | null;
  force?: boolean;
};

type SessionPacketPurpose =
  | "COACHING"
  | "PODCAST"
  | "RESEARCH_INTERVIEW"
  | "INTERNAL_MEETING"
  | "PERSONAL_NOTE";

export { SESSION_PACKET_TEMPLATE_VERSION } from "@high-ground/quipsly-domain/coaching-packet";
export const TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA =
  "quipsly-transcript-packet-snapshot-v2";
export const TRANSCRIPT_PACKET_SEGMENT_ORDER_BY = [
  { startSeconds: "asc" as const },
  { id: "asc" as const },
];

/**
 * Distinguishes current packets that already materialize ordinary editable
 * Session work from historical candidate-only packets. Keeping this check in
 * the packet builder prevents a legacy summary from suppressing the modern
 * notes, tasks, and goals during an idempotent replay.
 */
export function packetCreatesOrdinarySessionWork(value: unknown) {
  const source =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const packetBrief =
    typeof source.packetBrief === "object" &&
    source.packetBrief !== null &&
    !Array.isArray(source.packetBrief)
      ? (source.packetBrief as Record<string, unknown>)
      : {};
  return (
    source.reviewRequired === false ||
    (packetBrief.kind === "quipsly-transcript-packet-brief-v1" &&
      packetBrief.candidateOnly === false &&
      packetBrief.humanApprovalRequired === false)
  );
}

const ACTION_PATTERNS = [
  /\b(i|we|you|they)\s+(need|needs|should|will|can|could|must|have)\s+to\b/i,
  /\b(i'll|we'll|you'll|let's|follow up|send|schedule|prepare|finish|review|publish|record|write|draft|check)\b/i,
  /\b(next step|action item|homework|before next time|for next time)\b/i,
  /\b(goal|commitment|objective)\s+is\s+to\b/i,
];
const GOAL_PATTERN = /\b(goal|objective|long[- ]term|commitment)\b/i;

export type { TranscriptActionCandidate } from "@high-ground/quipsly-domain/coaching-packet";

const REVIEW_LANE_DEFINITIONS = [
  {
    id: "client-follow-up",
    label: "Client follow-up notes",
    meaning: "Source-linked recap notes shared in the coaching relationship.",
    pattern:
      /\b(client|coachee|you|goal|stuck|decision|commitment|homework|follow up|next step)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "coaching-insights",
    label: "Insights and decisions",
    meaning:
      "Source-linked insights and decisions that remain easy to edit or remove.",
    pattern:
      /\b(insight|realized|learned|decision|decided|pattern|meaning|important|changed|understand)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "obstacles-and-support",
    label: "Obstacles and support",
    meaning: "Obstacles, resources, and support to revisit with the client.",
    pattern:
      /\b(stuck|block|obstacle|hard|difficult|support|help|resource|accountability|challenge)\b/i,
    purposes: ["COACHING"],
  },
  {
    id: "goals-and-tasks",
    label: "Goals and tasks",
    meaning: "Commitments Quipsly turns into editable tasks or coaching goals.",
    pattern:
      /\b(goal|task|todo|to-do|commit|commitment|before next|for next|need to|should|will|finish|prepare)\b/i,
    purposes: [
      "COACHING",
      "PODCAST",
      "RESEARCH_INTERVIEW",
      "INTERNAL_MEETING",
      "PERSONAL_NOTE",
    ],
  },
  {
    id: "next-session-prep",
    label: "Next-session prep",
    meaning:
      "Material that helps prepare the next coaching, podcast, or research session.",
    pattern:
      /\b(next session|next time|before we meet|bring back|follow up|prep|prepare|homework|review)\b/i,
    purposes: [
      "COACHING",
      "PODCAST",
      "RESEARCH_INTERVIEW",
      "INTERNAL_MEETING",
      "PERSONAL_NOTE",
    ],
  },
  {
    id: "podcast-production",
    label: "Podcast and episode notes",
    meaning:
      "Beats, episode notes, title ideas, and production hooks for podcast or video work.",
    pattern:
      /\b(podcast|episode|clip|short|youtube|video|publish|title|hook|segment|chapter|article|post)\b/i,
    purposes: ["PODCAST"],
  },
  {
    id: "fact-checks-and-rights",
    label: "Fact checks and source rights",
    meaning:
      "Claims, sources, clips, sponsors, and rights questions to verify before publication.",
    pattern:
      /\b(fact|check|source|citation|claim|rights|license|permission|copyright|sponsor|verify)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW", "PERSONAL_NOTE"],
  },
  {
    id: "quote-candidates",
    label: "Quote candidates",
    meaning:
      "Memorable lines that may become quote cards, social copy, article pull quotes, or QuipLore seeds.",
    pattern:
      /\b(remember|truth|lesson|means|because|story|wisdom|quote|important|realized|learned)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW", "PERSONAL_NOTE"],
  },
  {
    id: "article-seeds",
    label: "Article and post seeds",
    meaning:
      "Ideas that may become articles, posts, book notes, or research packets.",
    pattern:
      /\b(article|post|write|draft|book|research|source|example|lesson|story|framework|principle)\b/i,
    purposes: ["PODCAST", "RESEARCH_INTERVIEW", "PERSONAL_NOTE"],
  },
  {
    id: "clip-candidates",
    label: "Clip candidates",
    meaning:
      "Moments with enough shape or energy to review as possible short clips.",
    pattern:
      /\?|\b(wait|wow|love|huge|funny|story|example|realized|important|problem|answer|mistake)\b/i,
    purposes: ["PODCAST"],
  },
] as const;

function packetPurpose(value: unknown): SessionPacketPurpose {
  return [
    "COACHING",
    "PODCAST",
    "RESEARCH_INTERVIEW",
    "INTERNAL_MEETING",
    "PERSONAL_NOTE",
  ].includes(cleanText(value))
    ? (cleanText(value) as SessionPacketPurpose)
    : "COACHING";
}

export function reviewLaneDefinitionsForPurpose(value: unknown) {
  const purpose = packetPurpose(value);
  return REVIEW_LANE_DEFINITIONS.filter((lane) =>
    (lane.purposes as readonly string[]).includes(purpose),
  );
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function sessionRecapTitle(roomTitle: unknown) {
  const title = cleanText(roomTitle).slice(0, 120);
  if (!title) return "Session recap";
  return /\brecap$/i.test(title) ? title : `${title} recap`;
}

function packetSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function packetWorkId(
  kind: "task" | "goal",
  transcriptJobId: string,
  segmentId: string,
) {
  const digest = createHash("sha256")
    .update(`${kind}|${transcriptJobId}|${segmentId}`)
    .digest("hex")
    .slice(0, 32);
  return `transcript-${kind}-${digest}`;
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
  acceptedSpeakerAttributionId: string | null;
  speakerAuthority:
    | "correction"
    | "attribution"
    | "source-binding"
    | "provider"
    | "unresolved";
  sourceBoundParticipantId: string | null;
  transcriptJobId?: string;
  recordingAssetId?: string;
  sourceStartSeconds?: number;
  sourceEndSeconds?: number;
  programOffsetSeconds?: number;
};

export type PacketTranscriptEvidenceSpan = PacketTranscriptSegment & {
  segmentIds: string[];
  sourceTextSha256: string;
  evidenceSegments: PacketTranscriptSegment[];
};

function packetSpeakerProviderSnapshotSha256(
  segments: any[],
  providerSpeakerLabel: string,
) {
  const evidence = segments
    .filter(
      (segment) =>
        (cleanText(segment?.speakerLabel) || null) === providerSpeakerLabel,
    )
    .map((segment) => ({
      id: cleanText(segment?.id),
      startSeconds: Number(segment?.startSeconds),
      endSeconds: Number(segment?.endSeconds),
      textSha256: packetSha256(
        typeof segment?.text === "string" ? segment.text : "",
      ),
    }))
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.id.localeCompare(right.id),
    );
  return packetSha256(JSON.stringify({ providerSpeakerLabel, evidence }));
}

/**
 * Resolves immutable provider segments into the exact text packet builders may
 * read. Accepted corrections are overlays; a current confirmed-as-is receipt
 * advances review status without changing provider text.
 */
function sourceBoundTranscriptRouting(job: unknown) {
  const transcriptJob =
    typeof job === "object" && job !== null && !Array.isArray(job)
      ? (job as Record<string, unknown>)
      : {};
  const result =
    typeof transcriptJob.resultJson === "object" &&
    transcriptJob.resultJson !== null &&
    !Array.isArray(transcriptJob.resultJson)
      ? (transcriptJob.resultJson as Record<string, unknown>)
      : {};
  const control =
    typeof result.processingControl === "object" &&
    result.processingControl !== null &&
    !Array.isArray(result.processingControl)
      ? (result.processingControl as Record<string, unknown>)
      : {};
  const routing =
    typeof control.routing === "object" &&
    control.routing !== null &&
    !Array.isArray(control.routing)
      ? (control.routing as Record<string, unknown>)
      : {};
  return routing.schema !== "quipsly-transcript-routing-summary-v1" ||
    routing.sourceTopology !== "participant-isolated" ||
    routing.speakerAuthority !== "source-binding"
    ? null
    : routing;
}

export function sourceBoundTranscriptSpeakerLabel(job: unknown) {
  const routing = sourceBoundTranscriptRouting(job);
  return cleanText(routing?.participantLabel) || null;
}

export function sourceBoundTranscriptParticipantId(job: unknown) {
  if (!sourceBoundTranscriptRouting(job)) return null;
  const transcriptJob =
    typeof job === "object" && job !== null && !Array.isArray(job)
      ? (job as Record<string, unknown>)
      : {};
  const asset =
    typeof transcriptJob.asset === "object" &&
    transcriptJob.asset !== null &&
    !Array.isArray(transcriptJob.asset)
      ? (transcriptJob.asset as Record<string, unknown>)
      : {};
  return cleanText(asset.participantId) || null;
}

export function projectTranscriptSegmentsForPacket(
  segments: unknown,
  speakerAttributions: unknown = [],
  sourceBoundSpeakerLabel: unknown = null,
  sourceBoundParticipantId: unknown = null,
): PacketTranscriptSegment[] {
  const providerSegments = Array.isArray(segments) ? segments : [];
  const exactSourceSpeaker = cleanText(sourceBoundSpeakerLabel) || null;
  const exactSourceParticipantId = cleanText(sourceBoundParticipantId) || null;
  const activeSpeakerAttributions = new Map(
    (Array.isArray(speakerAttributions) ? speakerAttributions : [])
      .filter(
        (attribution) =>
          attribution?.status === "active" &&
          cleanText(attribution?.providerSpeakerLabel) &&
          cleanText(attribution?.participantId) &&
          cleanText(attribution?.participantDisplaySnapshot) &&
          cleanText(attribution?.providerSnapshotSha256) ===
            packetSpeakerProviderSnapshotSha256(
              providerSegments,
              cleanText(attribution?.providerSpeakerLabel),
            ),
      )
      .map((attribution) => [
        cleanText(attribution.providerSpeakerLabel),
        attribution,
      ]),
  );
  return providerSegments.map((segment) => {
    const providerText = typeof segment?.text === "string" ? segment.text : "";
    const providerSpeakerLabel = cleanText(segment?.speakerLabel) || null;
    const providerTextSha256 = packetSha256(providerText);
    const acceptedCorrection =
      [...(Array.isArray(segment?.corrections) ? segment.corrections : [])]
        .filter(
          (correction) =>
            correction?.status === "accepted" &&
            correction?.baseTextSha256 === providerTextSha256 &&
            (cleanText(correction?.expectedSpeakerLabel) || null) ===
              providerSpeakerLabel,
        )
        .sort(
          (left, right) =>
            reviewTime(right?.updatedAt) - reviewTime(left?.updatedAt),
        )[0] ?? null;
    const acceptedVerification = acceptedCorrection
      ? null
      : ([
          ...(Array.isArray(segment?.verifications)
            ? segment.verifications
            : []),
        ]
          .filter(
            (verification) =>
              verification?.reviewKind === "confirmed-as-is" &&
              verification?.providerTextSha256 === providerTextSha256 &&
              (cleanText(verification?.providerSpeakerLabel) || null) ===
                providerSpeakerLabel,
          )
          .sort(
            (left, right) =>
              reviewTime(right?.createdAt) - reviewTime(left?.createdAt),
          )[0] ?? null);
    const correctedText = cleanText(acceptedCorrection?.correctedText);
    const correctedSpeaker = cleanText(
      acceptedCorrection?.correctedSpeakerLabel,
    );
    const speakerAttribution =
      activeSpeakerAttributions.get(providerSpeakerLabel || "") ?? null;
    const attributedSpeaker = cleanText(
      speakerAttribution?.participantDisplaySnapshot,
    );
    const acceptedReviewId =
      cleanText(acceptedCorrection?.id) ||
      cleanText(acceptedVerification?.id) ||
      null;
    const resolvedSpeakerLabel =
      correctedSpeaker ||
      attributedSpeaker ||
      exactSourceSpeaker ||
      providerSpeakerLabel;
    const speakerAuthority = correctedSpeaker
      ? ("correction" as const)
      : attributedSpeaker
        ? ("attribution" as const)
        : exactSourceSpeaker
          ? ("source-binding" as const)
          : providerSpeakerLabel
            ? ("provider" as const)
            : ("unresolved" as const);

    return {
      id: String(segment?.id ?? ""),
      speakerLabel: resolvedSpeakerLabel,
      startSeconds: Number(segment?.startSeconds),
      endSeconds: Number(segment?.endSeconds),
      text: correctedText || cleanText(providerText),
      confidence:
        typeof segment?.confidence === "number" ? segment.confidence : null,
      providerText,
      providerSpeakerLabel,
      providerTextSha256,
      reviewStatus: acceptedReviewId ? "human-reviewed" : "provider",
      acceptedReviewId,
      acceptedCorrectionId: cleanText(acceptedCorrection?.id) || null,
      acceptedSpeakerAttributionId: cleanText(speakerAttribution?.id) || null,
      speakerAuthority,
      sourceBoundParticipantId: exactSourceParticipantId,
    };
  });
}

export function projectTranscriptJobSegmentsForPacket(
  job: any,
): PacketTranscriptSegment[] {
  return projectTranscriptSegmentsForPacket(
    job?.segments,
    job?.speakerAttributions,
    sourceBoundTranscriptSpeakerLabel(job),
    sourceBoundTranscriptParticipantId(job),
  );
}

export const SESSION_TRANSCRIPT_PACKET_SOURCE_SCHEMA =
  "quipsly-session-transcript-packet-source-v1" as const;

type PacketSourceCandidate = SessionTranscriptSourceCandidate & {
  checksum: string | null;
  localManifestJson: unknown;
  transcriptJobs: any[];
};

export class SessionTranscriptPacketSourceError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
  ) {
    super(message);
    this.name = "SessionTranscriptPacketSourceError";
  }
}

export type ResolvedSessionPacketTranscript = {
  schema: typeof SESSION_TRANSCRIPT_PACKET_SOURCE_SCHEMA;
  anchorTranscriptJobId: string;
  multiSource: boolean;
  sources: Array<{
    transcriptJobId: string;
    recordingAssetId: string;
    participantId: string | null;
    sourceSha256: string | null;
    programOffsetSeconds: number;
    timingAuthority: string;
    timingUncertaintyMilliseconds: number | null;
    timingReviewRequired: boolean;
  }>;
  programClock: ReturnType<typeof assembleSessionTranscriptProgramClock> | null;
  projected: PacketTranscriptSegment[];
};

function packetObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function singleSourcePacketTranscript(
  job: any,
): ResolvedSessionPacketTranscript {
  return {
    schema: SESSION_TRANSCRIPT_PACKET_SOURCE_SCHEMA,
    anchorTranscriptJobId: cleanText(job.id),
    multiSource: false,
    sources: [
      {
        transcriptJobId: cleanText(job.id),
        recordingAssetId: cleanText(job.assetId || job.asset?.id),
        participantId: cleanText(job.asset?.participantId) || null,
        sourceSha256: cleanText(job.sourceSha256).toLowerCase() || null,
        programOffsetSeconds: 0,
        timingAuthority: "single-source-origin",
        timingUncertaintyMilliseconds: null,
        timingReviewRequired: false,
      },
    ],
    programClock: null,
    projected: projectTranscriptJobSegmentsForPacket(job),
  };
}

/**
 * Resolves the current coherent participant-owned take for packet generation.
 * The packet stays a projection: every passage retains its own transcript job,
 * recording master, source time, and reversible Session placement.
 */
export async function resolveSessionPacketTranscript(input: {
  prisma: any;
  anchorJob: any;
}): Promise<ResolvedSessionPacketTranscript> {
  const anchor = input.anchorJob;
  const single = singleSourcePacketTranscript(anchor);
  if (
    !anchor?.roomId ||
    typeof input.prisma?.recordingAsset?.findMany !== "function"
  ) {
    return single;
  }

  const rows = (await input.prisma.recordingAsset.findMany({
    where: {
      roomId: anchor.roomId,
      status: "VERIFIED",
      kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] },
      participantId: { not: null },
      checksum: { not: null },
      recordedStartedAt: { not: null },
      recordedStoppedAt: { not: null },
      transcriptJobs: { some: { status: "COMPLETED" } },
    },
    orderBy: [{ recordedStartedAt: "asc" }, { id: "asc" }],
    include: {
      transcriptJobs: {
        where: { status: "COMPLETED" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        include: {
          speakerAttributions: {
            where: { status: "active" },
            orderBy: { updatedAt: "desc" },
          },
          segments: {
            orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
            include: {
              corrections: {
                where: { status: "accepted" },
                orderBy: { updatedAt: "desc" },
              },
              verifications: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      },
    },
  })) as PacketSourceCandidate[];
  const selected = selectSessionTranscriptSources({
    rows,
    anchorRecordingAssetId: cleanText(anchor.assetId || anchor.asset?.id),
  }).filter((source): source is PacketSourceCandidate => Boolean(source));
  if (selected.length < 2) return single;

  const jobs = selected.map((source) => {
    const job = source.transcriptJobs[0];
    if (
      !job ||
      job.status !== "COMPLETED" ||
      cleanText(job.assetId) !== cleanText(source.id) ||
      cleanText(job.sourceSha256).toLowerCase() !==
        cleanText(source.checksum).toLowerCase() ||
      !sourceBoundTranscriptRouting(job) ||
      cleanText(source.participantId) === ""
    ) {
      throw new SessionTranscriptPacketSourceError(
        "A participant transcript no longer matches its verified source recording.",
        "SESSION_TRANSCRIPT_SOURCE_CHANGED",
      );
    }
    return { ...job, asset: source };
  });
  const gates = await Promise.all(
    selected.map((source) =>
      mobileCaptureTranscriptProcessingGate({
        prisma: input.prisma,
        recordingAsset: source,
      }),
    ),
  );
  const held = gates.find((gate) => !gate.allowed);
  if (held && !held.allowed) {
    throw new SessionTranscriptPacketSourceError(
      held.error ||
        "A participant transcript is not released for follow-through.",
      held.errorCode || "SESSION_TRANSCRIPT_SOURCE_HELD",
    );
  }

  let reviewedPlacements = [] as Awaited<
    ReturnType<typeof readSessionReviewedSourcePlacements>
  >;
  if (typeof input.prisma?.sessionAudioAlignmentJob?.findMany === "function") {
    try {
      reviewedPlacements = await readSessionReviewedSourcePlacements({
        prisma: input.prisma,
        roomId: anchor.roomId,
        recordingAssetIds: selected.map((source) => source.id),
      });
    } catch (error) {
      if (error instanceof SessionReviewedSourcePlacementError) {
        throw new SessionTranscriptPacketSourceError(error.message, error.code);
      }
      throw error;
    }
  }
  let programClock: ReturnType<typeof assembleSessionTranscriptProgramClock>;
  try {
    programClock = assembleSessionTranscriptProgramClock(
      selected.map((source) => {
        const manifest = packetObject(source.localManifestJson);
        return {
          recordingAssetId: source.id,
          transcriptJobId: source.transcriptJobs[0]!.id,
          captureGroupId: cleanText(manifest.captureGroupId) || null,
          recordedStartedAt: source.recordedStartedAt,
          alignment: manifest.alignment,
        };
      }),
      { reviewedPlacements },
    );
  } catch (error) {
    if (error instanceof SessionTranscriptAssemblyError) {
      throw new SessionTranscriptPacketSourceError(error.message, error.code);
    }
    throw error;
  }
  const timingByRecordingId = new Map(
    programClock.sources.map((source) => [source.recordingAssetId, source]),
  );
  const sources = selected.map((source, index) => {
    const timing = timingByRecordingId.get(source.id)!;
    return {
      transcriptJobId: jobs[index]!.id,
      recordingAssetId: source.id,
      participantId: source.participantId,
      sourceSha256: cleanText(jobs[index]!.sourceSha256).toLowerCase() || null,
      programOffsetSeconds: timing.programOffsetSeconds,
      timingAuthority: timing.timingAuthority,
      timingUncertaintyMilliseconds: timing.timingUncertaintyMilliseconds,
      timingReviewRequired: timing.timingReviewRequired,
    };
  });
  const projected = jobs
    .flatMap((job, index) => {
      const source = sources[index]!;
      return projectTranscriptJobSegmentsForPacket(job).map((segment) => ({
        ...segment,
        transcriptJobId: source.transcriptJobId,
        recordingAssetId: source.recordingAssetId,
        sourceStartSeconds: segment.startSeconds,
        sourceEndSeconds: segment.endSeconds,
        programOffsetSeconds: source.programOffsetSeconds,
        startSeconds: source.programOffsetSeconds + segment.startSeconds,
        endSeconds: source.programOffsetSeconds + segment.endSeconds,
      }));
    })
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.id.localeCompare(right.id),
    );
  return {
    schema: SESSION_TRANSCRIPT_PACKET_SOURCE_SCHEMA,
    anchorTranscriptJobId: cleanText(anchor.id),
    multiSource: true,
    sources,
    programClock,
    projected,
  };
}

const MAX_PACKET_SPAN_SEGMENTS = 6;
const MAX_PACKET_SPAN_DURATION_SECONDS = 45;
const MAX_PACKET_SPAN_TEXT_LENGTH = 1_600;
const MAX_PACKET_SPAN_GAP_SECONDS = 1.5;

function shouldContinuePacketSpan(
  current: PacketTranscriptSegment[],
  next: PacketTranscriptSegment,
) {
  const last = current.at(-1);
  if (!last || current.length >= MAX_PACKET_SPAN_SEGMENTS) return false;
  if (
    (last.transcriptJobId || next.transcriptJobId) &&
    (last.transcriptJobId !== next.transcriptJobId ||
      last.recordingAssetId !== next.recordingAssetId)
  )
    return false;
  const currentSpeaker = cleanText(last.speakerLabel);
  const nextSpeaker = cleanText(next.speakerLabel);
  if (currentSpeaker && nextSpeaker && currentSpeaker !== nextSpeaker)
    return false;
  const gap = next.startSeconds - last.endSeconds;
  if (!Number.isFinite(gap) || gap < -0.5 || gap > MAX_PACKET_SPAN_GAP_SECONDS)
    return false;
  if (
    next.endSeconds - current[0]!.startSeconds >
    MAX_PACKET_SPAN_DURATION_SECONDS
  )
    return false;
  const combinedText = [...current, next]
    .map((segment) => cleanText(segment.text))
    .join(" ");
  if (combinedText.length > MAX_PACKET_SPAN_TEXT_LENGTH) return false;
  const lastText = cleanText(last.text);
  const continuation =
    /(?:[,;:]|\b(?:and|or|but|because|so|to|that|which|who|if|when|while|until|unless|with|without))["')\]]*$/i.test(
      lastText,
    );
  const terminal = /[.!?]["')\]]*$/.test(lastText);
  return continuation || !terminal;
}

function packetEvidenceSpan(
  segments: PacketTranscriptSegment[],
): PacketTranscriptEvidenceSpan {
  const first = segments[0]!;
  const last = segments.at(-1)!;
  const text = segments
    .map((segment) => cleanText(segment.text))
    .filter(Boolean)
    .join(" ");
  const speakerLabels = [
    ...new Set(
      segments
        .map((segment) => cleanText(segment.speakerLabel))
        .filter(Boolean),
    ),
  ];
  const confidences = segments
    .map((segment) => segment.confidence)
    .filter((value): value is number => typeof value === "number");
  return {
    ...first,
    segmentIds: segments.map((segment) => segment.id),
    evidenceSegments: segments,
    speakerLabel: speakerLabels.length === 1 ? speakerLabels[0]! : null,
    endSeconds: last.endSeconds,
    ...(typeof first.sourceStartSeconds === "number"
      ? {
          sourceStartSeconds: first.sourceStartSeconds,
          sourceEndSeconds: last.sourceEndSeconds ?? last.endSeconds,
        }
      : {}),
    text,
    confidence: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null,
    reviewStatus: segments.every(
      (segment) => segment.reviewStatus === "human-reviewed",
    )
      ? "human-reviewed"
      : "provider",
    sourceTextSha256: packetSha256(text),
  };
}

/** Deterministically joins adjacent provider segments only while a thought remains syntactically open. */
export function buildTranscriptEvidenceSpans(
  segments: PacketTranscriptSegment[],
) {
  const spans: PacketTranscriptEvidenceSpan[] = [];
  let current: PacketTranscriptSegment[] = [];
  for (const segment of segments) {
    if (!current.length || shouldContinuePacketSpan(current, segment))
      current.push(segment);
    else {
      spans.push(packetEvidenceSpan(current));
      current = [segment];
    }
  }
  if (current.length) spans.push(packetEvidenceSpan(current));
  return spans;
}

/** Resolves and validates an immutable packet item against the current ordered transcript projection. */
export function resolvePacketEvidenceSpan(
  item: unknown,
  projected: PacketTranscriptSegment[],
) {
  const candidate =
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const primarySegmentId = cleanText(candidate.segmentId);
  const segmentIds = Array.isArray(candidate.segmentIds)
    ? candidate.segmentIds.map(cleanText).filter(Boolean)
    : primarySegmentId
      ? [primarySegmentId]
      : [];
  if (
    !primarySegmentId ||
    !segmentIds.length ||
    segmentIds.length > MAX_PACKET_SPAN_SEGMENTS ||
    segmentIds[0] !== primarySegmentId ||
    new Set(segmentIds).size !== segmentIds.length
  )
    return null;
  const indexes = segmentIds.map((id) =>
    projected.findIndex((segment) => segment.id === id),
  );
  if (
    indexes.some((index) => index < 0) ||
    indexes.some(
      (index, position) => position > 0 && index !== indexes[position - 1]! + 1,
    )
  )
    return null;
  const resolved = indexes.map((index) => projected[index]!);
  const sourceText = resolved
    .map((segment) => cleanText(segment.text))
    .join(" ");
  const expectedSha256 = cleanText(candidate.sourceTextSha256).toLowerCase();
  if (segmentIds.length > 1 && !/^[a-f0-9]{64}$/.test(expectedSha256))
    return null;
  if (expectedSha256 && expectedSha256 !== packetSha256(sourceText))
    return null;
  return resolved;
}

export function packetTemplateMatches(sourceJson: unknown) {
  const source =
    typeof sourceJson === "object" &&
    sourceJson !== null &&
    !Array.isArray(sourceJson)
      ? (sourceJson as Record<string, unknown>)
      : {};
  return source.packetTemplateVersion === SESSION_PACKET_TEMPLATE_VERSION;
}

export function transcriptPacketSnapshot(
  segments: unknown,
  speakerAttributions: unknown = [],
  sourceBoundSpeakerLabel: unknown = null,
  sourceBoundParticipantId: unknown = null,
) {
  const projected = projectTranscriptSegmentsForPacket(
    segments,
    speakerAttributions,
    sourceBoundSpeakerLabel,
    sourceBoundParticipantId,
  );
  return transcriptPacketSnapshotFromProjected(projected);
}

export function transcriptPacketSnapshotFromProjected(
  projected: PacketTranscriptSegment[],
) {
  const segmentReviews = projected.map((segment) => ({
    segmentId: segment.id,
    ...(segment.transcriptJobId
      ? { transcriptJobId: segment.transcriptJobId }
      : {}),
    ...(segment.recordingAssetId
      ? { recordingAssetId: segment.recordingAssetId }
      : {}),
    providerTextSha256: segment.providerTextSha256,
    resolvedTextSha256: packetSha256(segment.text),
    resolvedSpeakerLabel: segment.speakerLabel,
    acceptedReviewId: segment.acceptedReviewId,
    acceptedCorrectionId: segment.acceptedCorrectionId,
    acceptedSpeakerAttributionId: segment.acceptedSpeakerAttributionId,
    speakerAuthority: segment.speakerAuthority,
    sourceBoundParticipantId: segment.sourceBoundParticipantId,
    reviewStatus: segment.reviewStatus,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    ...(typeof segment.sourceStartSeconds === "number"
      ? {
          sourceStartSeconds: segment.sourceStartSeconds,
          sourceEndSeconds: segment.sourceEndSeconds,
        }
      : {}),
  }));
  const sha256 = packetSha256(JSON.stringify(segmentReviews));
  return {
    schema: TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA,
    sha256,
    segmentCount: projected.length,
    humanReviewedSegmentCount: projected.filter(
      (segment) => segment.reviewStatus === "human-reviewed",
    ).length,
    providerOnlySegmentCount: projected.filter(
      (segment) => segment.reviewStatus === "provider",
    ).length,
    segmentReviews,
    projected,
  };
}

export function transcriptJobPacketSnapshot(job: any) {
  return transcriptPacketSnapshot(
    job?.segments,
    job?.speakerAttributions,
    sourceBoundTranscriptSpeakerLabel(job),
    sourceBoundTranscriptParticipantId(job),
  );
}

export function packetSnapshotMatches(
  sourceJson: unknown,
  segments: unknown,
  speakerAttributions: unknown = [],
  sourceBoundSpeakerLabel: unknown = null,
  sourceBoundParticipantId: unknown = null,
) {
  const source =
    typeof sourceJson === "object" &&
    sourceJson !== null &&
    !Array.isArray(sourceJson)
      ? (sourceJson as Record<string, unknown>)
      : {};
  const snapshot =
    typeof source.transcriptSnapshot === "object" &&
    source.transcriptSnapshot !== null &&
    !Array.isArray(source.transcriptSnapshot)
      ? (source.transcriptSnapshot as Record<string, unknown>)
      : {};
  const current = transcriptPacketSnapshot(
    segments,
    speakerAttributions,
    sourceBoundSpeakerLabel,
    sourceBoundParticipantId,
  );
  return (
    snapshot.schema === TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA &&
    snapshot.sha256 === current.sha256
  );
}

export function packetSnapshotMatchesTranscriptJob(
  sourceJson: unknown,
  job: any,
) {
  return packetSnapshotMatches(
    sourceJson,
    job?.segments,
    job?.speakerAttributions,
    sourceBoundTranscriptSpeakerLabel(job),
    sourceBoundTranscriptParticipantId(job),
  );
}

export function packetSnapshotMatchesResolvedSession(
  sourceJson: unknown,
  resolved: ResolvedSessionPacketTranscript,
) {
  const source = packetObject(sourceJson);
  const snapshot = packetObject(source.transcriptSnapshot);
  const current = transcriptPacketSnapshotFromProjected(resolved.projected);
  return (
    snapshot.schema === TRANSCRIPT_PACKET_SNAPSHOT_SCHEMA &&
    snapshot.sha256 === current.sha256
  );
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
  const summarySource =
    typeof summary?.sourceJson === "object" && summary.sourceJson !== null
      ? (summary.sourceJson as Record<string, unknown>)
      : {};
  const packetBuildId = cleanText(summarySource.packetBuildId);
  const allHighlights = packetNotes.filter(
    (note) => note?.kind === "HIGHLIGHT",
  );
  const highlights = packetBuildId
    ? allHighlights.filter((note) => {
        const source =
          typeof note?.sourceJson === "object" && note.sourceJson !== null
            ? (note.sourceJson as Record<string, unknown>)
            : {};
        return cleanText(source.packetBuildId) === packetBuildId;
      })
    : allHighlights;

  return {
    summary,
    highlights,
    packetBuildId: packetBuildId || null,
    correlationMode: packetBuildId
      ? ("PACKET_BUILD_ID" as const)
      : ("LEGACY_TRANSCRIPT_FALLBACK" as const),
  };
}

function formatTime(seconds: unknown) {
  const numeric =
    typeof seconds === "number" && Number.isFinite(seconds)
      ? Math.max(0, seconds)
      : 0;
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
  if (
    /\b(important|remember|realized|because|means|story|lesson|goal|stuck|change|decision|commitment)\b/i.test(
      text,
    )
  )
    score += 12;
  if (ACTION_PATTERNS.some((pattern) => pattern.test(text))) score += 8;
  if (typeof segment.confidence === "number") score += segment.confidence * 5;
  return score;
}

function titleFromSegment(segment: any) {
  const text = cleanText(segment.text);
  const sentence =
    text
      .split(/[.!?]/)
      .map((part) => part.trim())
      .find(Boolean) || text;
  const clipped = sentence.slice(0, 82);
  return clipped.length < sentence.length
    ? `${clipped}...`
    : clipped || "Session highlight";
}

function actionTitle(segment: any) {
  const text = cleanText(segment.text);
  const normalized = text.replace(/^(so|okay|ok|yeah|well|and|but)\s+/i, "");
  const sentence =
    normalized
      .split(/[.!?]/)
      .map((part) => part.trim())
      .find(Boolean) || normalized;
  const clipped = sentence.slice(0, 96);
  return clipped.length < sentence.length
    ? `${clipped}...`
    : clipped || "Review this follow-up";
}

function sourceClockSegments(segment: any) {
  const evidenceSegments = Array.isArray(segment.evidenceSegments)
    ? segment.evidenceSegments
    : [segment];
  return evidenceSegments.map((evidence: any) => ({
    ...evidence,
    startSeconds:
      typeof evidence.sourceStartSeconds === "number"
        ? evidence.sourceStartSeconds
        : evidence.startSeconds,
    endSeconds:
      typeof evidence.sourceEndSeconds === "number"
        ? evidence.sourceEndSeconds
        : evidence.endSeconds,
  }));
}

function transcriptActionCandidate(input: {
  segment: any;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
  committedActionItemId?: string | null;
}): TranscriptActionCandidate {
  const segmentId = String(input.segment.id);
  const sourceAnchor = buildTranscriptSourceAnchorFields(
    sourceClockSegments(input.segment),
  );
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
      ? input.segment.segmentIds
      : [segmentId],
    sourceText: cleanText(input.segment.text),
    sourceTextSha256:
      cleanText(input.segment.sourceTextSha256) ||
      packetSha256(cleanText(input.segment.text)),
    sourceSpan: sourceAnchor?.sourceSpan ?? null,
    transcriptReviewStatus:
      input.segment.reviewStatus === "human-reviewed"
        ? "human-reviewed"
        : "provider",
    speakerLabel: cleanText(input.segment.speakerLabel) || null,
    speakerAuthority: input.segment.speakerAuthority,
    startSeconds:
      typeof input.segment.sourceStartSeconds === "number"
        ? input.segment.sourceStartSeconds
        : Number(input.segment.startSeconds) || 0,
    endSeconds:
      typeof input.segment.sourceEndSeconds === "number"
        ? input.segment.sourceEndSeconds
        : Number(input.segment.endSeconds) || 0,
    committedActionItemId: input.committedActionItemId,
  });
}

export function packetActionCandidatesFromSource(
  value: unknown,
): TranscriptActionCandidate[] {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return [];
  const source = value as Record<string, unknown>;
  const candidates = source.actionCandidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (isTranscriptActionCandidate(candidate)) return [candidate];
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    )
      return [];
    const record = candidate as Record<string, unknown>;
    if (
      record.kind !== TRANSCRIPT_ACTION_CANDIDATE_KIND ||
      !cleanText(record.id) ||
      !cleanText(record.title) ||
      !cleanText(record.segmentId)
    )
      return [];
    // Read compatibility for packet candidates created before the correlated
    // provenance fields were required. The enclosing summary supplies any
    // evidence that existed at that time; review still fails closed if a
    // complete binding cannot be reconstructed.
    return [
      {
        id: cleanText(record.id),
        kind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
        reviewStatus: isTranscriptActionReviewStatus(record.reviewStatus)
          ? record.reviewStatus
          : "READY_FOR_HUMAN_REVIEW",
        title: cleanText(record.title),
        detail: cleanText(record.detail),
        transcriptJobId:
          cleanText(record.transcriptJobId) ||
          cleanText(source.transcriptJobId),
        recordingAssetId:
          cleanText(record.recordingAssetId) ||
          cleanText(source.recordingAssetId),
        roomId: cleanText(record.roomId) || cleanText(source.roomId),
        packetBuildId:
          cleanText(record.packetBuildId) || cleanText(source.packetBuildId),
        segmentId: cleanText(record.segmentId),
        segmentIds: Array.isArray(record.segmentIds)
          ? record.segmentIds.map(cleanText).filter(Boolean)
          : [cleanText(record.segmentId)],
        sourceText: cleanText(record.sourceText),
        sourceTextSha256: cleanText(record.sourceTextSha256),
        sourceSpan: null,
        transcriptReviewStatus:
          record.transcriptReviewStatus === "human-reviewed"
            ? "human-reviewed"
            : "provider",
        speakerLabel: cleanText(record.speakerLabel) || null,
        speakerAuthority: [
          "correction",
          "attribution",
          "source-binding",
          "provider",
          "unresolved",
        ].includes(cleanText(record.speakerAuthority))
          ? (cleanText(
              record.speakerAuthority,
            ) as TranscriptActionCandidate["speakerAuthority"])
          : undefined,
        startSeconds:
          typeof record.startSeconds === "number" ? record.startSeconds : 0,
        endSeconds:
          typeof record.endSeconds === "number" ? record.endSeconds : 0,
        humanApprovalRequired:
          typeof record.humanApprovalRequired === "boolean"
            ? record.humanApprovalRequired
            : true,
        committedActionItemId: cleanText(record.committedActionItemId) || null,
      } satisfies TranscriptActionCandidate,
    ];
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
    transcriptReviewStatus:
      source.transcriptReviewStatus === "human-reviewed"
        ? "human-reviewed"
        : "provider",
    speakerLabel: cleanText(source.speakerLabel) || null,
    startSeconds:
      typeof source.startSeconds === "number" ? source.startSeconds : 0,
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
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
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
    segmentIds: Array.isArray(segment.segmentIds)
      ? segment.segmentIds
      : [segment.id],
    sourceTextSha256: cleanText(segment.sourceTextSha256) || packetSha256(text),
    speakerLabel: cleanText(segment.speakerLabel) || "Unknown speaker",
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    timeLabel: `${formatTime(segment.startSeconds)}-${formatTime(segment.endSeconds)}`,
    text: text.length > 240 ? `${text.slice(0, 237)}...` : text,
  };
}

export { buildTranscriptPacketBrief } from "@high-ground/quipsly-domain/coaching-packet";

function buildTranscriptPacketReviewLanes(
  purpose: SessionPacketPurpose,
  segments: any[],
  highlights: any[],
  actionSegments: any[],
) {
  const laneCandidates = reviewLaneDefinitionsForPurpose(purpose).map(
    (lane) => {
      const seen = new Set<string>();
      const matches = [];
      const pool =
        lane.id === "goals-and-tasks" || lane.id === "next-session-prep"
          ? [...actionSegments, ...highlights, ...segments]
          : [...highlights, ...segments];

      for (const segment of pool) {
        if (matches.length >= 5) break;
        const id = String(
          segment.id || `${segment.startSeconds}-${segment.endSeconds}`,
        );
        if (seen.has(id)) continue;
        seen.add(id);
        const text = cleanText(segment.text);
        if (!text || !lane.pattern.test(text)) continue;
        matches.push(segmentPreview(segment));
      }

      return {
        id: lane.id,
        label: lane.label,
        status: matches.length ? "APPROVED_FOR_INTERNAL_USE" : "EMPTY",
        itemCount: matches.length,
        meaning: lane.meaning,
        sourceTruth:
          "Derived from transcript segments only; recording assets remain source truth.",
        reviewRule:
          "Quipsly created ordinary in-product work with source links. Edit, remove, or keep it; external publishing remains separate.",
        items: matches,
      };
    },
  );

  return laneCandidates.map((lane) => ({
    ...lane,
    humanApprovalRequired: false,
    externalSideEffects: false,
  }));
}

function summarizeSegments(
  purpose: SessionPacketPurpose,
  segments: any[],
  brief: ReturnType<typeof buildTranscriptPacketBrief>,
) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const duration = last
    ? `${formatTime(first?.startSeconds ?? 0)}–${formatTime(last.endSeconds ?? 0)}`
    : null;
  const populatedSections = brief.sections.filter(
    (section) => section.items.length > 0,
  );
  const introduction =
    purpose === "PODCAST"
      ? "Here are the production notes and follow-through Quipsly found in this episode."
      : purpose === "COACHING"
        ? "Here are the key moments and follow-through Quipsly found in this coaching session."
        : "Here are the key moments and follow-through Quipsly found in this session.";

  return [
    introduction,
    "",
    ...populatedSections.flatMap((section) => [
      `${section.label}:`,
      ...section.items.map((item) => {
        const speaker = cleanText(item.speakerLabel);
        return `- ${item.timeLabel}${speaker ? ` · ${speaker}` : ""} — ${item.text}`;
      }),
      "",
    ]),
    ...(populatedSections.length
      ? []
      : [
          "Nothing was turned into follow-through automatically. The full transcript is ready to read and edit.",
          "",
        ]),
    ...(duration ? [`Recording span: ${duration}`, ""] : []),
    "Everything here is editable. Change it, complete it, or remove it whenever you like.",
    "",
    "Timestamps stay linked to the recording so you can return to the source at any time.",
  ].join("\n");
}

export async function buildCoachingPacketFromTranscriptJob(
  args: BuildCoachingPacketArgs,
) {
  const job = await args.prisma.transcriptJob.findUnique({
    where: { id: args.transcriptJobId },
    include: {
      room: {
        include: {
          booking: true,
          coachingEngagement: {
            select: {
              id: true,
              primaryClientUserId: true,
              primaryCoachUserId: true,
            },
          },
        },
      },
      asset: true,
      speakerAttributions: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
      },
      segments: {
        orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
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
    return {
      ok: false,
      status: 409,
      error: "Transcript job has no recording asset evidence.",
    };
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
    return {
      ok: false,
      status: 409,
      error: "Transcript must be completed before building a coaching packet.",
    };
  }

  let resolvedTranscript: ResolvedSessionPacketTranscript;
  try {
    resolvedTranscript = await resolveSessionPacketTranscript({
      prisma: args.prisma,
      anchorJob: job,
    });
  } catch (error) {
    if (error instanceof SessionTranscriptPacketSourceError) {
      return {
        ok: false,
        status: 409,
        errorCode: error.errorCode,
        error: error.message,
        explicitReleaseRequired: true,
      };
    }
    throw error;
  }

  if (!resolvedTranscript.projected.length) {
    return {
      ok: false,
      status: 409,
      error: "Transcript has no segments to turn into a coaching packet.",
    };
  }

  const transcriptSnapshot = transcriptPacketSnapshotFromProjected(
    resolvedTranscript.projected,
  );
  const packetSegments = resolvedTranscript.projected;
  const { projected: _projected, ...transcriptSnapshotEvidence } =
    transcriptSnapshot;

  const packetTitle = sessionRecapTitle(job.room?.title);
  const purpose = packetPurpose(job.room?.purpose);
  const existing = await args.prisma.coachingNote.findFirst({
    where: {
      roomId: job.roomId,
      authorUserId: args.authorUserId || null,
      kind: "SUMMARY",
      OR: TRANSCRIPT_PACKET_SOURCES.map((source) => ({
        sourceJson: { path: ["source"], equals: source },
      })),
    },
    include: { actionItems: true },
    orderBy: { createdAt: "desc" },
  });

  if (
    existing &&
    !args.force &&
    packetCreatesOrdinarySessionWork(existing.sourceJson) &&
    packetTemplateMatches(existing.sourceJson) &&
    packetSnapshotMatchesResolvedSession(
      existing.sourceJson,
      resolvedTranscript,
    )
  ) {
    const existingSource =
      typeof existing.sourceJson === "object" && existing.sourceJson !== null
        ? (existing.sourceJson as Record<string, any>)
        : {};
    const existingReviewLanes = Array.isArray(existingSource.reviewLanes)
      ? existingSource.reviewLanes
      : [];
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
      actionCandidateIds: existingActionCandidates.map(
        (candidate) => candidate.id,
      ),
      actionCandidateCount: existingActionCandidates.length,
      actionItemCount: committedActionItems.length,
      reviewLanes: existingReviewLanes,
      reviewLaneCount: existingReviewLanes.length,
      reviewLaneReadyCount: existingReviewLanes.filter(
        (lane: any) => lane?.status === "READY_FOR_HUMAN_REVIEW",
      ).length,
      reusedExistingPacket: true,
      transcriptSnapshotSha256: transcriptSnapshot.sha256,
      humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
      providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
      transcriptSourceCount: resolvedTranscript.sources.length,
    };
  }

  const packetSpans = buildTranscriptEvidenceSpans(packetSegments);
  const highlights = [...packetSpans]
    .map((segment: any) => ({ segment, score: scoreHighlight(segment) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.segment);

  const actionSegments = packetSpans
    .filter((segment: any) =>
      ACTION_PATTERNS.some((pattern) => pattern.test(cleanText(segment.text))),
    )
    .slice(0, 10);

  const packetBuildId = randomUUID();
  const sourceJson = {
    source: TRANSCRIPT_PACKET_SOURCE,
    packetBuildId,
    transcriptJobId: job.id,
    recordingAssetId: job.assetId,
    roomId: job.roomId,
    provider: resolvedTranscript.multiSource
      ? "session-source-projection"
      : job.provider,
    transcriptSources: resolvedTranscript.sources,
    transcriptAssembly: {
      schema: resolvedTranscript.schema,
      multiSource: resolvedTranscript.multiSource,
      sourceCount: resolvedTranscript.sources.length,
      programClock: resolvedTranscript.programClock,
    },
    packetPurpose: purpose,
    packetTemplateVersion: SESSION_PACKET_TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    deterministic: true,
    reviewRequired: false,
    transcriptSnapshot: transcriptSnapshotEvidence,
    transcriptReviewCoverage: {
      segmentCount: transcriptSnapshot.segmentCount,
      humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
      providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
      fullyHumanReviewed: transcriptSnapshot.providerOnlySegmentCount === 0,
    },
  };

  const reviewLanes = buildTranscriptPacketReviewLanes(
    purpose,
    packetSpans,
    highlights,
    actionSegments,
  );
  const packetBrief = buildTranscriptPacketBrief(
    packetSpans,
    highlights,
    actionSegments,
  );
  const goalSegments = actionSegments.filter((segment: any) =>
    GOAL_PATTERN.test(cleanText(segment.text)),
  );
  const taskSegments = actionSegments.filter(
    (segment: any) => !GOAL_PATTERN.test(cleanText(segment.text)),
  );
  const actionCandidates: TranscriptActionCandidate[] = taskSegments.map(
    (segment: any) => {
      const sourceTranscriptJobId =
        cleanText(segment.transcriptJobId) || job.id;
      const sourceRecordingAssetId =
        cleanText(segment.recordingAssetId) || job.assetId;
      return transcriptActionCandidate({
        segment,
        transcriptJobId: sourceTranscriptJobId,
        recordingAssetId: sourceRecordingAssetId,
        roomId: job.roomId,
        packetBuildId,
        committedActionItemId: packetWorkId(
          "task",
          sourceTranscriptJobId,
          String(segment.id),
        ),
      });
    },
  );
  const goalOutputs = goalSegments.map((segment: any) => {
    const sourceTranscriptJobId = cleanText(segment.transcriptJobId) || job.id;
    return {
      id: packetWorkId("goal", sourceTranscriptJobId, String(segment.id)),
      segment,
      transcriptJobId: sourceTranscriptJobId,
      recordingAssetId: cleanText(segment.recordingAssetId) || job.assetId,
      title: actionTitle(segment),
    };
  });

  const summaryNote = await args.prisma.coachingNote.create({
    data: {
      roomId: job.roomId,
      bookingId: job.room?.bookingId ?? null,
      engagementId: job.room?.coachingEngagementId ?? null,
      authorUserId: args.authorUserId || null,
      kind: "SUMMARY",
      visibility: "SESSION_SHARED",
      title: packetTitle,
      body: summarizeSegments(purpose, packetSegments, packetBrief),
      sourceJson: {
        ...sourceJson,
        packetBrief,
        reviewLanes,
        reviewLaneCount: reviewLanes.length,
        reviewLaneReadyCount: reviewLanes.filter(
          (lane) => lane.status === "READY_FOR_HUMAN_REVIEW",
        ).length,
        actionCandidateKind: TRANSCRIPT_ACTION_CANDIDATE_KIND,
        actionCandidates,
        actionCandidateCount: actionCandidates.length,
        outcomeBehavior:
          "Quipsly created editable follow-through in the Session. Source timing remains visible and every item can be changed or removed.",
        goalOutputs: goalOutputs.map((goal) => ({
          id: goal.id,
          transcriptJobId: goal.transcriptJobId,
          recordingAssetId: goal.recordingAssetId,
          segmentId: String(goal.segment.id),
          title: goal.title,
        })),
      },
    },
  });

  const defaultOwnerUserId =
    job.room?.coachingEngagement?.primaryClientUserId ||
    args.authorUserId ||
    job.room?.createdByUserId ||
    null;
  const actionItems = [];
  for (const candidate of actionCandidates) {
    const programSegment = packetSegments.find(
      (segment) =>
        segment.id === candidate.segmentId &&
        (cleanText(segment.transcriptJobId) || job.id) ===
          candidate.transcriptJobId,
    );
    const sourceJson = {
      schema: "quipsly-transcript-follow-through-v1",
      origin: "quipsly-session-follow-through",
      automaticallyCreated: true,
      editableAfterCreation: true,
      removableInProduct: true,
      sourceProvenanceVisible: true,
      transcriptJobId: candidate.transcriptJobId,
      recordingAssetId: candidate.recordingAssetId,
      roomId: job.roomId,
      packetBuildId,
      packetSummaryNoteId: summaryNote.id,
      actionCandidateId: candidate.id,
      segmentId: candidate.segmentId,
      segmentIds: candidate.segmentIds,
      sourceTextSha256: candidate.sourceTextSha256,
      sourceSpan: candidate.sourceSpan,
      startSeconds: candidate.startSeconds,
      endSeconds: candidate.endSeconds,
      sourceStartSeconds: candidate.startSeconds,
      sourceEndSeconds: candidate.endSeconds,
      programStartSeconds:
        programSegment?.startSeconds ?? candidate.startSeconds,
      programEndSeconds: programSegment?.endSeconds ?? candidate.endSeconds,
      speakerLabel: candidate.speakerLabel,
      visibility: "engagement-shared",
      externalSideEffects: false,
    };
    const existing = await args.prisma.actionItem.findUnique({
      where: { id: candidate.committedActionItemId },
    });
    const item =
      existing ||
      (await args.prisma.actionItem.create({
        data: {
          id: candidate.committedActionItemId,
          roomId: job.roomId,
          bookingId: job.room?.bookingId ?? null,
          projectId: job.room?.projectId ?? null,
          engagementId: job.room?.coachingEngagementId ?? null,
          noteId: summaryNote.id,
          assignedUserId: defaultOwnerUserId,
          title: candidate.title,
          detail: candidate.detail || null,
          status: "OPEN",
          sourceJson,
        },
      }));
    actionItems.push(item);
  }

  const goals = [];
  if (defaultOwnerUserId) {
    for (const output of goalOutputs) {
      const sourceAnchor = buildTranscriptSourceAnchorFields(
        sourceClockSegments(output.segment),
      );
      const existing = await args.prisma.goal.findUnique({
        where: { id: output.id },
      });
      const goal =
        existing ||
        (await args.prisma.goal.create({
          data: {
            id: output.id,
            ownerUserId: defaultOwnerUserId,
            roomId: job.roomId,
            bookingId: job.room?.bookingId ?? null,
            projectId: job.room?.projectId ?? null,
            engagementId: job.room?.coachingEngagementId ?? null,
            title: output.title,
            description: segmentLine(output.segment),
            status: "ACTIVE",
            sourceJson: {
              schema: "quipsly-transcript-follow-through-v1",
              origin: "quipsly-session-follow-through",
              automaticallyCreated: true,
              editableAfterCreation: true,
              removableInProduct: true,
              sourceProvenanceVisible: true,
              transcriptJobId: output.transcriptJobId,
              recordingAssetId: output.recordingAssetId,
              roomId: job.roomId,
              packetBuildId,
              packetSummaryNoteId: summaryNote.id,
              segmentId: String(output.segment.id),
              segmentIds: output.segment.segmentIds,
              sourceTextSha256: output.segment.sourceTextSha256,
              sourceSpan: sourceAnchor?.sourceSpan ?? null,
              startSeconds:
                output.segment.sourceStartSeconds ??
                output.segment.startSeconds,
              endSeconds:
                output.segment.sourceEndSeconds ?? output.segment.endSeconds,
              sourceStartSeconds:
                output.segment.sourceStartSeconds ??
                output.segment.startSeconds,
              sourceEndSeconds:
                output.segment.sourceEndSeconds ?? output.segment.endSeconds,
              programStartSeconds: output.segment.startSeconds,
              programEndSeconds: output.segment.endSeconds,
              speakerLabel: output.segment.speakerLabel,
              visibility: "engagement-shared",
              externalSideEffects: false,
            },
          },
        }));
      goals.push(goal);
    }
  }

  const highlightNotes = [];
  for (const segment of highlights) {
    const note = await args.prisma.coachingNote.create({
      data: {
        roomId: job.roomId,
        bookingId: job.room?.bookingId ?? null,
        engagementId: job.room?.coachingEngagementId ?? null,
        authorUserId: args.authorUserId || null,
        kind: "HIGHLIGHT",
        visibility: "SESSION_SHARED",
        title: titleFromSegment(segment),
        body: segmentLine(segment),
        sourceJson: {
          ...sourceJson,
          transcriptJobId: cleanText(segment.transcriptJobId) || job.id,
          recordingAssetId: cleanText(segment.recordingAssetId) || job.assetId,
          segmentId: segment.id,
          segmentIds: Array.isArray(segment.segmentIds)
            ? segment.segmentIds
            : [segment.id],
          sourceTextSha256:
            cleanText(segment.sourceTextSha256) ||
            packetSha256(cleanText(segment.text)),
          startSeconds: segment.sourceStartSeconds ?? segment.startSeconds,
          endSeconds: segment.sourceEndSeconds ?? segment.endSeconds,
          sourceStartSeconds:
            segment.sourceStartSeconds ?? segment.startSeconds,
          sourceEndSeconds: segment.sourceEndSeconds ?? segment.endSeconds,
          programStartSeconds: segment.startSeconds,
          programEndSeconds: segment.endSeconds,
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
    actionItemIds: actionItems.map((item: any) => item.id),
    goalIds: goals.map((goal: any) => goal.id),
    highlightCount: highlightNotes.length,
    actionCandidateCount: actionCandidates.length,
    actionItemCount: actionItems.length,
    goalCount: goals.length,
    reviewLanes,
    reviewLaneCount: reviewLanes.length,
    reviewLaneReadyCount: reviewLanes.filter(
      (lane) => lane.status === "READY_FOR_HUMAN_REVIEW",
    ).length,
    reusedExistingPacket: false,
    rebuiltForTranscriptReviewChange: Boolean(existing && !args.force),
    transcriptSnapshotSha256: transcriptSnapshot.sha256,
    humanReviewedSegmentCount: transcriptSnapshot.humanReviewedSegmentCount,
    providerOnlySegmentCount: transcriptSnapshot.providerOnlySegmentCount,
    transcriptSourceCount: resolvedTranscript.sources.length,
  };
}
