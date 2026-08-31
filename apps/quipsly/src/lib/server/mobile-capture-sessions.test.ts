/** @jest-environment node */

jest.mock(
  "@high-ground/quipsly-domain/coaching-lifecycle",
  () => ({ buildQuipslyCoachingLifecycle: jest.fn() }),
  { virtual: true },
);
jest.mock(
  "@high-ground/quipsly-domain/coaching-packet",
  () => ({
    isTranscriptPacketSource: jest.fn(() => false),
    isUnreviewedTranscriptActionItemSource: jest.fn(() => false),
  }),
  { virtual: true },
);

import { recordingContentReadiness } from "./mobile-capture-content-readiness";
import {
  captureGroupStudioHandoff,
  captureSourceSummaries,
  canonicalMobileSessionEpisodeSlug,
  canonicalMobileSessionProductionId,
  canonicalMobileSessionProject,
  mobilePacketReviewLanes,
  mobilePacketTranscriptJobIds,
  mobileSessionCanControlRecording,
  mobileTranscriptResults,
  releasedClientFollowUpForUser,
  registeredParticipantConsentSummary,
} from "./mobile-capture-sessions";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "./mobile-capture-consent-readiness.js";

describe("mobile transcript result projection", () => {
  it("keeps every participant master represented by a reconciled packet", () => {
    expect(
      mobilePacketTranscriptJobIds({
        sourceJson: {
          transcriptJobId: "job-client",
          transcriptSources: [
            { transcriptJobId: "job-coach", recordingAssetId: "asset-coach" },
            { transcriptJobId: "job-client", recordingAssetId: "asset-client" },
            { transcriptJobId: "job-coach", recordingAssetId: "asset-coach" },
          ],
        },
      }),
    ).toEqual(["job-client", "job-coach"]);
  });

  it("returns the ordinary notes, tasks, and goals already created for this transcript", () => {
    const result = mobileTranscriptResults({
      roomId: "room-1",
      transcriptJobId: "job-1",
      summary: { id: "summary-1", title: "Session recap", body: "You chose a next step." },
      highlights: [{
        id: "note-1",
        title: "Keep this",
        body: "A useful insight",
        sourceJson: { segmentId: "segment-1", startSeconds: 12, endSeconds: 19, speakerLabel: "Client" },
      }],
      actionItems: [
        {
          id: "task-1",
          title: "Send the outline",
          detail: "Before Friday",
          status: "OPEN",
          assignedUserId: "client-1",
          sourceJson: {
            origin: "quipsly-session-follow-through",
            roomId: "room-1",
            transcriptJobId: "job-1",
            segmentId: "segment-2",
            startSeconds: 22,
            endSeconds: 28,
            speakerLabel: "Client",
          },
        },
        {
          id: "other-task",
          title: "Unrelated work",
          status: "OPEN",
          sourceJson: { origin: "manual" },
        },
      ],
      goals: [{
        id: "goal-1",
        title: "Practice the conversation",
        status: "ACTIVE",
        ownerUserId: "client-1",
        sourceJson: {
          origin: "quipsly-session-follow-through",
          roomId: "room-1",
          transcriptJobId: "job-1",
          segmentId: "segment-3",
          startSeconds: 31,
          endSeconds: 38,
          speakerLabel: "Client",
        },
      }],
    });

    expect(result).toMatchObject({
      automaticallyCreated: true,
      editable: true,
      removable: true,
      summary: { id: "summary-1", title: "Session recap" },
      notes: [{ id: "note-1", source: { startSeconds: 12, endSeconds: 19 } }],
      tasks: [{ id: "task-1", status: "OPEN", source: { segmentId: "segment-2" } }],
      goals: [{ id: "goal-1", status: "ACTIVE", source: { segmentId: "segment-3" } }],
    });
    expect(result?.tasks).toHaveLength(1);
  });

  it("does not invent results before a transcript-backed summary exists", () => {
    expect(mobileTranscriptResults({ roomId: "room-1", transcriptJobId: "job-1" })).toBeNull();
  });
});

describe("mobile packet review lane projection", () => {
  it("projects only persisted lane review truth and preserves no-side-effect receipts", () => {
    expect(
      mobilePacketReviewLanes({
        sourceJson: {
          reviewLanes: [
            {
              id: "client-follow-up",
              label: "Client follow-up notes",
              status: "APPROVED_FOR_INTERNAL_USE",
              itemCount: 1,
              meaning: "Candidate recap material.",
              sourceTruth: "Derived from transcript packet evidence only.",
              reviewRule: "Human approval is required before client delivery.",
              humanApprovalRequired: false,
              externalSideEffects: false,
              humanReview: {
                status: "APPROVED_FOR_INTERNAL_USE",
                note: "Useful internally.",
                reviewedAt: "2026-08-01T18:30:00.000Z",
                reviewedByUserId: "coach-1",
                externalSideEffects: false,
                deliveryClaimed: false,
                publicationClaimed: false,
              },
            },
            { label: "Malformed lane without an id" },
          ],
        },
      }),
    ).toEqual([
      {
        id: "client-follow-up",
        label: "Client follow-up notes",
        status: "APPROVED_FOR_INTERNAL_USE",
        itemCount: 1,
        meaning: "Candidate recap material.",
        sourceTruth: "Derived from transcript packet evidence only.",
        reviewRule: "Human approval is required before client delivery.",
        humanApprovalRequired: false,
        externalSideEffects: false,
        humanReview: {
          status: "APPROVED_FOR_INTERNAL_USE",
          note: "Useful internally.",
          reviewedAt: "2026-08-01T18:30:00.000Z",
          reviewedByUserId: "coach-1",
          externalSideEffects: false,
          deliveryClaimed: false,
          publicationClaimed: false,
        },
      },
    ]);
  });
});

describe("mobile Session canonical project projection", () => {
  it("uses the relational project and reports legacy slug drift", () => {
    expect(
      canonicalMobileSessionProject({
        projectId: "project-1",
        projectSlug: "stale-high-ground",
        nestSlug: "older-high-ground",
        project: {
          id: "project-1",
          slug: "high-ground",
          name: "High Ground Odyssey",
        },
      }),
    ).toEqual({
      projectId: "project-1",
      projectSlug: "high-ground",
      projectName: "High Ground Odyssey",
      bindingSource: "canonical-session-project",
      legacySlugDrift: true,
    });
  });

  it("retains a labeled legacy fallback only when no canonical relation exists", () => {
    expect(
      canonicalMobileSessionProject({ projectSlug: "legacy-coaching" }),
    ).toEqual({
      projectId: null,
      projectSlug: "legacy-coaching",
      projectName: null,
      bindingSource: "legacy-session-slug",
      legacySlugDrift: false,
    });
  });

  it("leaves a Session unfiled instead of inventing High Ground Odyssey", () => {
    expect(canonicalMobileSessionProject({})).toEqual({
      projectId: null,
      projectSlug: null,
      projectName: null,
      bindingSource: "unfiled-session",
      legacySlugDrift: false,
    });
  });
});

describe("mobile Session canonical episode projection", () => {
  it("uses the first-class same-project production before metadata or offering fallbacks", () => {
    expect(
      canonicalMobileSessionEpisodeSlug({
        id: "room-1",
        purpose: "PODCAST",
        projectId: "project-1",
        episodeProductionId: "production-4",
        episodeProduction: { projectId: "project-1", slug: "episode-4" },
        metadataJson: { episodeSlug: "stale-episode" },
        booking: { offering: { slug: "podcast-offering" } },
      }),
    ).toBe("episode-4");
  });

  it("fails a cross-project relation closed instead of trusting legacy metadata", () => {
    expect(
      canonicalMobileSessionEpisodeSlug({
        id: "room-1",
        purpose: "PODCAST",
        projectId: "project-1",
        episodeProductionId: "production-other",
        episodeProduction: { projectId: "project-2", slug: "episode-other" },
        metadataJson: { episodeSlug: "episode-4" },
      }),
    ).toBe("room-1");
    expect(
      canonicalMobileSessionEpisodeSlug({
        id: "room-coaching",
        purpose: "COACHING",
        projectId: "project-1",
        episodeProductionId: "production-4",
        episodeProduction: { projectId: "project-1", slug: "episode-4" },
        metadataJson: { episodeSlug: "episode-4" },
      }),
    ).toBe("room-coaching");
  });

  it("retains metadata, offering, and room fallbacks only for unbackfilled rows", () => {
    expect(
      canonicalMobileSessionEpisodeSlug({
        id: "room-legacy",
        metadataJson: { episodeSlug: "episode-4-part-2" },
        booking: { offering: { slug: "podcast-offering" } },
      }),
    ).toBe("episode-4-part-2");
    expect(
      canonicalMobileSessionEpisodeSlug({
        id: "room-1",
        booking: { offering: { slug: "legacy-offering" } },
      }),
    ).toBe("legacy-offering");
    expect(canonicalMobileSessionEpisodeSlug({ id: "room-2" })).toBe("room-2");
  });
});

describe("mobile Session production destination projection", () => {
  it("requires the first-class production relation instead of trusting fallback metadata", () => {
    expect(
      canonicalMobileSessionProductionId({
        episodeProductionId: "production-4",
        episodeProduction: { id: "production-4" },
        metadataJson: { episodeSlug: "episode-4" },
      }),
    ).toBe("production-4");
    expect(
      canonicalMobileSessionProductionId({
        metadataJson: { episodeSlug: "episode-4" },
      }),
    ).toBeNull();
    expect(
      canonicalMobileSessionProductionId({
        episodeProductionId: "production-4",
        episodeProduction: { id: "production-other" },
      }),
    ).toBeNull();
  });
});

describe("mobile client follow-up projection", () => {
  const room = {
    booking: { coachUserId: "coach-1" },
    outputs: [
      {
        id: "wrong-kind",
        kind: "OTHER_OUTPUT",
        status: "RELEASED",
        createdByUserId: "coach-1",
        recipientUserId: "client-1",
      },
      {
        id: "draft",
        kind: "CLIENT_FOLLOW_UP",
        status: "DRAFT",
        createdByUserId: "coach-1",
        recipientUserId: "client-1",
      },
      {
        id: "released",
        kind: "CLIENT_FOLLOW_UP",
        status: "RELEASED",
        createdByUserId: "coach-1",
        recipientUserId: "client-1",
      },
    ],
  };

  it("returns the released recipient-bound snapshot to its client and assigned coach", () => {
    expect(releasedClientFollowUpForUser(room, "client-1")).toMatchObject({
      id: "released",
    });
    expect(releasedClientFollowUpForUser(room, "coach-1")).toMatchObject({
      id: "released",
    });
  });

  it("does not broaden follow-up visibility to staff or another Session participant", () => {
    expect(releasedClientFollowUpForUser(room, "producer-1")).toBeNull();
    expect(releasedClientFollowUpForUser(room, "staff-1")).toBeNull();
  });
});

describe("mobile Session recording control projection", () => {
  const base = {
    isStaff: false,
    userId: "user-1",
    createdByUserId: "other-user",
    participantRole: "GUEST",
    bookingCoachUserId: "other-coach",
    projectId: "project-1",
    controlledProjectIds: new Set<string>(),
  };

  it.each(["HOST", "COACH", "PRODUCER"])(
    "allows the conventional %s controller role",
    (participantRole) => {
      expect(
        mobileSessionCanControlRecording({ ...base, participantRole }),
      ).toBe(true);
    },
  );

  it("keeps guests and observers under host recording control", () => {
    expect(mobileSessionCanControlRecording(base)).toBe(false);
    expect(
      mobileSessionCanControlRecording({
        ...base,
        participantRole: "OBSERVER",
      }),
    ).toBe(false);
  });

  it("also recognizes the creator, booked coach, staff, and Nest controller", () => {
    expect(
      mobileSessionCanControlRecording({
        ...base,
        createdByUserId: base.userId,
      }),
    ).toBe(true);
    expect(
      mobileSessionCanControlRecording({
        ...base,
        bookingCoachUserId: base.userId,
      }),
    ).toBe(true);
    expect(mobileSessionCanControlRecording({ ...base, isStaff: true })).toBe(
      true,
    );
    expect(
      mobileSessionCanControlRecording({
        ...base,
        controlledProjectIds: new Set(["project-1"]),
      }),
    ).toBe(true);
  });
});

describe("mobile Session source-specific consent projection", () => {
  const currentEvidence = {
    consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
    consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    recordingChoiceExplicit: true,
    allAudibleParticipantsNotifiedAndAgreed: true,
    presentationEvidence: {
      surface: "quipsly-capture-consent-v2",
      version: 1,
    },
  };

  it("keeps audio, video, and transcript readiness separate for every registered participant", () => {
    const summary = registeredParticipantConsentSummary({
      participants: [
        { id: "host", userId: "user-host", role: "HOST" },
        { id: "guest", userId: "user-guest", role: "GUEST" },
        { id: "observer", userId: "user-observer", role: "OBSERVER" },
      ],
      recordingConsents: [
        {
          id: "consent-host",
          participantId: "host",
          userId: "user-host",
          status: "GRANTED",
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: true,
          canRecordVideo: true,
          canTranscribe: true,
          consentedAt: new Date("2026-07-27T18:00:00Z"),
          revokedAt: null,
          updatedAt: new Date("2026-07-27T18:00:00Z"),
          metadataJson: currentEvidence,
        },
        {
          id: "consent-guest",
          participantId: "guest",
          userId: "user-guest",
          status: "GRANTED",
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: true,
          canRecordVideo: false,
          canTranscribe: false,
          consentedAt: new Date("2026-07-27T18:00:01Z"),
          revokedAt: null,
          updatedAt: new Date("2026-07-27T18:00:01Z"),
          metadataJson: currentEvidence,
        },
      ],
    });

    expect(summary).toEqual({
      requiredCount: 2,
      audioGrantedCount: 2,
      videoGrantedCount: 1,
      transcriptionGrantedCount: 1,
      allAudioGranted: true,
      allVideoGranted: false,
      allTranscriptionGranted: false,
    });
  });

  it("does not count stale policy evidence as source authority", () => {
    const summary = registeredParticipantConsentSummary({
      participants: [{ id: "host", userId: "user-host", role: "HOST" }],
      recordingConsents: [
        {
          id: "stale",
          participantId: "host",
          userId: "user-host",
          status: "GRANTED",
          policyVersion: "stale-policy",
          canRecordAudio: true,
          canRecordVideo: true,
          consentedAt: new Date("2026-07-27T18:00:00Z"),
          revokedAt: null,
          updatedAt: new Date("2026-07-27T18:00:00Z"),
          metadataJson: currentEvidence,
        },
      ],
    });

    expect(summary).toMatchObject({
      audioGrantedCount: 0,
      videoGrantedCount: 0,
      transcriptionGrantedCount: 0,
      allAudioGranted: false,
      allVideoGranted: false,
      allTranscriptionGranted: false,
    });
  });
});

describe("mobile Session recording content readiness", () => {
  it("does not infer content from an empty recording list", () => {
    expect(recordingContentReadiness([], "PODCAST")).toMatchObject({
      status: "none",
      captureAssetCount: 0,
      substantialRecordingCount: 0,
    });
  });

  it("labels short simulator artifacts as capture plumbing proof only", () => {
    expect(
      recordingContentReadiness(
        [
          {
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            verifiedAt: "2026-08-02T18:00:00.000Z",
            durationSeconds: null,
            segmentsJson: [
              { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 3.75 },
              { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 1.57 },
            ],
            localManifestJson: { exactBytesVerified: true },
          },
          {
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            verifiedAt: "2026-08-02T18:00:00.000Z",
            durationSeconds: 5,
            segmentsJson: [
              { deviceKind: "iPhone 17 Pro Simulator", durationSeconds: 5 },
            ],
            localManifestJson: { exactBytesVerified: true },
          },
        ],
        "PODCAST",
      ),
    ).toMatchObject({
      status: "capture-proof-only",
      label: "Capture plumbing proven",
      captureAssetCount: 2,
      knownDurationSeconds: 10.32,
      longestKnownDurationSeconds: 5.32,
      shortCaptureCount: 2,
      simulatorCaptureCount: 2,
      substantialRecordingCount: 0,
    });
  });

  it("requires known duration before calling an asset substantial", () => {
    expect(
      recordingContentReadiness(
        [
          {
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            verifiedAt: "2026-08-02T18:00:00.000Z",
            durationSeconds: null,
            segmentsJson: [],
            localManifestJson: { exactBytesVerified: true },
          },
        ],
        "COACHING",
      ),
    ).toMatchObject({
      status: "capture-proof-only",
      unknownDurationCount: 1,
      substantialRecordingCount: 0,
    });
  });

  it("recognizes a non-simulator take without claiming editorial readiness", () => {
    const result = recordingContentReadiness(
      [
        {
          kind: "LOCAL_AUDIO",
          status: "VERIFIED",
          verifiedAt: "2026-08-02T18:00:00.000Z",
          durationSeconds: 120,
          segmentsJson: [
            { deviceKind: "Wall-E’s iPhone", durationSeconds: 120 },
          ],
          localManifestJson: { exactBytesVerified: true },
        },
      ],
      "PODCAST",
    );
    expect(result).toMatchObject({
      status: "substantial",
      captureAssetCount: 1,
      knownDurationSeconds: 120,
      substantialRecordingCount: 1,
    });
    expect(result.detail).toContain("not editorial or release readiness");
  });

  it("does not count provider receipt slots or transcript references as source media", () => {
    expect(
      recordingContentReadiness(
        [
          {
            kind: "SERVER_MIX",
            localManifestJson: { source: "provider-recording-receipt-slot" },
            durationSeconds: 3600,
          },
          { kind: "TRANSCRIPT_SOURCE", durationSeconds: 3600 },
        ],
        "PODCAST",
      ),
    ).toMatchObject({ status: "none", captureAssetCount: 0 });
  });

  it("does not call local-only metadata substantial before uploaded bytes are verified", () => {
    expect(
      recordingContentReadiness(
        [
          {
            kind: "LOCAL_AUDIO",
            status: "LOCAL_READY",
            durationSeconds: 600,
            segmentsJson: [
              { deviceKind: "Wall-E’s iPhone", durationSeconds: 600 },
            ],
          },
        ],
        "PODCAST",
      ),
    ).toMatchObject({
      status: "capture-proof-only",
      verifiedCaptureCount: 0,
      substantialRecordingCount: 0,
    });
  });

  it("counts independently verified bytes even when processing remains held", () => {
    expect(
      recordingContentReadiness(
        [
          {
            kind: "LOCAL_AUDIO",
            status: "HELD",
            verifiedAt: "2026-08-02T18:00:00.000Z",
            durationSeconds: null,
            segmentsJson: [],
            localManifestJson: { exactBytesVerified: true },
          },
        ],
        "COACHING",
      ),
    ).toMatchObject({
      status: "capture-proof-only",
      verifiedCaptureCount: 1,
      substantialRecordingCount: 0,
    });
  });
});

describe("mobile Session canonical capture sources", () => {
  it("projects exact verification, proxy, transcript, and take identity together", () => {
    const [source] = captureSourceSummaries(
      {
        recordingAssets: [
          {
            id: "recording-1",
            roomId: "room-1",
            fileName: "homer-iphone.mov",
            kind: "LOCAL_VIDEO",
            contentType: "video/quicktime",
            byteSize: BigInt(4_000_000_000),
            checksum: "a".repeat(64),
            storageBucket: "quipsly-private-media",
            storageObjectPath: "mobile/room-1/homer-iphone.mov",
            durationSeconds: 1_800,
            status: "VERIFIED",
            verifiedAt: new Date("2026-07-27T18:31:00Z"),
            recordedStartedAt: new Date("2026-07-27T18:00:00Z"),
            recordedStoppedAt: new Date("2026-07-27T18:30:00Z"),
            localManifestJson: {
              exactBytesVerified: true,
              byteVerificationKind: "server-size-and-sha256",
              storageGeneration: "1742",
              captureGroupId: "take-1",
              reportedSourceProfile: {
                schemaVersion: 1,
                codec: "hevc",
                monotonicStartedNanoseconds: "1500000000",
                clockSamples: [
                  {
                    protocolVersion: 1,
                    sampleId: "sample-1",
                    callRoomId: "room-1",
                    captureGroupId: "take-1",
                    clientKind: "ios",
                    deviceWallSentAt: "2026-07-27T17:59:59.500Z",
                    deviceMonotonicSentNanoseconds: "1000000000",
                    serverReceivedAt: "2026-07-27T17:59:59.560Z",
                    serverSentAt: "2026-07-27T17:59:59.570Z",
                    deviceWallReceivedAt: "2026-07-27T17:59:59.610Z",
                    deviceMonotonicReceivedNanoseconds: "1110000000",
                    networkRoundTripMilliseconds: 100,
                    serverOffsetMilliseconds: 10,
                    uncertaintyMilliseconds: 50,
                    wallClockDiscontinuityMilliseconds: 0,
                  },
                ],
              },
            },
            transcriptJobs: [
              {
                id: "transcript-1",
                status: "FAILED",
                provider: "deepgram",
                errorMessage: "gs://private-bucket/internal-provider-diagnostic.json",
                updatedAt: new Date("2026-07-27T18:31:00Z"),
                _count: { segments: 0, words: 0 },
              },
            ],
          },
        ],
        stateReceipts: [
          {
            receiptId: "start-1",
            roomId: "room-1",
            captureId: "capture-1",
            actorUserId: "user-1",
            action: "START_RECORDING",
            occurredAt: new Date("2026-07-27T17:59:59.900Z"),
            receivedAt: new Date("2026-07-27T18:00:00.050Z"),
            outcome: "APPLIED",
            stateApplied: true,
          },
        ],
        id: "room-1",
      },
      [
        {
          uploadSessionId: "upload-1",
          captureId: "capture-1",
          actorUserId: "user-1",
          startReceiptId: "start-1",
          recordingAssetId: "recording-1",
          roomId: "room-1",
          mediaAssetId: "media-1",
          sourceId: "source-1",
          processingDisposition: "RELEASED",
          transcriptDisposition: "RELEASED",
          metadataJson: {
            immutableUploadBinding: {
              uploadSessionId: "upload-1",
              roomId: "room-1",
              sha256: "a".repeat(64),
              bucketName: "quipsly-private-media",
              objectName: "mobile/room-1/homer-iphone.mov",
              generation: "1742",
              sizeBytes: 4_000_000_000,
            },
          },
        },
      ],
      [
        {
          id: "media-1",
          url: "/api/ingest/media/source-1",
          variants: [],
          proxyAssets: [],
          workflowJobs: [
            {
              type: "asset-proxy",
              status: "queued",
            },
          ],
        },
      ],
    );

    expect(source).toMatchObject({
      recordingAssetId: "recording-1",
      uploadSessionId: "upload-1",
      captureId: "capture-1",
      captureGroupId: "take-1",
      exactBytesVerified: true,
      byteVerificationKind: "server-size-and-sha256",
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      sourceId: "source-1",
      mediaAssetId: "media-1",
      playbackUrl: "/api/ingest/media/source-1",
      sessionPlaybackUrl:
        "/api/sessions/room-1/recordings/recording-1/media",
      sha256: "a".repeat(64),
      alignment: {
        status: "proposal-ready",
        sourceClockEvidence: "lowest-rtt-monotonic-projection",
        estimatedServerStartedAt: "2026-07-27T18:00:00.010Z",
        sampleAccurateClaimed: false,
        reviewRequired: true,
        captureGroup: {
          baselineRecordingAssetId: "recording-1",
          estimatedOffsetMilliseconds: 0,
          proposalSourceCount: 1,
          sampleAccurateClaimed: false,
        },
      },
      proxy: {
        required: true,
        status: "queued",
        sourceOriginalPreserved: true,
      },
      transcript: {
        id: "transcript-1",
        status: "FAILED",
        provider: "deepgram",
        errorMessage: "Quipsly could not finish this transcript. The exact recording remains safe and can be tried again.",
        segmentCount: 0,
        wordCount: 0,
      },
    });
    expect(JSON.stringify(source)).not.toContain("private-bucket");
  });

  it("keeps a released source visible but withholds playback when immutable storage evidence drifts", () => {
    const room = {
      id: "room-1",
      recordingAssets: [{
        id: "recording-1",
        roomId: "room-1",
        kind: "LOCAL_AUDIO",
        contentType: "audio/mp4",
        byteSize: BigInt(1024),
        checksum: "a".repeat(64),
        storageBucket: "quipsly-private-media",
        storageObjectPath: "mobile/room-1/audio.m4a",
        status: "VERIFIED",
        verifiedAt: new Date("2026-08-02T18:00:00Z"),
        localManifestJson: {
          exactBytesVerified: true,
          storageGeneration: "1742",
        },
        transcriptJobs: [],
      }],
      stateReceipts: [],
    };
    const receipts = [{
      uploadSessionId: "upload-1",
      captureId: "capture-1",
      roomId: "room-1",
      recordingAssetId: "recording-1",
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
      metadataJson: {
        immutableUploadBinding: {
          roomId: "room-1",
          sha256: "b".repeat(64),
          bucketName: "quipsly-private-media",
          objectName: "mobile/room-1/audio.m4a",
          generation: "1742",
          sizeBytes: 1024,
        },
      },
    }];

    const [source] = captureSourceSummaries(room, receipts, []);
    expect(source).toMatchObject({
      recordingAssetId: "recording-1",
      recordingStatus: "VERIFIED",
      processingDisposition: "RELEASED",
      exactBytesVerified: true,
      sessionPlaybackUrl: null,
    });
  });

  it("keeps completed transcript status bound to each participant source instead of one room-level latest job", () => {
    const sources = captureSourceSummaries(
      {
        id: "room-joint",
        stateReceipts: [],
        recordingAssets: [
          {
            id: "recording-coach",
            roomId: "room-joint",
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            byteSize: BigInt(2_048),
            checksum: "c".repeat(64),
            localManifestJson: { exactBytesVerified: true },
            transcriptJobs: [{
              id: "transcript-coach",
              status: "COMPLETED",
              provider: "apple-speech-transcriber-on-device",
              errorMessage: null,
              updatedAt: new Date("2026-08-30T18:00:00Z"),
              _count: { segments: 12, words: 180 },
            }],
          },
          {
            id: "recording-client",
            roomId: "room-joint",
            kind: "LOCAL_AUDIO",
            status: "VERIFIED",
            byteSize: BigInt(4_096),
            checksum: "d".repeat(64),
            localManifestJson: { exactBytesVerified: true },
            transcriptJobs: [{
              id: "transcript-client",
              status: "COMPLETED",
              provider: "deepgram",
              errorMessage: null,
              updatedAt: new Date("2026-08-30T18:00:01Z"),
              _count: { segments: 9, words: 140 },
            }],
          },
        ],
      },
      [
        {
          uploadSessionId: "upload-coach",
          captureId: "capture-coach",
          roomId: "room-joint",
          recordingAssetId: "recording-coach",
          processingDisposition: "RELEASED",
          transcriptDisposition: "RELEASED",
          metadataJson: { immutableUploadBinding: { sha256: "c".repeat(64), sizeBytes: 2_048 } },
        },
        {
          uploadSessionId: "upload-client",
          captureId: "capture-client",
          roomId: "room-joint",
          recordingAssetId: "recording-client",
          processingDisposition: "RELEASED",
          transcriptDisposition: "RELEASED",
          metadataJson: { immutableUploadBinding: { sha256: "d".repeat(64), sizeBytes: 4_096 } },
        },
      ],
      [],
    );

    expect(sources.map((source) => ({
      recordingAssetId: source.recordingAssetId,
      sha256: source.sha256,
      transcript: source.transcript,
    }))).toEqual(expect.arrayContaining([
      {
        recordingAssetId: "recording-coach",
        sha256: "c".repeat(64),
        transcript: expect.objectContaining({
          id: "transcript-coach",
          status: "COMPLETED",
          provider: "apple-speech-transcriber-on-device",
          segmentCount: 12,
          wordCount: 180,
        }),
      },
      {
        recordingAssetId: "recording-client",
        sha256: "d".repeat(64),
        transcript: expect.objectContaining({
          id: "transcript-client",
          status: "COMPLETED",
          provider: "deepgram",
          segmentCount: 9,
          wordCount: 140,
        }),
      },
    ]));
  });

  it("offers only the complete newest capture group to Studio", () => {
    const handoff = captureGroupStudioHandoff([
      {
        recordingAssetId: "video-back",
        captureGroupId: "take-2",
        exactBytesVerified: true,
        recordingStatus: "VERIFIED",
        processingDisposition: "RELEASED",
        mediaAssetId: null,
      },
      {
        recordingAssetId: "audio-master",
        captureGroupId: "take-2",
        exactBytesVerified: true,
        recordingStatus: "VERIFIED",
        processingDisposition: "RELEASED",
        mediaAssetId: "media-audio",
      },
      {
        recordingAssetId: "older-video",
        captureGroupId: "take-1",
        exactBytesVerified: true,
        recordingStatus: "VERIFIED",
        processingDisposition: "RELEASED",
        mediaAssetId: null,
      },
    ]);

    expect(handoff).toMatchObject({
      captureGroupId: "take-2",
      sourceCount: 2,
      verifiedSourceCount: 2,
      promotedSourceCount: 1,
      ready: true,
      complete: false,
      sourceSetRequired: true,
      sources: [
        { recordingAssetId: "video-back" },
        { recordingAssetId: "audio-master" },
      ],
    });
  });

  it("holds Studio handoff until every newest-group source is released", () => {
    expect(
      captureGroupStudioHandoff([
        {
          recordingAssetId: "video-front",
          captureGroupId: "take-3",
          exactBytesVerified: true,
          recordingStatus: "VERIFIED",
          processingDisposition: "RELEASED",
        },
        {
          recordingAssetId: "audio-master",
          captureGroupId: "take-3",
          exactBytesVerified: true,
          recordingStatus: "VERIFIED",
          processingDisposition: "HELD",
        },
      ]),
    ).toMatchObject({
      captureGroupId: "take-3",
      sourceCount: 2,
      verifiedSourceCount: 1,
      ready: false,
      complete: false,
    });
  });

  it("keeps provider room media optional for protected-master readiness", () => {
    expect(
      captureGroupStudioHandoff([
        {
          recordingAssetId: "iphone-master",
          captureGroupId: "take-4",
          kind: "LOCAL_VIDEO",
          exactBytesVerified: true,
          recordingStatus: "VERIFIED",
          processingDisposition: "RELEASED",
          mediaAssetId: "media-iphone",
        },
        {
          recordingAssetId: "provider-held",
          captureGroupId: "take-4",
          kind: "SERVER_MIX",
          exactBytesVerified: false,
          recordingStatus: "UPLOADING",
          processingDisposition: "PENDING",
          mediaAssetId: null,
        },
      ]),
    ).toMatchObject({
      sourceCount: 2,
      requiredSourceCount: 1,
      providerWitnessCount: 1,
      verifiedRequiredSourceCount: 1,
      promotedRequiredSourceCount: 1,
      ready: true,
      complete: true,
    });
  });
});
