import {
  parseSessionEndpointQueueEvidence,
  sessionEndpointQueueStateSha256,
} from "./session-endpoint-queue";

describe("session endpoint queue evidence", () => {
  const valid = {
    clientInstanceId: "web-2f10f251-2bc8-4c35-a98f-c76127ae4b76",
    clientKind: "web",
    deviceLabel: "Quipsly Web · Mac",
    queueRevision: "7",
    queueState: "DRAINED",
    localSourceCount: 1,
    pendingSourceCount: 0,
    failedSourceCount: 0,
    observedCaptureIds: ["2f10f251-2bc8-4c35-a98f-c76127ae4b76"],
    recordingAssetIds: ["asset-1"],
    latestLocalMutationAt: "2026-08-06T09:00:00.000Z",
    reconciledAt: "2026-08-06T09:00:01.000Z",
  };

  it("normalizes one exact installation snapshot deterministically", () => {
    const evidence = parseSessionEndpointQueueEvidence(valid);
    expect(evidence).toMatchObject({ queueRevision: 7n, queueState: "DRAINED" });
    expect(sessionEndpointQueueStateSha256(evidence!)).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionEndpointQueueStateSha256(evidence!)).toBe(sessionEndpointQueueStateSha256(parseSessionEndpointQueueEvidence({
      ...valid,
      observedCaptureIds: [...valid.observedCaptureIds].reverse(),
    })!));
  });

  it("rejects a false drained claim with pending or failed local work", () => {
    expect(parseSessionEndpointQueueEvidence({ ...valid, pendingSourceCount: 1 })).toBeNull();
    expect(parseSessionEndpointQueueEvidence({ ...valid, failedSourceCount: 1 })).toBeNull();
  });

  it("rejects a non-empty claim that does not identify unresolved work", () => {
    expect(parseSessionEndpointQueueEvidence({ ...valid, queueState: "NOT_EMPTY" })).toBeNull();
  });
});
