import "server-only";

import { runExpiredDeviceTranscriptFallbackMaintenance } from "@/lib/server/capture-device-transcript-fallback-worker";
import { reconcileCaptureTranscriptFollowThrough } from "@/lib/server/capture-transcript-follow-through";
import { authorizeGoogleOidcWorker } from "@/lib/server/google-oidc-worker-auth";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
type RecoveryCandidate = { id: string; followThroughCheckedAt: Date | null };

// Null means never checked. Move each attempted job behind its peers even if
// processing fails without modifying the transcript. Business updatedAt must
// not be used as a queue cursor: it also drives stale-source recovery and UI.
const recoveryOrder = [
  { followThroughCheckedAt: { sort: "asc", nulls: "first" } },
  { id: "asc" },
] as const;
const recoverySelect = { id: true, followThroughCheckedAt: true } as const;

export async function authorizeCaptureTranscriptFollowThroughWorker(input: {
  authorization: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
  verifyIdToken?: (input: { idToken: string; audience: string }) => Promise<{
    email?: string | null;
    emailVerified?: boolean | null;
  }>;
}) {
  const environment = input.environment ?? process.env;
  return authorizeGoogleOidcWorker({
    authorization: input.authorization,
    expectedEmail: environment.CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SERVICE_ACCOUNT,
    audience: environment.CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE,
    verifyIdToken: input.verifyIdToken,
  });
}

export async function runCaptureTranscriptFollowThroughMaintenance(input: {
  prisma: any;
  limit?: number;
}) {
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Capture transcript follow-through limit must be between 1 and ${MAX_LIMIT}.`);
  }

  const deviceTranscriptFallback = await runExpiredDeviceTranscriptFallbackMaintenance({
    prisma: input.prisma,
    limit,
  }).catch(() => ({
    schema: "quipsly-capture-device-transcript-fallback-maintenance-v1",
    scanned: 0,
    deferred: 0,
    expired: 0,
    attempted: 0,
    queued: 0,
    completed: 0,
    held: 0,
    failed: 1,
    results: [],
    maintenanceRetryable: true,
  }));

  const unfinishedPacket = { NOT: {
    resultJson: { path: ["followThrough", "packetStatus"], equals: "ready" },
  } };
  const now = new Date();
  // An explicit build can have ordinary work already available before its
  // semantic upgrade finishes. Recover that analysis independently of the
  // older packet's ready flag; do not backfill all historical Sessions.
  const unfinishedAnalysis = { room: { followThroughAnalysis: { is: { OR: [
    { status: "completed" },
    { status: "running", leaseUntil: { lte: now } },
    { status: "failed", attemptCount: { lt: 3 }, OR: [
      { nextAttemptAt: null }, { nextAttemptAt: { lte: now } },
    ] },
  ] } } } };

  const [progressing, held, interruptedCompleted] = await Promise.all([
    input.prisma.transcriptJob.findMany({
      where: {
        roomId: { not: null },
        status: { in: ["QUEUED", "RUNNING"] },
      },
      orderBy: recoveryOrder,
      take: limit,
      select: recoverySelect,
    }),
    input.prisma.transcriptJob.findMany({
      where: { roomId: { not: null }, status: "HELD" },
      orderBy: recoveryOrder,
      take: limit,
      select: recoverySelect,
    }),
    input.prisma.transcriptJob.findMany({
      where: {
        roomId: { not: null },
        status: "COMPLETED",
        ...(process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED === "true"
          ? { OR: [unfinishedPacket, unfinishedAnalysis] } : unfinishedPacket),
      },
      orderBy: recoveryOrder,
      take: limit,
      select: recoverySelect,
    }),
  ]);
  const candidates = fairCandidateSelection({ progressing, held, interruptedCompleted, limit });
  const settled = await Promise.allSettled(candidates.map(async (candidate) => {
    // Persist before IO: a process exit cannot strand the same oldest jobs at
    // the head forever. This is a sweep claim, not a processing lease; existing
    // source/analysis locks still own deduplication and paid retry policy.
    if (!await claimTranscriptFollowThroughCheck(input.prisma, candidate)) return null;
    return reconcileCaptureTranscriptFollowThrough({
      prisma: input.prisma,
      transcriptJobId: candidate.id,
      runAnalysis: true,
    });
  }));

  const results = settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : {
        transcriptJobId: candidates[index]!.id,
        transcriptStatus: "failed" as const,
        packetStatus: "build-held" as const,
        packetBuildId: null,
        reusedExistingPacket: false,
        retryable: true,
      }).filter((result): result is NonNullable<typeof result> => result !== null);
  return {
    schema: "quipsly-capture-transcript-follow-through-maintenance-v1",
    deviceTranscriptFallback,
    scanned: candidates.length,
    superseded: settled.filter((result) => result.status === "fulfilled" && result.value === null).length,
    ready: results.filter((result) => result.packetStatus === "ready").length,
    waiting: results.filter((result) => result.packetStatus === "waiting").length,
    held: results.filter((result) => result.packetStatus === "build-held" || result.packetStatus === "author-missing").length,
    failed: settled.filter((result) => result.status === "rejected").length,
    results,
    boundaries: {
      ordinarySessionWorkCreated: true,
      candidateOnly: false,
      canonicalAccessApplied: true,
      authorPrivate: false,
      automaticAssignment: true,
      automaticSharing: true,
      automaticExternalDelivery: false,
      externalSideEffects: false,
    },
  };
}

export async function claimTranscriptFollowThroughCheck(prisma: any, candidate: RecoveryCandidate): Promise<boolean> {
  // Parameterized SQL changes only the cursor, avoiding Prisma's automatic
  // updatedAt write. Compare-and-set prevents two scans of the same snapshot
  // from dispatching it twice. Advance at least 1ms for same-tick claims.
  const count = await prisma.$executeRaw`
    UPDATE "TranscriptJob"
    SET "followThroughCheckedAt" = GREATEST(
      ${new Date()}::timestamp, "followThroughCheckedAt" + INTERVAL '1 millisecond'
    )
    WHERE "id" = ${candidate.id}
      AND "followThroughCheckedAt" IS NOT DISTINCT FROM ${candidate.followThroughCheckedAt}::timestamp
  `;
  return count === 1;
}

function fairCandidateSelection(input: {
  progressing: RecoveryCandidate[];
  held: RecoveryCandidate[];
  interruptedCompleted: RecoveryCandidate[];
  limit: number;
}) {
  if (input.limit < 3) {
    // Small maintenance batches cannot reserve a slot for every lane. Use the
    // shared cursor across lanes rather than permanently excluding HELD work.
    return [...new Map([...input.progressing, ...input.held, ...input.interruptedCompleted]
      .map(job => [job.id, job])).values()]
      .sort((left, right) => {
        const leftTime = left.followThroughCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const rightTime = right.followThroughCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        return leftTime === rightTime ? left.id.localeCompare(right.id) : leftTime - rightTime;
      }).slice(0, input.limit);
  }
  const completedQuota = input.limit >= 2 ? Math.max(1, Math.floor(input.limit / 4)) : 0;
  const heldQuota = input.limit >= 3 ? Math.max(1, Math.floor(input.limit / 4)) : 0;
  const progressingQuota = input.limit - completedQuota - heldQuota;
  const selected = [
    ...input.progressing.slice(0, progressingQuota),
    ...input.interruptedCompleted.slice(0, completedQuota),
    ...input.held.slice(0, heldQuota),
  ];
  const overflow = [
    ...input.progressing.slice(progressingQuota),
    ...input.interruptedCompleted.slice(completedQuota),
    ...input.held.slice(heldQuota),
  ];
  return [...new Map([...selected, ...overflow].map((job) => [job.id, job])).values()].slice(0, input.limit);
}
