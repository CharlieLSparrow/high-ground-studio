/** @jest-environment node */

import { recordMobileCaptureIngestion } from "./mobile-capture-records";

jest.mock("server-only", () => ({}));

describe("mobile capture transcript durability", () => {
  it.each([true, false])("persists the transcript expectation and retains only source-matched analysis (match=%s)", async (matchesSource) => {
    const soundAnalysis = {
      schemaVersion: 1, analysisId: "audible_analysis_ingest_retry", supersedesAnalysisId: null,
      status: "completed", algorithm: "apple-sound-classifier-file-v1", classifierIdentifier: "SNClassifierIdentifierVersion1",
      analyzedAt: "2026-09-09T18:00:00Z", sourceSHA256: (matchesSource ? "a" : "c").repeat(64), sourceByteCount: 48_000, durationSeconds: 3600,
      requestedWindowDurationSeconds: 1.5, effectiveWindowDurationSeconds: 1.5, overlapFactor: 0.5,
      minimumCandidateConfidence: 0.35, knownClassificationCount: 300, knownClassificationsSHA256: "b".repeat(64),
      resultWindowCount: 12, suggestions: [], failureCode: null, failureDetail: null,
      boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true,
        noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
    };
    const room = {
      id: "room-1",
      createdByUserId: "coach-1",
      projectSlug: "coach-home",
      recordingStartedAt: null,
      nestSlug: "coach-home",
      metadataJson: {},
    };
    const participant = {
      id: "participant-1",
      roomId: room.id,
      userId: "coach-1",
      accessStatus: "ACTIVE",
      deviceLabel: "iPhone",
      connectionJson: {},
    };
    const consent = {
      id: "consent-1",
      roomId: room.id,
      participantId: participant.id,
      userId: "coach-1",
      status: "GRANTED",
      consentedAt: new Date("2026-09-01T10:00:00.000Z"),
      revokedAt: null,
      canRecordAudio: true,
      canRecordVideo: true,
      canTranscribe: true,
    };
    const asset = {
      id: "recording-1",
      roomId: room.id,
      participantId: participant.id,
      status: "VERIFIED",
      kind: "LOCAL_AUDIO",
      fileName: "session.m4a",
      contentType: "audio/mp4",
      recordedStartedAt: new Date("2026-09-01T10:00:00.000Z"),
      recordedStoppedAt: new Date("2026-09-01T11:00:00.000Z"),
      durationSeconds: 3_600,
      localManifestJson: { reportedSourceProfile: { audibleEventAnalysis: soundAnalysis } },
      updatedAt: new Date("2026-09-09T18:00:01Z"),
      segmentsJson: [],
    };
    const prisma = {
      callRoom: {
        findFirst: jest.fn().mockResolvedValue(room),
        update: jest.fn().mockResolvedValue(room),
      },
      callParticipant: {
        findFirst: jest.fn().mockResolvedValue(participant),
        update: jest.fn().mockResolvedValue(participant),
      },
      recordingConsent: {
        findFirst: jest.fn().mockResolvedValue(consent),
      },
      recordingAsset: {
        findFirst: jest.fn().mockResolvedValue(asset),
        update: jest.fn().mockResolvedValue(asset),
      },
      uploadChunk: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      transcriptJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "transcript-1",
          ...data,
        })),
      },
    };

    await recordMobileCaptureIngestion({
      prisma,
      actorUserId: "coach-1",
      actorEmail: "coach@example.test",
      sessionId: "upload-1",
      fileName: "session.m4a",
      contentType: "audio/mp4",
      sizeBytes: 48_000,
      checksumSha256: "a".repeat(64),
      exactBytesVerified: true,
      provider: "gcs",
      projectSlug: "coach-home",
      sourceType: "audio",
      callRoomId: room.id,
      participantId: participant.id,
      recordingConsentId: consent.id,
      recordingAssetId: asset.id,
      startedAt: "2026-09-01T10:00:00.000Z",
      stoppedAt: "2026-09-01T11:00:00.000Z",
      processingDisposition: "RELEASED",
      transcriptionDisposition: "RELEASED",
      onDeviceTranscriptExpected: true,
    });

    expect(prisma.recordingAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: asset.id, updatedAt: asset.updatedAt },
      data: expect.objectContaining({ localManifestJson: expect.objectContaining({
        reportedSourceProfile: matchesSource
          ? expect.objectContaining({ audibleEventAnalysis: soundAnalysis })
          : expect.not.objectContaining({ audibleEventAnalysis: expect.anything() }),
      }) }),
    }));
    expect(prisma.transcriptJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: asset.id,
        status: "QUEUED",
        provider: "pending",
        resultJson: expect.objectContaining({
          deviceTranscriptExpectation: expect.objectContaining({
            expected: true,
            state: "awaiting-device",
            actorUserId: "coach-1",
            actorEmail: "coach@example.test",
            graceSeconds: 8_100,
            recordingDurationSeconds: 3_600,
          }),
        }),
      }),
    });
  });
});
