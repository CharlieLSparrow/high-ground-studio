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
  const exactStorage = {
    byteSize: BigInt(1024),
    checksum: "a".repeat(64),
    storageBucket: "quipsly-test-media",
    storageObjectPath: "media-vault/test/source.m4a",
  };
  const exactFinalizationEvidence = {
    roomId: "room-1",
    actorUserId: "user-scott",
    metadataJson: {
      immutableUploadBinding: {
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        roomId: "room-1",
        actorUserId: "user-scott",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        bucketName: "quipsly-test-media",
        objectName: "media-vault/test/source.m4a",
        generation: "1785990000000",
      },
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
          ...exactStorage,
          participantId: participant.id,
          kind: "LOCAL_AUDIO",
          status: "VERIFIED",
          fileName: "Scott-audio.m4a",
          verifiedAt: "2026-08-05T17:59:00.000Z",
          localManifestJson: {
            captureId: "capture-1",
            exactBytesVerified: true,
            storageGeneration: "1785990000000",
            reportedSourceProfile: {
              deviceModelIdentifier: "iPhone17,3",
              audioRouteName: "DJI Mic 2",
            },
          },
        },
      ],
      finalizations: [{
        ...exactFinalizationEvidence,
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
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", exactBytesVerified: true, storageGeneration: "1785990000000", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        ...exactFinalizationEvidence,
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

  it("makes a standard participant source safe without advance production paperwork", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", exactBytesVerified: true, storageGeneration: "1785990000000", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        ...exactFinalizationEvidence,
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
      state: "SAFE_TO_LEAVE",
      safeForServerObservedSources: true,
      allEndpointQueuesConfirmedEmpty: true,
      safeForPlannedSources: false,
      safeToLeaveAllEndpoints: true,
    });
    expect(topology.boundaries.observedSourceDoesNotProvePlannedSourceComplete).toBe(true);
  });

  it("does not let one participant disappear from a standard multi-person recording", () => {
    const client = {
      ...participant,
      id: "participant-client",
      userId: "user-client",
      label: "Jordan Client",
      role: "CLIENT",
      consent: {
        recordingReady: false,
        canRecordVideo: false,
        transcriptionReady: false,
      },
    };
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant, client],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", exactBytesVerified: true, storageGeneration: "1785990000000", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        ...exactFinalizationEvidence,
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
      state: "PARTICIPANT_SOURCE_INCOMPLETE",
      safeForServerObservedSources: true,
      safeToLeaveAllEndpoints: false,
    });
    expect(topology.exitReadiness.detail).toContain("1 of 2 expected participant recordings");
  });

  it("keeps a missing planned iPhone video master visible when browser audio succeeded", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", exactBytesVerified: true, storageGeneration: "1785990000000", reportedSourceProfile: { clientKind: "web" } },
      }],
      finalizations: [{
        ...exactFinalizationEvidence,
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
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "capture-1", exactBytesVerified: true, storageGeneration: "1785990000000", reportedSourceProfile: { clientKind: "web" } },
      }],
      captures: [],
      finalizations: [{
        ...exactFinalizationEvidence,
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

  it("keeps a reasoned waived capture receipt as evidence without treating it as active recovery work", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      recordings: [{
        id: "asset-good",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: {
          captureId: "capture-good",
          exactBytesVerified: true,
          storageGeneration: "1785990000000",
          reportedSourceProfile: { clientKind: "ios" },
        },
      }],
      finalizations: [{
        uploadSessionId: "upload-good",
        captureId: "capture-good",
        roomId: "room-1",
        actorUserId: "user-scott",
        recordingAssetId: "asset-good",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
        metadataJson: {
          immutableUploadBinding: {
            uploadSessionId: "upload-good",
            captureId: "capture-good",
            roomId: "room-1",
            actorUserId: "user-scott",
            sha256: "a".repeat(64),
            sizeBytes: 1024,
            bucketName: "quipsly-test-media",
            objectName: "media-vault/test/source.m4a",
            generation: "1785990000000",
          },
        },
      }],
      captures: [{
        captureId: "capture-interrupted",
        actorUserId: "user-scott",
        status: "START_AND_STOP_RECEIVED",
        startedAt: "2026-08-05T17:00:00.000Z",
        stoppedAt: "2026-08-05T17:00:05.000Z",
        lastReceivedAt: "2026-08-05T17:00:06.000Z",
      }],
      expectedSources: [{
        id: "expected-good",
        participantId: participant.id,
        label: "Verified iPhone master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "ios",
        recordingAssetId: "asset-good",
        captureId: "capture-good",
        revision: 2,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }, {
        id: "expected-interrupted",
        participantId: participant.id,
        label: "Interrupted iPhone master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "WAIVED",
        expectedClientKind: "ios",
        captureId: "capture-interrupted",
        revision: 3,
        latestReason: "The interrupted take could not decode after process recovery; continue with the verified source.",
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T18:00:00.000Z",
      }],
    });

    expect(topology.people[0].sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceKind: "capture-receipt",
        captureId: "capture-interrupted",
        verified: false,
        planDisposition: expect.objectContaining({
          status: "waived",
          expectationId: "expected-interrupted",
          revision: 3,
        }),
        serverRetention: expect.objectContaining({ state: "CAPTURE_PLAN_RESOLVED" }),
      }),
    ]));
    expect(topology.summary).toMatchObject({
      retainedSourceCount: 1,
      pendingCaptureCount: 0,
      requiredPlannedSourceCount: 1,
      fulfilledRequiredPlannedSourceCount: 1,
      attentionCount: 0,
    });
    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
      requiredSourceCount: 1,
      serverSafeRequiredSourceCount: 1,
      pendingCaptureCount: 0,
      safeForPlannedSources: true,
      safeForServerObservedSources: true,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("keeps a receipt blocking while any plan for the exact capture remains active", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      recordings: [],
      captures: [{
        captureId: "capture-shared",
        actorUserId: "user-scott",
        status: "START_AND_STOP_RECEIVED",
        startedAt: "2026-08-05T17:00:00.000Z",
        stoppedAt: "2026-08-05T17:10:00.000Z",
        lastReceivedAt: "2026-08-05T17:10:01.000Z",
      }],
      expectedSources: [{
        id: "expected-waived",
        participantId: participant.id,
        label: "Old plan",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "WAIVED",
        captureId: "capture-shared",
        revision: 2,
        latestReason: "This earlier planned source was superseded by a corrected active plan.",
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:00:00.000Z",
      }, {
        id: "expected-active",
        participantId: participant.id,
        label: "Current plan",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        captureId: "capture-shared",
        revision: 1,
        createdAt: "2026-08-05T17:00:01.000Z",
        updatedAt: "2026-08-05T17:00:01.000Z",
      }],
    });

    expect(topology.people[0].sources[0]).toMatchObject({
      planDisposition: null,
      serverRetention: { state: "CAPTURE_AWAITING_MEDIA" },
    });
    expect(topology.summary.pendingCaptureCount).toBe(1);
    expect(topology.exitReadiness).toMatchObject({
      state: "PLANNED_SOURCE_INCOMPLETE",
      pendingCaptureCount: 1,
      safeForServerObservedSources: false,
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
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "unreleased.m4a",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { exactBytesVerified: true, storageGeneration: "1785990000000" },
      }],
    });

    expect(topology.people[0].sources[0].serverRetention.state).toBe("FINALIZATION_RECEIPT_MISSING");
    expect(topology.exitReadiness).toMatchObject({
      state: "SERVER_COPY_INCOMPLETE",
      safeForServerObservedSources: false,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("does not call a legacy VERIFIED label exact-byte safe without its manifest evidence", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "legacy-verified",
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        byteSize: BigInt(1024),
        checksum: "a".repeat(64),
        storageBucket: "quipsly-test-media",
        storageObjectPath: "media-vault/test/legacy.m4a",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: { captureId: "legacy-capture", storageGeneration: "1785990000000" },
      }],
      finalizations: [{
        uploadSessionId: "legacy-upload",
        captureId: "legacy-capture",
        recordingAssetId: "legacy-verified",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
      expectedSources: [{
        id: "legacy-expected",
        participantId: participant.id,
        label: "Legacy iPhone master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        recordingAssetId: "legacy-verified",
        captureId: "legacy-capture",
        revision: 2,
        createdAt: "2026-08-05T16:50:00.000Z",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
    });

    expect(topology.people[0].sources[0]).toMatchObject({
      verified: false,
      serverRetention: { state: "SERVER_COPY_PENDING", exactBytesVerified: false },
    });
    expect(topology.expectedSources[0]).toMatchObject({
      fulfillment: "bound-source-pending",
      blocking: true,
    });
    expect(topology.exitReadiness).toMatchObject({
      state: "PLANNED_SOURCE_INCOMPLETE",
      safeForServerObservedSources: false,
      safeForPlannedSources: false,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("does not join a released receipt to different immutable bytes", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "asset-audio",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: {
          captureId: "capture-1",
          exactBytesVerified: true,
          storageGeneration: "1785990000000",
        },
      }],
      finalizations: [{
        ...exactFinalizationEvidence,
        metadataJson: {
          immutableUploadBinding: {
            ...exactFinalizationEvidence.metadataJson.immutableUploadBinding,
            sha256: "b".repeat(64),
          },
        },
        uploadSessionId: "upload-1",
        captureId: "capture-1",
        recordingAssetId: "asset-audio",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      }],
    });

    expect(topology.people[0].sources[0]).toMatchObject({
      verified: false,
      serverRetention: {
        state: "SERVER_COPY_PENDING",
        exactBytesVerified: false,
        processingDisposition: "RELEASED",
      },
    });
    expect(topology.exitReadiness.safeForServerObservedSources).toBe(false);
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
      state: "NO_CAPTURE_EVIDENCE",
      requiredSourceCount: 0,
      safeToLeaveAllEndpoints: false,
    });
  });

  it("keeps a share derivative out of participant-source readiness", () => {
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "share-preview",
        participantId: null,
        kind: "SERVER_MIX",
        status: "VERIFIED",
        fileName: "recording-share-output.m4a",
        verifiedAt: "2026-08-05T17:59:00.000Z",
        localManifestJson: {
          exactBytesVerified: true,
          source: "session-recording-share",
          storageGeneration: "1785990000000",
          sessionRecordingShare: {
            outputId: "share-1",
            originalsRemainImmutable: true,
          },
        },
      }],
    });

    expect(topology.people[0].sources).toEqual([]);
    expect(topology.unassignedSources).toEqual([]);
    expect(topology.summary.retainedSourceCount).toBe(0);
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

  it("treats a verified audited recovery replica as server-safe without borrowing phone boundaries", () => {
    const decidedAt = "2026-08-06T20:00:00.000Z";
    const reason = "The original decoded near silence; adopt the independently verified backup.";
    const requestId = "66666666-6666-4666-8666-666666666666";
    const requestSha256 = "b".repeat(64);
    const recoveryCaptureId = "77777777-7777-4777-8777-777777777777";
    const recoveryUploadSessionId = "88888888-8888-4888-8888-888888888888";
    const topology = buildSessionReadinessTopology({
      generatedAt,
      participants: [participant],
      grants: [],
      captures: [],
      recordings: [{
        id: "recovery-asset",
        roomId: "room-1",
        ...exactStorage,
        participantId: participant.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "verified-backup.wav",
        verifiedAt: decidedAt,
        localManifestJson: {
          schema: "quipsly-capture-source-recovery-manifest-v1",
          captureId: recoveryCaptureId,
          exactBytesVerified: true,
          storageGeneration: "1785990000000",
          captureSourceRecovery: {
            requestId,
            requestSha256,
            originalRecordingAssetId: "original-asset",
            expectationId: "expected-recovery",
            reason,
            authorityConfirmed: true,
            actorUserId: "user-scott",
            decidedAt,
            sourceLocator: "gs://private/backup.wav#4",
            sourceGeneration: "4",
            sourceSha256: "a".repeat(64),
            durableStorage: { bucketName: exactStorage.storageBucket, objectName: exactStorage.storageObjectPath, generation: "1785990000000" },
            originalSourceMediaUnchanged: true,
          },
          storageVerification: { schema: "quipsly-capture-recovery-storage-verification-v1", verifiedAt: decidedAt, sizeBytes: 1024, sha256: "a".repeat(64), generation: "1785990000000" },
        },
      }],
      finalizations: [{
        uploadSessionId: recoveryUploadSessionId,
        captureId: recoveryCaptureId,
        roomId: "room-1",
        actorUserId: "user-scott",
        recordingAssetId: "recovery-asset",
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        releaseReason: reason,
        releasedAt: decidedAt,
        updatedAt: decidedAt,
        metadataJson: {
          schema: "quipsly-capture-source-recovery-finalization-v1",
          immutableUploadBinding: { uploadSessionId: recoveryUploadSessionId, roomId: "room-1", sha256: "a".repeat(64), sizeBytes: 1024, bucketName: exactStorage.storageBucket, objectName: exactStorage.storageObjectPath },
          recoveryAuthority: {
            requestId,
            requestSha256,
            originalRecordingAssetId: "original-asset",
            expectationId: "expected-recovery",
            reason,
            actorUserId: "user-scott",
            authorityConfirmed: true,
            decidedAt,
            importedSource: { locator: "gs://private/backup.wav#4", generation: "4", sha256: "a".repeat(64) },
            durableCaptureReplica: { bucketName: exactStorage.storageBucket, objectName: exactStorage.storageObjectPath, generation: "1785990000000" },
          },
        },
      }],
      expectedSources: [{
        id: "expected-recovery",
        participantId: participant.id,
        label: "Scott recovered microphone master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "external",
        recordingAssetId: "recovery-asset",
        captureId: recoveryCaptureId,
        revision: 3,
        createdAt: "2026-08-06T19:00:00.000Z",
        updatedAt: decidedAt,
      }],
    });

    expect(topology.people[0].sources[0]).toMatchObject({
      id: "recovery-asset",
      verified: true,
      serverRetention: { state: "SERVER_COPY_VERIFIED_RELEASED", exactBytesVerified: true },
    });
    expect(topology.expectedSources[0]).toMatchObject({ fulfillment: "fulfilled", blocking: false });
    expect(topology.exitReadiness.safeForServerObservedSources).toBe(true);
  });
});
