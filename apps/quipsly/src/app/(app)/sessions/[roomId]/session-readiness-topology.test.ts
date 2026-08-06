import { buildSessionReadinessTopology } from "./session-readiness-topology";

describe("Session readiness topology", () => {
  const generatedAt = new Date("2026-08-05T18:00:00.000Z");
  const participant = {
    id: "participant-scott",
    userId: "user-scott",
    label: "Scott Sparrow",
    role: "CO_HOST",
    isCurrentActor: false,
    consent: {
      recordingReady: true,
      canRecordVideo: true,
      transcriptionReady: true,
    },
  };

  it("keeps a person, their call endpoints, and retained sources as separate facts", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [
        {
          id: "grant-ios",
          participantId: participant.id,
          clientInstanceId: "phone-installation",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · iPhone 16",
          issuedAt: "2026-08-05T17:55:00.000Z",
          expiresAt: "2026-08-05T19:55:00.000Z",
        },
        {
          id: "grant-web",
          participantId: participant.id,
          clientInstanceId: "mac-browser",
          clientKind: "web",
          deviceLabel: "Quipsly Web · Mac",
          issuedAt: "2026-08-05T17:56:00.000Z",
          expiresAt: "2026-08-05T19:56:00.000Z",
        },
      ],
      recordings: [
        {
          id: "asset-audio",
          participantId: participant.id,
          kind: "LOCAL_AUDIO",
          status: "VERIFIED",
          fileName: "Scott-audio.m4a",
          byteSize: BigInt(1024),
          verifiedAt: "2026-08-05T17:59:00.000Z",
          localManifestJson: {
            captureId: "capture-1",
            reportedSourceProfile: {
              deviceModelIdentifier: "iPhone17,3",
              audioRouteName: "DJI Mic 2",
            },
          },
        },
      ],
      captures: [],
    });

    expect(topology.people[0]).toMatchObject({
      label: "Scott Sparrow",
      consent: "ready",
      endpoints: [
        expect.objectContaining({ truth: "join-grant-receipt" }),
        expect.objectContaining({ truth: "join-grant-receipt" }),
      ],
      sources: [
        expect.objectContaining({
          evidenceKind: "recording-asset",
          verified: true,
          deviceLabel: "iPhone17,3 · DJI Mic 2",
        }),
      ],
    });
    expect(topology.summary).toMatchObject({
      peopleCount: 1,
      knownEndpointCount: 2,
      retainedSourceCount: 1,
      verifiedSourceCount: 1,
    });
  });

  it("shows a closed phone capture as pending until a RecordingAsset exists", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      recordings: [],
      captures: [{
        captureId: "capture-pending",
        actorUserId: "user-scott",
        status: "START_AND_STOP_RECEIVED",
        startedAt: "2026-08-05T17:00:00.000Z",
        stoppedAt: "2026-08-05T17:10:00.000Z",
        lastReceivedAt: "2026-08-05T17:10:01.000Z",
      }],
    });

    expect(topology.people[0].sources).toEqual([
      expect.objectContaining({
        evidenceKind: "capture-receipt",
        verified: false,
        status: "START_AND_STOP_RECEIVED",
      }),
    ]);
    expect(topology.summary).toMatchObject({
      retainedSourceCount: 0,
      pendingCaptureCount: 1,
      attentionCount: 1,
    });
  });

  it("deduplicates refreshed grants but never turns them into live presence", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      recordings: [],
      captures: [],
      grants: [
        {
          id: "old-grant",
          participantId: participant.id,
          clientInstanceId: "browser-a",
          clientKind: "web",
          deviceLabel: "Quipsly Web · Mac before rename",
          issuedAt: "2026-08-05T16:00:00.000Z",
          expiresAt: "2026-08-05T17:00:00.000Z",
        },
        {
          id: "new-grant",
          participantId: participant.id,
          clientInstanceId: "browser-a",
          clientKind: "web",
          deviceLabel: "Quipsly Web · Mac",
          issuedAt: "2026-08-05T17:30:00.000Z",
          expiresAt: "2026-08-05T19:30:00.000Z",
        },
      ],
    });

    expect(topology.people[0].endpoints).toEqual([
      expect.objectContaining({ id: "new-grant", leaseActive: true }),
    ]);
    expect(topology.boundaries.grantIsNotPresence).toBe(true);
    expect(JSON.stringify(topology)).not.toContain("providerIdentity");
  });

  it("keeps unassigned retained media visible instead of attributing it by guess", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-unassigned",
        participantId: null,
        kind: "LOCAL_VIDEO",
        status: "UPLOADED",
        fileName: "camera.mov",
      }],
    });

    expect(topology.people[0].sources).toHaveLength(0);
    expect(topology.unassignedSources).toEqual([
      expect.objectContaining({ id: "asset-unassigned", sourceKind: "video" }),
    ]);
    expect(topology.summary.attentionCount).toBe(1);
  });

  it("keeps the latest private-playback receipt on its exact person and browser endpoint", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      recordings: [],
      captures: [],
      preflights: [
        {
          id: "preflight-old",
          participantId: participant.id,
          clientInstanceId: "mac-browser",
          clientKind: "web",
          deviceLabel: "Quipsly Web · Mac",
          microphoneLabel: "MacBook microphone",
          cameraLabel: null,
          outputLabel: "MacBook speakers",
          cameraWanted: false,
          status: "NEEDS_ATTENTION",
          audioSignalState: "low",
          privateSamplePlaybackComplete: true,
          playbackDecision: "NEEDS_ADJUSTMENT",
          issueCodes: ["AUDIO_LOW"],
          testedAt: "2026-08-05T17:00:00.000Z",
          expiresAt: "2026-08-05T19:00:00.000Z",
        },
        {
          id: "preflight-current",
          governedActionId: "governed-action-12345678",
          participantId: participant.id,
          clientInstanceId: "mac-browser",
          clientKind: "web",
          deviceLabel: "Quipsly Web · Mac",
          microphoneLabel: "Shure MV7i",
          cameraLabel: "Canon EOS R8",
          outputLabel: "Shure MV7i Headphones",
          cameraWanted: true,
          status: "READY",
          audioSignalState: "ready",
          privateSamplePlaybackComplete: true,
          playbackDecision: "HEARD_CLEAR",
          issueCodes: [],
          testedAt: "2026-08-05T17:55:00.000Z",
          expiresAt: "2026-08-05T19:55:00.000Z",
        },
      ],
    });

    expect(topology.people[0].preflights).toEqual([
      expect.objectContaining({
        id: "preflight-current",
        governedActionId: "governed-action-12345678",
        current: true,
        microphoneLabel: "Shure MV7i",
        outputLabel: "Shure MV7i Headphones",
      }),
    ]);
    expect(topology.summary.currentPreflightCount).toBe(1);
    expect(topology.summary.attentionCount).toBe(0);
  });
});
