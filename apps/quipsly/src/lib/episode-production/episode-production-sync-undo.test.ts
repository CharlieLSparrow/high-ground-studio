/** @jest-environment node */

import { planEpisodeProductionSyncUndo } from "./episode-production-sync-undo";

describe("episode production sync undo", () => {
  it("restores the exact pre-review sync packet", () => {
    const beforeSync = {
      status: "ready-to-sync",
      alignment: { schema: "quipsly-capture-alignment-proposal-v1" },
    };
    const afterSync = {
      status: "synced",
      alignmentReview: {
        status: "placement-approved",
      },
    };
    const plan = planEpisodeProductionSyncUndo({
      importedMedia: [
        { id: "spine", sync: { status: "ready-to-sync" } },
        {
          id: "target",
          sync: afterSync,
        },
      ],
      syncHistory: [
        {
          type: "alignment-review",
          assetId: "target",
          beforeSync,
          afterSync,
        },
        { type: "older-entry" },
      ],
    });

    expect(plan).toMatchObject({
      ok: true,
      remainingHistory: [{ type: "older-entry" }],
      clientTimelineRestoreRequired: false,
      productionPatch: {
        importedMedia: [
          { id: "spine", sync: { status: "ready-to-sync" } },
          { id: "target", sync: beforeSync },
        ],
      },
    });
  });

  it("restores all recorded spine fields", () => {
    const plan = planEpisodeProductionSyncUndo({
      spineAudioAssetId: "new-spine",
      spineAudioLabel: "New spine",
      spineAudioSetBy: "editor",
      syncHistory: [{
        type: "set-spine-audio",
        beforeSync: {
          spineAudioAssetId: "old-spine",
          spineAudioLabel: "Old spine",
          spineAudioSetAt: "2026-07-27T18:00:00.000Z",
          spineAudioSetBy: "editor",
        },
        afterSync: {
          spineAudioAssetId: "new-spine",
          spineAudioLabel: "New spine",
          spineAudioSetBy: "editor",
        },
      }],
    });

    expect(plan).toMatchObject({
      ok: true,
      productionPatch: {
        spineAudioAssetId: "old-spine",
        spineAudioClipId: null,
        spineAudioLabel: "Old spine",
        spineAudioSetAt: "2026-07-27T18:00:00.000Z",
        spineAudioSetBy: "editor",
      },
    });
  });

  it("marks clip-source restoration as a client timeline operation", () => {
    expect(planEpisodeProductionSyncUndo({
      syncHistory: [{
        type: "attach-source",
        beforeClip: { id: "clip-1", assetId: "old-source" },
      }],
    })).toMatchObject({
      ok: true,
      clientTimelineRestoreRequired: true,
      remainingHistory: [],
    });
  });

  it("preserves unsupported history instead of claiming success", () => {
    expect(planEpisodeProductionSyncUndo({
      syncHistory: [{ type: "promote-premiere-draft-edit" }],
    })).toEqual({
      ok: false,
      code: "sync-undo-unsupported",
      message: "The latest history entry (promote-premiere-draft-edit) needs its dedicated recovery workflow and was not removed.",
      snapshot: { type: "promote-premiere-draft-edit" },
    });
  });

  it("refuses to undo over newer source sync evidence", () => {
    const plan = planEpisodeProductionSyncUndo({
      importedMedia: [{
        id: "target",
        sync: {
          status: "held",
          changedBy: "newer-editor",
        },
      }],
      syncHistory: [{
        type: "alignment-review",
        assetId: "target",
        beforeSync: {
          status: "ready-to-sync",
        },
        afterSync: {
          status: "synced",
          alignmentReview: {
            status: "placement-approved",
          },
        },
      }],
    });

    expect(plan).toMatchObject({
      ok: false,
      code: "sync-undo-stale",
    });
  });

  it("refuses unverifiable legacy undo instead of guessing", () => {
    expect(planEpisodeProductionSyncUndo({
      importedMedia: [{
        id: "target",
        sync: {
          status: "synced",
        },
      }],
      syncHistory: [{
        type: "alignment-review",
        assetId: "target",
        beforeSync: {
          status: "ready-to-sync",
        },
      }],
    })).toMatchObject({
      ok: false,
      code: "sync-undo-unsupported",
    });
  });

  it("reports an empty history without fabricating an undo", () => {
    expect(planEpisodeProductionSyncUndo({ syncHistory: [] })).toEqual({
      ok: false,
      code: "sync-undo-empty",
      message: "No sync history to undo.",
      snapshot: null,
    });
  });
});
