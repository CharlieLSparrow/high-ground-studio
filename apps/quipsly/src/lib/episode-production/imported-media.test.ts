import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "./imported-media";

describe("canonical episode imported media", () => {
  test("keeps productionJson authoritative and reads unique legacy timeline rows", () => {
    const canonical = {
      importedMedia: [{
        id: "asset-a",
        sourceId: "source-a",
        sync: {
          recordingAssetId: "recording-a",
          recordingSync: { uploadSessionId: "upload-a" },
        },
      }],
    };
    const legacy = {
      importedMedia: [
        {
          id: "legacy-duplicate-id",
          sourceId: "source-a",
          sync: { recordingAssetId: "recording-a" },
        },
        {
          id: "asset-b",
          sourceId: "source-b",
          sync: {
            recordingAssetId: "recording-b",
            recordingSync: { uploadSessionId: "upload-b" },
          },
        },
        {
          id: "asset-b-upload-duplicate",
          sourceId: "source-b-upload-duplicate",
          sync: {
            recordingSync: {
              uploadSessionId: "upload-b",
            },
          },
        },
      ],
    };

    expect(canonicalEpisodeImportedMedia(canonical, legacy)).toEqual([
      canonical.importedMedia[0],
      legacy.importedMedia[1],
    ]);
    expect(
      canonicalEpisodeProductionJson(canonical, legacy),
    ).toMatchObject({
      importedMedia: [canonical.importedMedia[0], legacy.importedMedia[1]],
      importedMediaOwnership: {
        schema: "quipsly-episode-imported-media-v1",
        legacyTimelineReadThrough: true,
        recoveredLegacyCount: 1,
      },
    });
  });

  test("does not invent source rows when neither projection contains media", () => {
    expect(canonicalEpisodeImportedMedia({}, null)).toEqual([]);
    expect(canonicalEpisodeProductionJson({}, null)).toMatchObject({
      importedMedia: [],
      importedMediaOwnership: {
        legacyTimelineReadThrough: false,
        recoveredLegacyCount: 0,
      },
    });
  });
});
