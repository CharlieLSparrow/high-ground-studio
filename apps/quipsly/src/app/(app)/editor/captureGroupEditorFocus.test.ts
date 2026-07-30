import {
  captureGroupEditorFocusPlan,
  importedAssetCaptureGroupId,
  normalizeCaptureGroupFocusId,
} from "./captureGroupEditorFocus";

function asset(input: {
  id: string;
  recordingAssetId: string;
  captureGroupId: string;
  kind: "audio" | "video";
  baselineRecordingAssetId?: string;
  importedAt: string;
}) {
  return {
    id: input.id,
    sourceId: `source-${input.id}`,
    originalName: `${input.id}.${input.kind === "audio" ? "m4a" : "mov"}`,
    kind: input.kind,
    contentType:
      input.kind === "audio" ? "audio/mp4" : "video/quicktime",
    importRole:
      input.kind === "audio" ? "spine-audio-candidate" : "participant-camera",
    importedAt: input.importedAt,
    metadata: {
      recordingSync: {
        recordingAssetId: input.recordingAssetId,
        captureGroupId: input.captureGroupId,
      },
    },
    sync: {
      alignment: {
        captureGroupId: input.captureGroupId,
        captureGroup: input.baselineRecordingAssetId
          ? {
              baselineRecordingAssetId: input.baselineRecordingAssetId,
              sampleAccurateClaimed: false,
            }
          : undefined,
      },
    },
  };
}

describe("Capture group editor focus", () => {
  it("normalizes only bounded safe group identities", () => {
    expect(normalizeCaptureGroupFocusId(" TAKE-1 ")).toBe("take-1");
    expect(normalizeCaptureGroupFocusId("../take-1")).toBe("");
    expect(normalizeCaptureGroupFocusId("take 1")).toBe("");
    expect(normalizeCaptureGroupFocusId("x".repeat(129))).toBe("");
  });

  it("reads the canonical group through recording evidence", () => {
    expect(importedAssetCaptureGroupId({
      metadata: {
        recordingSync: {
          captureGroupId: " TAKE-1 ",
        },
      },
    })).toBe("take-1");
  });

  it("focuses the exact group and proposes selections without approving sync", () => {
    const assets = [
      asset({
        id: "older-video",
        recordingAssetId: "older-video-recording",
        captureGroupId: "take-0",
        kind: "video",
        importedAt: "2026-07-30T11:00:00.000Z",
      }),
      asset({
        id: "front-camera",
        recordingAssetId: "front-video-recording",
        captureGroupId: "take-1",
        kind: "video",
        baselineRecordingAssetId: "audio-recording",
        importedAt: "2026-07-30T12:00:01.000Z",
      }),
      asset({
        id: "audio-master",
        recordingAssetId: "audio-recording",
        captureGroupId: "take-1",
        kind: "audio",
        baselineRecordingAssetId: "audio-recording",
        importedAt: "2026-07-30T12:00:00.000Z",
      }),
      asset({
        id: "rear-camera",
        recordingAssetId: "rear-video-recording",
        captureGroupId: "take-1",
        kind: "video",
        baselineRecordingAssetId: "audio-recording",
        importedAt: "2026-07-30T12:02:00.000Z",
      }),
    ];

    expect(captureGroupEditorFocusPlan(assets, "TAKE-1")).toEqual({
      requestedCaptureGroupId: "take-1",
      matched: true,
      sourceCount: 3,
      assetIds: ["audio-master", "front-camera", "rear-camera"],
      spineAssetId: "audio-master",
      targetAssetId: "front-camera",
      message:
        "3 verified capture sources are focused for review. No placement or episode-spine decision has been made.",
    });
  });

  it("fails visibly when the phone-reviewed group is absent", () => {
    expect(captureGroupEditorFocusPlan([], "take-missing")).toMatchObject({
      requestedCaptureGroupId: "take-missing",
      matched: false,
      sourceCount: 0,
      assetIds: [],
      spineAssetId: null,
      targetAssetId: null,
    });
  });
});
