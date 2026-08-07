import { normalizeEpisodeEditSources } from "./episode-edit-store";

describe("normalizeEpisodeEditSources", () => {
  it("recovers durable identity for a protected imported reference camera", () => {
    const sourceId = "video_source_0001";
    const result = normalizeEpisodeEditSources({
      timelineClips: [{
        id: "camera-lane",
        kind: "video",
        name: "Participant Camera: protected iPhone master",
        assetId: `/api/ingest/media/${sourceId}`,
        startIn: 0,
        sourceStart: 0,
        sourceEnd: 30,
        duration: 30,
      }],
    }, {
      importedMedia: [{
        id: "media_asset_0001",
        sourceId,
        importRole: "participant-camera",
        kind: "video",
        contentType: "video/mp4",
        playbackUrl: `/api/ingest/media/${sourceId}`,
        sha256: "a".repeat(64),
        storageGeneration: `sha256:${"a".repeat(64)}`,
      }],
    });

    expect(result).toEqual([expect.objectContaining({
      id: "camera-lane",
      role: "reference",
      kind: "video",
      mediaAssetId: "media_asset_0001",
      sourceId,
      sourceSha256: "a".repeat(64),
      playbackUrl: `/api/ingest/media/${sourceId}`,
    })]);
  });
});
