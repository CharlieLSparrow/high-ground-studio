import "server-only";

export const CURRENT_TRANSCRIPT_CONSENT_HOLD_CODE =
  "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED";

export async function quarantineRoomTranscriptsForConsentChange(input: {
  prisma: any;
  roomId: string;
  changedByUserId: string;
  consentAction: "GRANT" | "DECLINE" | "REVOKE";
}) {
  const jobs = await input.prisma.transcriptJob.findMany({
    where: {
      roomId: input.roomId,
      status: { in: ["QUEUED", "RUNNING", "COMPLETED"] },
    },
    select: {
      id: true,
      status: true,
      processingResultObject: true,
      providerResponseObject: true,
      resultJson: true,
      _count: { select: { segments: true, words: true } },
    },
  });
  const heldAt = new Date().toISOString();
  let projectedTranscriptCount = 0;
  for (const job of jobs) {
    const segmentCount = Number(job._count?.segments || 0);
    const wordCount = Number(job._count?.words || 0);
    const hadProjectedText = segmentCount > 0 || wordCount > 0;
    const workerResultPreservedPrivately = Boolean(
      job.processingResultObject || job.providerResponseObject,
    );
    if (hadProjectedText) projectedTranscriptCount += 1;
    await input.prisma.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "HELD",
        provider: "processing-hold",
        errorMessage:
          "Current all-party transcription consent is required before "
          + "transcript processing or disclosure.",
        resultJson: {
          ...jsonObject(job.resultJson),
          source: "capture-transcript-consent-quarantine",
          hold: {
            code: CURRENT_TRANSCRIPT_CONSENT_HOLD_CODE,
            message:
              "Current all-party transcription consent is required before "
              + "transcript processing or disclosure.",
            heldAt,
            changedByUserId: input.changedByUserId,
            consentAction: input.consentAction,
            workerResultPreservedPrivately,
            transcriptTextProjected: hadProjectedText,
            projectedRowsPreservedButQuarantined: hadProjectedText,
            segmentCount,
            wordCount,
            explicitReleaseRequired: true,
          },
        },
      },
    });
  }
  return {
    transcriptJobCount: jobs.length,
    projectedTranscriptCount,
    transcriptRowsDeleted: false,
    sourceMediaMutated: false,
  };
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
