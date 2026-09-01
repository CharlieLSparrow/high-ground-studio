import "server-only";

export const CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_STALE_SCHEMA =
  "quipsly-capture-transcript-follow-through-stale-v1" as const;

export type CaptureTranscriptFollowThroughStaleReason =
  | "accepted-transcript-correction"
  | "confirmed-transcript-segment"
  | "accepted-speaker-attribution";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Makes a successful transcript decision durable across the response boundary.
 *
 * The ordinary request path also starts an immediate follow-through refresh,
 * but `after()` is deliberately best-effort. Marking the already-materialized
 * result stale in the same transaction lets the scheduled worker discover and
 * rebuild it if the process exits after returning the transcript decision.
 */
export async function markCaptureTranscriptFollowThroughStale(input: {
  prisma: any;
  transcriptJobId: string;
  reason: CaptureTranscriptFollowThroughStaleReason;
  changedAt?: Date;
}) {
  const transcriptJobId = text(input.transcriptJobId);
  if (!transcriptJobId) {
    throw new Error("A transcript job is required to invalidate follow-through.");
  }
  const job = await input.prisma.transcriptJob.findUnique({
    where: { id: transcriptJobId },
    select: { resultJson: true },
  });
  if (!job) {
    throw new Error("The transcript job disappeared before follow-through could be invalidated.");
  }
  const resultJson = object(job.resultJson);
  const followThrough = object(resultJson.followThrough);
  const packetStatus = text(followThrough.packetStatus).toLowerCase();
  const hasMaterializedWork =
    packetStatus === "ready" ||
    text(followThrough.packetBuildId) !== "" ||
    text(followThrough.summaryNoteId) !== "";

  // A transcript with no materialized work is already selected by the worker's
  // not-ready query. Avoid inventing a stale state before anything exists.
  if (!hasMaterializedWork) {
    return { marked: false, status: packetStatus || "not-materialized" } as const;
  }
  if (
    packetStatus === "stale" &&
    text(object(followThrough.stale).reason) === input.reason
  ) {
    return { marked: false, status: "stale" } as const;
  }

  const changedAt = input.changedAt ?? new Date();
  await input.prisma.transcriptJob.update({
    where: { id: transcriptJobId },
    data: {
      resultJson: {
        ...resultJson,
        followThrough: {
          ...followThrough,
          packetStatus: "stale",
          stale: {
            schema: CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_STALE_SCHEMA,
            reason: input.reason,
            changedAt: changedAt.toISOString(),
            durableWorkerRebuildRequired: true,
          },
        },
      },
    },
  });
  return { marked: true, status: "stale" } as const;
}
