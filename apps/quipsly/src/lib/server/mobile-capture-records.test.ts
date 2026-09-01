/** @jest-environment node */

import { recordMobileCaptureIngestion } from "./mobile-capture-records";

jest.mock("server-only", () => ({}));

describe("mobile capture transcript durability", () => {
  it("persists a time-bounded device transcript expectation with the canonical job", async () => {
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
      localManifestJson: {},
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
