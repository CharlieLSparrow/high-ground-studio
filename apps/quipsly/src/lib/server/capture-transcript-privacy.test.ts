/** @jest-environment node */

import {
  CURRENT_TRANSCRIPT_CONSENT_HOLD_CODE,
  quarantineRoomTranscriptsForConsentChange,
} from "./capture-transcript-privacy";

describe("capture transcript privacy quarantine", () => {
  it("holds active and completed jobs without deleting provider rows", async () => {
    const jobs = [
      {
        id: "job-running",
        status: "RUNNING",
        processingResultObject: null,
        providerResponseObject: null,
        resultJson: { processingControl: { version: 1 } },
        _count: { segments: 0, words: 0 },
      },
      {
        id: "job-completed",
        status: "COMPLETED",
        processingResultObject: "results/job-completed.json",
        providerResponseObject: "provider/job-completed.json",
        resultJson: { providerRequestId: "request-1" },
        _count: { segments: 2, words: 14 },
      },
    ];
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      transcriptJob: {
        findMany: jest.fn().mockResolvedValue(jobs),
        update,
      },
      transcriptSegment: { deleteMany: jest.fn() },
      transcriptWord: { deleteMany: jest.fn() },
      recordingAsset: { update: jest.fn() },
    };

    await expect(quarantineRoomTranscriptsForConsentChange({
      prisma,
      roomId: "room-1",
      changedByUserId: "user-1",
      consentAction: "REVOKE",
    })).resolves.toEqual({
      transcriptJobCount: 2,
      projectedTranscriptCount: 1,
      transcriptRowsDeleted: false,
      sourceMediaMutated: false,
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "job-completed" },
      data: expect.objectContaining({
        status: "HELD",
        resultJson: expect.objectContaining({
          providerRequestId: "request-1",
          hold: expect.objectContaining({
            code: CURRENT_TRANSCRIPT_CONSENT_HOLD_CODE,
            changedByUserId: "user-1",
            consentAction: "REVOKE",
            workerResultPreservedPrivately: true,
            transcriptTextProjected: true,
            projectedRowsPreservedButQuarantined: true,
            segmentCount: 2,
            wordCount: 14,
            explicitReleaseRequired: true,
          }),
        }),
      }),
    }));
    expect(prisma.transcriptSegment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.transcriptWord.deleteMany).not.toHaveBeenCalled();
    expect(prisma.recordingAsset.update).not.toHaveBeenCalled();
  });

  it("is a no-op when every transcript is already held or failed", async () => {
    const prisma = {
      transcriptJob: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    await expect(quarantineRoomTranscriptsForConsentChange({
      prisma,
      roomId: "room-1",
      changedByUserId: "user-1",
      consentAction: "DECLINE",
    })).resolves.toMatchObject({
      transcriptJobCount: 0,
      projectedTranscriptCount: 0,
    });
    expect(prisma.transcriptJob.update).not.toHaveBeenCalled();
  });
});
