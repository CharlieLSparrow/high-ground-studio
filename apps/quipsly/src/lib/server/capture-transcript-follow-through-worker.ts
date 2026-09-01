import "server-only";

import { runExpiredDeviceTranscriptFallbackMaintenance } from "@/lib/server/capture-device-transcript-fallback-worker";
import { reconcileCaptureTranscriptFollowThrough } from "@/lib/server/capture-transcript-follow-through";
import { authorizeGoogleOidcWorker } from "@/lib/server/google-oidc-worker-auth";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

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

  const [progressing, held, interruptedCompleted] = await Promise.all([
    input.prisma.transcriptJob.findMany({
      where: {
        roomId: { not: null },
        status: { in: ["QUEUED", "RUNNING"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    }),
    input.prisma.transcriptJob.findMany({
      where: { roomId: { not: null }, status: "HELD" },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    }),
    input.prisma.transcriptJob.findMany({
      where: {
        roomId: { not: null },
        status: "COMPLETED",
        NOT: {
          resultJson: {
            path: ["followThrough", "packetStatus"],
            equals: "ready",
          },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    }),
  ]);
  const candidates = fairCandidateSelection({ progressing, held, interruptedCompleted, limit });
  const settled = await Promise.allSettled(candidates.map((transcriptJobId) =>
    reconcileCaptureTranscriptFollowThrough({
      prisma: input.prisma,
      transcriptJobId,
    })));

  const results = settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : {
        transcriptJobId: candidates[index]!,
        transcriptStatus: "failed" as const,
        packetStatus: "build-held" as const,
        packetBuildId: null,
        reusedExistingPacket: false,
        retryable: true,
      });
  return {
    schema: "quipsly-capture-transcript-follow-through-maintenance-v1",
    deviceTranscriptFallback,
    scanned: candidates.length,
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

function fairCandidateSelection(input: {
  progressing: Array<{ id: string }>;
  held: Array<{ id: string }>;
  interruptedCompleted: Array<{ id: string }>;
  limit: number;
}) {
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
  return [...new Set([...selected, ...overflow].map((job) => job.id))].slice(0, input.limit);
}
