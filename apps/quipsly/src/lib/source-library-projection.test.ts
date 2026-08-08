import {
  buildSourceLibraryItems,
  filterSourceLibraryItems,
  groupSourceLibraryItems,
  resolveSourceLibraryItem,
  sourceLibraryStats,
} from "./source-library-projection";

const proxy = { id: "proxy-1" };

describe("source library projection", () => {
  const sourceSets = [
    {
      id: "set-1",
      kind: "insta360-360",
      captureKey: "VID_20260806_001",
      displayName: "Homer workshop walk-through",
      completeness: "complete",
      createdAt: "2026-08-06T14:00:00.000Z",
      sourceClockRevision: {
        id: "revision-lrv",
        durationSeconds: 82,
        externalReference: {
          id: "external-lrv",
          fileName: "LRV_001.lrv",
          provider: "local-file-vault",
        },
        collaborationProxy: proxy,
        spatialStitchMaster: null,
      },
      members: [
        {
          requiredForRender: true,
          sourceRevision: {
            id: "revision-a",
            sizeBytes: "100",
            externalReference: {
              id: "external-a",
              provider: "local-file-vault",
              fileName: "VID_A.insv",
              accessState: "available",
            },
          },
        },
        {
          requiredForRender: true,
          sourceRevision: {
            id: "revision-b",
            sizeBytes: "120",
            externalReference: {
              id: "external-b",
              provider: "local-file-vault",
              fileName: "VID_B.insv",
              accessState: "available",
            },
          },
        },
        {
          requiredForRender: false,
          sourceRevision: {
            id: "revision-lrv",
            sizeBytes: "20",
            externalReference: {
              id: "external-lrv",
              provider: "local-file-vault",
              fileName: "LRV_001.lrv",
              accessState: "available",
            },
          },
        },
      ],
    },
  ];
  const externalSources = [
    {
      id: "drive-1",
      provider: "google-drive",
      fileName: "Canon R8 interview.mov",
      mimeType: "video/quicktime",
      sizeBytes: "500",
      providerCreatedAt: "2026-08-05T12:00:00.000Z",
      providerModifiedAt: null,
      createdAt: "2026-08-07T12:00:00.000Z",
      accessState: "available",
      capabilityState: "downloadable",
      latestSourceRevision: {
        id: "drive-revision",
        durationSeconds: 180,
        collaborationProxy: null,
      },
    },
    {
      id: "external-a",
      provider: "local-file-vault",
      fileName: "VID_A.insv",
      mimeType: "application/octet-stream",
      sizeBytes: "100",
      providerCreatedAt: null,
      providerModifiedAt: null,
      createdAt: "2026-08-06T14:00:00.000Z",
      accessState: "available",
      capabilityState: "downloadable",
      latestSourceRevision: {
        id: "revision-a",
        durationSeconds: 82,
        collaborationProxy: null,
      },
    },
  ];
  const assets = [
    {
      id: "asset-1",
      filename: "Episode 9 room tone.wav",
      mimeType: "audio/wav",
      sizeBytes: "300",
      duration: 30,
      thumbnailUrl: null,
      isProxy: false,
      updatedAt: "2026-08-04T09:00:00.000Z",
    },
  ];
  const cards = [
    {
      id: "card-1",
      status: "selected",
      sourceRange: {
        sourceSet: { id: "set-1" },
        sourceRevision: {
          id: "revision-lrv",
          mediaAsset: null,
          externalReference: { id: "external-lrv" },
        },
      },
    },
  ];
  const boards = [{ id: "board-1", placements: [{ cardId: "card-1" }] }];

  it("treats a paired camera take as one package and derives working-set usage", () => {
    const items = buildSourceLibraryItems({
      assets,
      externalSources,
      sourceSets,
      cards,
      boards,
    });
    expect(items.map((item) => item.key)).toEqual([
      "source-set:set-1",
      "external:drive-1",
      "asset:asset-1",
    ]);
    expect(items[0]).toMatchObject({
      selectionAliases: [
        "source-set:set-1",
        "external:external-a",
        "external:external-b",
        "external:external-lrv",
      ],
      mimeFamily: "360",
      health: "browse-ready",
      sizeBytes: "240",
      selectCount: 1,
      selectedCount: 1,
      boardCount: 1,
      isWorking: true,
    });
    expect(sourceLibraryStats(items)).toEqual({
      total: 3,
      working: 1,
      attention: 1,
      browseReady: 2,
      renderReady: 1,
      selects: 1,
    });
  });

  it("filters by collection, readiness, media family, and source text without mutating order", () => {
    const items = buildSourceLibraryItems({
      assets,
      externalSources,
      sourceSets,
      cards,
      boards,
    });
    expect(
      filterSourceLibraryItems(items, {
        collection: "working",
        mediaFilter: "all",
        query: "",
        sort: "newest",
      }).map((item) => item.id),
    ).toEqual(["set-1"]);
    expect(
      filterSourceLibraryItems(items, {
        collection: "all",
        mediaFilter: "video",
        query: "canon",
        sort: "name",
      }).map((item) => item.id),
    ).toEqual(["drive-1"]);
    expect(
      filterSourceLibraryItems(items, {
        collection: "attention",
        mediaFilter: "all",
        query: "",
        sort: "newest",
      }).map((item) => item.id),
    ).toEqual(["drive-1"]);
  });

  it("keeps legacy clock-revision selects with the source set after provider attachment", () => {
    const legacyCards = [
      {
        ...cards[0],
        sourceRange: {
          ...cards[0].sourceRange!,
          sourceSet: null,
        },
      },
    ];
    const items = buildSourceLibraryItems({
      assets: [],
      externalSources,
      sourceSets,
      cards: legacyCards,
      boards,
    });

    expect(items[0]).toMatchObject({
      key: "source-set:set-1",
      selectCount: 1,
      selectedCount: 1,
      boardCount: 1,
      isWorking: true,
    });
  });

  it("groups capture dates deterministically in UTC", () => {
    const items = buildSourceLibraryItems({
      assets,
      externalSources,
      sourceSets,
      cards,
      boards,
    });
    expect(
      groupSourceLibraryItems(items, "capture-day").map((group) => ({
        key: group.key,
        label: group.label,
      })),
    ).toEqual([
      { key: "2026-08-06", label: "August 6, 2026" },
      { key: "2026-08-05", label: "August 5, 2026" },
      { key: "2026-08-04", label: "August 4, 2026" },
    ]);
  });

  it("keeps a Drive-backed Insta360 segment as one source-room item before exact materialization", () => {
    const sourceUnit = {
      id: "source-unit-360",
      kind: "insta360-drive-segment",
      title: "2026-04-02 08:05:06 · segment 001",
      capturedAt: "2026-04-02T08:05:06.000Z",
      metadataJson: { packageStatus: "ready-to-attach" },
    };
    const packageSources = [
      {
        ...externalSources[0],
        id: "drive-insv",
        fileName: "VID_20260402_080506_00_001.insv",
        sizeBytes: "29000000000",
        sourceUnit,
        latestSourceRevision: {
          id: "drive-insv-revision",
          durationSeconds: null,
          collaborationProxy: null,
        },
      },
      {
        ...externalSources[0],
        id: "drive-lrv",
        fileName: "LRV_20260402_080506_01_001.lrv",
        sizeBytes: "1900000000",
        sourceUnit,
        latestSourceRevision: {
          id: "drive-lrv-revision",
          durationSeconds: 120,
          collaborationProxy: proxy,
        },
      },
    ];
    const items = buildSourceLibraryItems({
      assets: [],
      externalSources: packageSources,
      sourceSets: [],
      cards: [],
      boards: [],
    });
    expect(items).toEqual([
      expect.objectContaining({
        key: "external:drive-lrv",
        selectionAliases: ["external:drive-insv", "external:drive-lrv"],
        id: "drive-lrv",
        name: sourceUnit.title,
        mimeFamily: "360",
        sizeBytes: "30900000000",
        health: "browse-ready",
        healthLabel: "Browse ready · originals remain in Drive",
      }),
    ]);
    expect(
      resolveSourceLibraryItem(items, "external:drive-insv"),
    ).toMatchObject({ key: "external:drive-lrv" });
  });

  it("promotes any source-set member link to the canonical camera package", () => {
    const items = buildSourceLibraryItems({
      assets,
      externalSources,
      sourceSets,
      cards,
      boards,
    });

    expect(
      resolveSourceLibraryItem(items, "external:external-a"),
    ).toMatchObject({ key: "source-set:set-1" });
    expect(resolveSourceLibraryItem(items, "source-set:set-1")).toMatchObject({
      key: "source-set:set-1",
    });
    expect(resolveSourceLibraryItem(items, "external:missing")).toBeNull();
  });
});
