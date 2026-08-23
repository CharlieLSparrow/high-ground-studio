import { buildSessionRecordingStatus } from "./session-recording-status";
import type { SessionReadinessTopology } from "@/lib/server/session-readiness-topology";

function topology(): SessionReadinessTopology {
  return {
    generatedAt: "2026-08-22T18:00:00.000Z",
    people: ["coach", "client"].map((id, index) => ({
      id,
      label: index ? "Client" : "Coach",
      role: index ? "CLIENT" : "COACH",
      isCurrentActor: !index,
      consent: "ready",
      videoConsent: true,
      transcriptionConsent: true,
      endpoints: [],
      preflights: [],
      endpointQueues: [{ id: `queue-${id}`, clientInstanceId: `device-${id}`, clientKind: index ? "ios" : "web", deviceLabel: index ? "iPhone" : "Browser", queueRevision: "1", queueState: "DRAINED", localSourceCount: 1, pendingSourceCount: 0, failedSourceCount: 0, observedCaptureIds: [`capture-${id}`], recordingAssetIds: [`asset-${id}`], latestLocalMutationAt: "2026-08-22T17:59:00.000Z", reconciledAt: "2026-08-22T18:00:00.000Z" }],
      sources: [{ id: `asset-${id}`, evidenceKind: "recording-asset", sourceKind: "audio", label: `${id} audio`, status: "VERIFIED", clientKind: index ? "ios" : "web", deviceLabel: index ? "iPhone" : "Browser", captureId: `capture-${id}`, startedAt: "2026-08-22T17:00:00.000Z", stoppedAt: "2026-08-22T17:30:00.000Z", durationSeconds: 1800, byteSize: "1000", verified: true, serverRetention: { state: "SERVER_COPY_VERIFIED_RELEASED", uploadSessionId: `upload-${id}`, exactBytesVerified: true, processingDisposition: "RELEASED", transcriptDisposition: "QUEUED", updatedAt: "2026-08-22T18:00:00.000Z" } }],
      attentionCount: 0,
    })),
    expectedSources: ["coach", "client"].map((id) => ({ id: `expected-${id}`, participantId: id, participantLabel: id, label: `${id} master`, sourceKind: "audio", retentionRole: "required-master", status: "active", expectedClientKind: null, expectedDeviceLabel: null, recordingAssetId: `asset-${id}`, captureId: `capture-${id}`, revision: 1, latestReason: null, fulfillment: "fulfilled", blocking: false, candidateSources: [], createdAt: "2026-08-22T17:00:00.000Z", updatedAt: "2026-08-22T18:00:00.000Z" })),
    unassignedSources: [],
    summary: { peopleCount: 2, consentReadyCount: 2, knownEndpointCount: 0, currentPreflightCount: 0, retainedSourceCount: 2, verifiedSourceCount: 2, pendingCaptureCount: 0, endpointQueueCount: 2, drainedEndpointCount: 2, plannedSourceCount: 2, requiredPlannedSourceCount: 2, fulfilledRequiredPlannedSourceCount: 2, missingRequiredPlannedSourceCount: 0, attentionCount: 0 },
    exitReadiness: { state: "SAFE_TO_LEAVE", label: "Safe", detail: "Exact sources and queues match.", requiredSourceCount: 2, serverSafeRequiredSourceCount: 2, pendingCaptureCount: 0, endpointQueueCount: 2, drainedEndpointCount: 2, safeForServerObservedSources: true, allEndpointQueuesConfirmedEmpty: true, requiredPlannedSourceCount: 2, fulfilledRequiredPlannedSourceCount: 2, safeForPlannedSources: true, safeToLeaveAllEndpoints: true },
    boundaries: { personIsNotDevice: true, grantIsNotPresence: true, callTrackIsNotRetainedSource: true, captureReceiptIsNotUploadedMedia: true, recordingAssetOwnsRetainedSourceTruth: true, serverCopyDoesNotProveEndpointQueueEmpty: true, observedSourceDoesNotProvePlannedSourceComplete: true },
  };
}

describe("session recording status", () => {
  it("gives every participant a simple safe result only when sources and queues agree", () => {
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: topology() });
    expect(result).toMatchObject({ state: "SAFE", safeToLeave: true, label: "Every recording is safe" });
    expect(result.people.map((person) => person.state)).toEqual(["SAFE", "SAFE"]);
  });

  it("does not make a standard call declare an extra source plan", () => {
    const input = topology();
    input.expectedSources = [];
    input.summary.requiredPlannedSourceCount = 0;
    input.summary.fulfilledRequiredPlannedSourceCount = 0;
    input.exitReadiness = {
      ...input.exitReadiness,
      requiredPlannedSourceCount: 0,
      fulfilledRequiredPlannedSourceCount: 0,
      safeForPlannedSources: false,
    };

    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: input });
    expect(result).toMatchObject({ state: "SAFE", safeToLeave: true, peopleSafeCount: 2 });
    expect(result.people.map((person) => person.requiredSourceCount)).toEqual([1, 1]);
  });

  it("does not invent a missing recording when an ended Session never recorded", () => {
    const input = topology();
    input.expectedSources = [];
    for (const person of input.people) {
      person.sources = [];
      person.endpointQueues = [];
    }
    input.exitReadiness = {
      ...input.exitReadiness,
      state: "NO_CAPTURE_EVIDENCE",
      requiredSourceCount: 0,
      serverSafeRequiredSourceCount: 0,
      safeForServerObservedSources: false,
      allEndpointQueuesConfirmedEmpty: false,
      safeToLeaveAllEndpoints: false,
      requiredPlannedSourceCount: 0,
      fulfilledRequiredPlannedSourceCount: 0,
      safeForPlannedSources: false,
    };

    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: input });
    expect(result).toMatchObject({ state: "NOT_STARTED", safeToLeave: false, peopleRequiringRecordingCount: 0 });
    expect(result.people.map((person) => person.state)).toEqual(["NOT_REQUIRED", "NOT_REQUIRED"]);
  });

  it("tells the exact participant to keep their device open while upload remains", () => {
    const input = topology();
    input.people[1]!.endpointQueues[0] = { ...input.people[1]!.endpointQueues[0]!, queueState: "NOT_EMPTY", pendingSourceCount: 1, recordingAssetIds: [] };
    input.exitReadiness = { ...input.exitReadiness, state: "SERVER_COPY_INCOMPLETE", safeToLeaveAllEndpoints: false, allEndpointQueuesConfirmedEmpty: false, drainedEndpointCount: 1 };
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "RECORDING", topology: input });
    expect(result).toMatchObject({
      state: "KEEP_OPEN",
      label: "Recording is finishing",
    });
    expect(result.people[0]).toMatchObject({ label: "Coach", state: "SAFE" });
    expect(result.people[1]).toMatchObject({
      label: "Client",
      state: "KEEP_OPEN",
      pendingSourceCount: 1,
      detail: "Ask Client to keep Quipsly open on their recording device.",
    });
  });

  it("gives the current actor a direct device action while their upload remains", () => {
    const input = topology();
    input.people[0]!.endpointQueues[0] = { ...input.people[0]!.endpointQueues[0]!, queueState: "NOT_EMPTY", pendingSourceCount: 1, recordingAssetIds: [] };
    input.exitReadiness = { ...input.exitReadiness, state: "SERVER_COPY_INCOMPLETE", safeToLeaveAllEndpoints: false, allEndpointQueuesConfirmedEmpty: false, drainedEndpointCount: 1 };
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "RECORDING", topology: input });
    expect(result.people[0]).toMatchObject({
      state: "KEEP_OPEN",
      detail: "Keep Quipsly open on this device while your recording finishes uploading.",
    });
  });

  it("does not mislabel an ended missing master as ordinary upload progress", () => {
    const input = topology();
    input.expectedSources[1] = { ...input.expectedSources[1]!, recordingAssetId: null, fulfillment: "missing", blocking: true };
    input.people[1] = { ...input.people[1]!, sources: [], endpointQueues: [] };
    input.exitReadiness = { ...input.exitReadiness, state: "PLANNED_SOURCE_INCOMPLETE", safeToLeaveAllEndpoints: false, safeForPlannedSources: false, fulfilledRequiredPlannedSourceCount: 1 };
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: input });
    expect(result).toMatchObject({
      state: "RECOVERY_REQUIRED",
      label: "A recording needs attention",
    });
    expect(result.people[1]).toMatchObject({
      state: "RECOVERY_REQUIRED",
      labelText: "Recording missing",
      requiredSourceCount: 1,
      detail: "Ask Client to open Quipsly on the device they recorded with.",
    });
  });

  it("fails closed when an aggregate safe result contradicts a participant device", () => {
    const input = topology();
    input.people[1] = { ...input.people[1]!, endpointQueues: [] };
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: input });
    expect(result).toMatchObject({ state: "CHECK_DEVICE", safeToLeave: false, peopleSafeCount: 1, peopleRequiringRecordingCount: 2 });
    expect(result.people[1]).toMatchObject({ state: "CHECK_DEVICE" });
  });

  it("does not count a non-recording observer against recording safety", () => {
    const input = topology();
    input.people.push({ id: "observer", label: "Instructor", role: "OBSERVER", isCurrentActor: false, consent: "not-required", videoConsent: false, transcriptionConsent: false, endpoints: [], preflights: [], endpointQueues: [], sources: [], attentionCount: 0 });
    input.summary.peopleCount = 3;
    const result = buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "ENDED", topology: input });
    expect(result).toMatchObject({ state: "SAFE", safeToLeave: true, peopleSafeCount: 2, peopleRequiringRecordingCount: 2 });
    expect(result.people[2]).toMatchObject({ state: "NOT_REQUIRED", labelText: "Not recording" });
  });
});
