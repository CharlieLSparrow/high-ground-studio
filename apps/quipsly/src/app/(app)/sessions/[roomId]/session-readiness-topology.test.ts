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
      finalizations: [{
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      captures: [],
      expectedSources: [{
        id: "expected-audio",
        participantId: participant.id,
        label: "Scott audio master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "ios",
        expectedDeviceLabel: "iPhone 16",
        recordingAssetId: "asset-audio",
        captureId: "capture-1",
        revision: 1,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
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
          serverRetention: expect.objectContaining({
            state: "SERVER_COPY_VERIFIED_RELEASED",
            uploadSessionId: "upload-1",
          }),
        }),
      ],
    });
    expect(topology.summary).toMatchObject({
      peopleCount: 1,
      knownEndpointCount: 2,
      retainedSourceCount: 1,
      verifiedSourceCount: 1,
    });
    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
      safeForServerObservedSources: true,
      allEndpointQueuesConfirmedEmpty: false,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("becomes safe only for a latest drained installation receipt covering the exact source", () => {
    const input = {
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      expectedSources: [{
        id: "expected-audio",
        participantId: participant.id,
        label: "Scott browser audio master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "web",
        recordingAssetId: "asset-audio",
        captureId: "capture-1",
        revision: 1,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      endpointQueues: [{
        id: "queue-1",
        participantId: participant.id,
        clientInstanceId: "web-installation",
        clientKind: "web",
        queueRevision: "1",
        queueState: "DRAINED",
        localSourceCount: 1,
        pendingSourceCount: 0,
        failedSourceCount: 0,
        observedCaptureIds: ["capture-1"],
        recordingAssetIds: ["asset-audio"],
        latestLocalMutationAt: "2026-08-05T17:59:31.000Z",
        reconciledAt: "2026-08-05T17:59:32.000Z",
        createdAt: "2026-08-05T17:59:32.000Z",
      }],
    };
    const safe = buildSessionReadinessTopology(input);
    expect(safe.exitReadiness).toMatchObject({
      state: "SAFE_TO_LEAVE",
      allEndpointQueuesConfirmedEmpty: true,
      safeToLeaveAllEndpoints: true,
    });

    const invalidated = buildSessionReadinessTopology({
      ...input,
      endpointQueues: [...input.endpointQueues, {
        ...input.endpointQueues[0],
        id: "queue-2",
        queueRevision: "2",
        queueState: "NOT_EMPTY",
        localSourceCount: 2,
        pendingSourceCount: 1,
        observedCaptureIds: ["capture-1", "capture-2"],
        reconciledAt: "2026-08-05T18:00:00.000Z",
        createdAt: "2026-08-05T18:00:00.000Z",
      }],
    });
    expect(invalidated.exitReadiness).toMatchObject({
      state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
      safeToLeaveAllEndpoints: false,
      drainedEndpointCount: 0,
    });
  });

  it("never treats observed retained bytes as proof of an undeclared recording plan", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      endpointQueues: [{
        id: "queue-1",
        participantId: participant.id,
        clientInstanceId: "web-installation",
        clientKind: "web",
        queueRevision: "1",
        queueState: "DRAINED",
        localSourceCount: 1,
        pendingSourceCount: 0,
        failedSourceCount: 0,
        observedCaptureIds: ["capture-1"],
        recordingAssetIds: ["asset-audio"],
        latestLocalMutationAt: "2026-08-05T17:59:31.000Z",
        reconciledAt: "2026-08-05T17:59:32.000Z",
        createdAt: "2026-08-05T17:59:32.000Z",
      }],
    });

    expect(topology.exitReadiness).toMatchObject({
      state: "RECORDING_PLAN_REQUIRED",
      safeForServerObservedSources: true,
      allEndpointQueuesConfirmedEmpty: true,
      safeForPlannedSources: false,
      safeToLeaveAllEndpoints: false,
    });
    expect(topology.boundaries.observedSourceDoesNotProvePlannedSourceComplete).toBe(true);
  });

  it("keeps a missing planned iPhone video master visible when browser audio succeeded", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      expectedSources: [{
        id: "expected-audio",
        participantId: participant.id,
        label: "Scott browser audio",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "web",
        recordingAssetId: "asset-audio",
        captureId: "capture-1",
        revision: 1,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }, {
        id: "expected-video",
        participantId: participant.id,
        label: "Scott iPhone 4K video",
        sourceKind: "VIDEO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "ios",
        expectedDeviceLabel: "iPhone 16",
        revision: 1,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T16:50:00.000Z",
      }],
    });

    expect(topology.expectedSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "expected-audio", fulfillment: "fulfilled", blocking: false }),
      expect.objectContaining({ id: "expected-video", fulfillment: "missing", blocking: true }),
    ]));
    expect(topology.exitReadiness).toMatchObject({
      state: "PLANNED_SOURCE_INCOMPLETE",
      requiredPlannedSourceCount: 2,
      fulfilledRequiredPlannedSourceCount: 1,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("refuses global safety when a currently prepared installation has no queue receipt", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [{
        id: "grant-unreconciled-ios",
        participantId: participant.id,
        clientInstanceId: "ios-installation-without-receipt",
        clientKind: "ios",
        deviceLabel: "Homer’s iPhone",
        issuedAt: "2026-08-05T17:40:00.000Z",
        expiresAt: "2026-08-05T19:40:00.000Z",
      }],
      recordings: [{
        id: "asset-audio",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", reportedSourceProfile: { clientKind: "web" } },
      }],
      captures: [],
      finalizations: [{
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      expectedSources: [{
        id: "expected-audio",
        participantId: participant.id,
        label: "Scott browser audio master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "web",
        recordingAssetId: "asset-audio",
        captureId: "capture-1",
        revision: 1,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      endpointQueues: [{
        id: "queue-web",
        participantId: participant.id,
        clientInstanceId: "web-installation",
        clientKind: "web",
        queueRevision: "1",
        queueState: "DRAINED",
        localSourceCount: 1,
        pendingSourceCount: 0,
        failedSourceCount: 0,
        observedCaptureIds: ["capture-1"],
        recordingAssetIds: ["asset-audio"],
        latestLocalMutationAt: "2026-08-05T17:59:31.000Z",
        reconciledAt: "2026-08-05T17:59:32.000Z",
        createdAt: "2026-08-05T17:59:32.000Z",
      }],
    });

    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
      endpointQueueCount: 2,
      drainedEndpointCount: 1,
      allEndpointQueuesConfirmedEmpty: false,
      safeToLeaveAllEndpoints: false,
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
        serverRetention: expect.objectContaining({ state: "CAPTURE_AWAITING_MEDIA" }),
      }),
    ]);
    expect(topology.summary).toMatchObject({
      retainedSourceCount: 0,
      pendingCaptureCount: 1,
      attentionCount: 1,
    });
    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_INCOMPLETE",
      pendingCaptureCount: 1,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("does not call verified bytes server-safe without their finalization receipt", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-unreleased",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "unreleased.m4a",
        verifiedAt: "2026-08-05T17:59:00.000Z",
      }],
    });

    expect(topology.people[0].sources[0].serverRetention.state).toBe("FINALIZATION_RECEIPT_MISSING");
    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_INCOMPLETE",
      safeForServerObservedSources: false,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("keeps an optional provider witness out of the required-master exit count", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "provider-witness",
        participantId: participant.id,
        kind: "SERVER_MIX",
        status: "VERIFIED",
        fileName: "provider-reference.mp4",
        verifiedAt: "2026-08-05T17:59:00.000Z",
      }],
    });

    expect(topology.people[0].sources[0].sourceKind).toBe("provider");
    expect(topology.exitReadiness).toMatchObject({
      state: "RECORDING_PLAN_REQUIRED",
      requiredSourceCount: 0,
      safeToLeaveAllEndpoints: false,
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
    expect(topology.boundaries.serverCopyDoesNotProveEndpointQueueEmpty).toBe(true);
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
