import "server-only";

import { ensureCaptureTranscriptProcessingQueued } from "@/lib/server/capture-transcript-processing";
import {
  CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA,
  parseCaptureDeviceTranscriptExpectation,
} from "@/lib/server/capture-device-transcript-expectation";

const SCAN_MULTIPLIER = 25;
const MAX_SCAN = 500;

type FallbackResult = {
  transcriptJobId: string;
  status: "queued" | "processing" | "completed" | "held" | "configuration-required" | "failed";
  executionRequested: boolean;
  retryable: boolean;
};

/**
 * Recovers verified recordings whose device-first transcript never arrived.
 * The existing cloud transcript outbox performs a fresh source-integrity and
 * consent check, so an expired promise cannot bypass either boundary.
 */
export async function runExpiredDeviceTranscriptFallbackMaintenance(input: {
  prisma: any;
  limit: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const candidates = await input.prisma.transcriptJob.findMany({
    where: {
      roomId: { not: null },
      status: "QUEUED",
      provider: "pending",
      resultJson: {
        path: ["deviceTranscriptExpectation", "schema"],
        equals: CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    // A long recording can have a later deadline than a newer short note.
    // Scan beyond the execution limit so createdAt ordering cannot let a small
    // group of long device jobs hide already-expired short captures.
    take: Math.min(MAX_SCAN, input.limit * SCAN_MULTIPLIER),
    select: { id: true, resultJson: true },
  });
  const expiredCandidates: Array<{
    job: { id: string; resultJson: unknown };
    expectation: NonNullable<ReturnType<typeof parseCaptureDeviceTranscriptExpectation>>;
  }> = [];
  for (const job of candidates as Array<{ id: string; resultJson: unknown }>) {
    const expectation = parseCaptureDeviceTranscriptExpectation(job.resultJson);
    if (
      expectation
      && new Date(expectation.fallbackAfter).getTime() <= now.getTime()
    ) {
      expiredCandidates.push({ job, expectation });
    }
  }
  const expired = expiredCandidates.slice(0, input.limit);

  const settled = await Promise.allSettled(expired.map(async ({ job, expectation }) => {
    const queued = await ensureCaptureTranscriptProcessingQueued({
      prisma: input.prisma,
      transcriptJobId: job.id,
      actorUserId: expectation.actorUserId,
      actorEmail: expectation.actorEmail,
    });
    return {
      transcriptJobId: job.id,
      status: queued.status,
      executionRequested: queued.executionRequested,
      retryable: queued.status === "configuration-required",
    } satisfies FallbackResult;
  }));
  const results: FallbackResult[] = settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : {
        transcriptJobId: expired[index]!.job.id,
        status: "failed",
        executionRequested: false,
        retryable: true,
      });

  return {
    schema: "quipsly-capture-device-transcript-fallback-maintenance-v1",
    scanned: candidates.length,
    deferred: candidates.length - expiredCandidates.length,
    expired: expiredCandidates.length,
    attempted: expired.length,
    queued: results.filter((result) => result.status === "queued" || result.status === "processing").length,
    completed: results.filter((result) => result.status === "completed").length,
    held: results.filter((result) => result.status === "held").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
