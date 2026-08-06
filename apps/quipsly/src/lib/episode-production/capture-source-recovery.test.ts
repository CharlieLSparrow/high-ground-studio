import {
  activeCaptureImportedMedia,
  applyActiveRecoverySelections,
  captureSourceRecoveryDecisionId,
  projectCaptureSourceRecovery,
} from "./capture-source-recovery";

const group = "967f72b2-f762-4535-a337-e69b5676cad1";

function original() {
  return {
    id: "media-original",
    sourceId: "source-original",
    originalName: "silent.webm",
    kind: "audio",
    contentType: "audio/webm",
    metadata: { recordingSync: { recordingAssetId: "recording-original", captureGroupId: group } },
    sync: { status: "ready-to-sync", recordingSync: { recordingAssetId: "recording-original", captureGroupId: group } },
  };
}

function replacement() {
  return {
    id: "media-replacement",
    sourceId: "source-replacement",
    originalName: "mv7i-backup.wav",
    kind: "audio",
    contentType: "audio/wav",
    metadata: {},
    sync: { status: "ready-to-sync" },
  };
}

describe("capture source recovery", () => {
  it("derives distinct stable UUIDs for append-only decisions", () => {
    const requestId = "b8882d8a-e239-4fb3-b69f-4b8826925973";
    const create = captureSourceRecoveryDecisionId(requestId, "create");
    const bind = captureSourceRecoveryDecisionId(requestId, "bind");
    expect(create).toMatch(/^[0-9a-f-]{36}$/);
    expect(bind).not.toBe(create);
    expect(captureSourceRecoveryDecisionId(requestId, "create")).toBe(create);
  });

  it("preserves the original while projecting one active recovered master", () => {
    const production = projectCaptureSourceRecovery({
      productionJson: { importedMedia: [original(), replacement()] },
      projectSlug: "high-ground-odyssey-manuscript",
      episodeSlug: "episode-9",
      captureGroupId: group,
      originalRecordingAssetId: "recording-original",
      replacementRecordingAssetId: "recording-replacement",
      replacementMediaAssetId: "media-replacement",
      replacementSourceId: "source-replacement",
      expectationId: "expected-source-1",
      requestId: "b8882d8a-e239-4fb3-b69f-4b8826925973",
      requestSha256: "a".repeat(64),
      sourceSha256: "b".repeat(64),
      storageGeneration: "7",
      sourceLocator: "gs://bucket/recovery.wav#7",
      reason: "The browser source decoded as near-silence; adopt the MV7i backup.",
      actorUserId: "user-1",
      actorEmail: "producer@example.test",
      decidedAt: "2026-08-07T04:00:00.000Z",
    });
    const all = production.importedMedia as any[];
    expect(all).toHaveLength(2);
    expect(activeCaptureImportedMedia(all)).toHaveLength(1);
    expect(all.find((asset) => asset.id === "media-original").metadata.recordingSync.recoverySelection.status).toBe("superseded-original");
    expect(all.find((asset) => asset.id === "media-replacement").sync.recordingSync).toMatchObject({
      recordingAssetId: "recording-replacement",
      captureGroupId: group,
      recoverySelection: { status: "active-replacement", originalSourceMediaUnchanged: true },
    });
  });

  it("selects the replacement from an active append-only expectation chain", () => {
    const sources = [
      { recordingAssetId: "recording-original", label: "silent" },
      { recordingAssetId: "recording-replacement", label: "backup" },
      { recordingAssetId: "recording-camera", label: "camera" },
    ];
    const active = applyActiveRecoverySelections(sources, [{
      status: "ACTIVE",
      recordingAssetId: "recording-replacement",
      revisions: [
        { afterJson: { recordingAssetId: "recording-original" } },
        { afterJson: { recordingAssetId: null } },
        { afterJson: { recordingAssetId: "recording-replacement" } },
      ],
    }]);
    expect(active.map((source) => source.recordingAssetId)).toEqual(["recording-replacement", "recording-camera"]);
  });

  it("removes every superseded binding after more than one recovery", () => {
    const sources = [
      { recordingAssetId: "recording-original", label: "silent" },
      { recordingAssetId: "recording-replacement-1", label: "bad backup" },
      { recordingAssetId: "recording-replacement-2", label: "good backup" },
      { recordingAssetId: "recording-camera", label: "camera" },
    ];
    const active = applyActiveRecoverySelections(sources, [{
      status: "ACTIVE",
      recordingAssetId: "recording-replacement-2",
      revisions: [
        { afterJson: { recordingAssetId: "recording-original" } },
        { afterJson: { recordingAssetId: null } },
        { afterJson: { recordingAssetId: "recording-replacement-1" } },
        { afterJson: { recordingAssetId: null } },
        { afterJson: { recordingAssetId: "recording-replacement-2" } },
      ],
    }]);
    expect(active.map((source) => source.recordingAssetId)).toEqual(["recording-replacement-2", "recording-camera"]);
  });
});
