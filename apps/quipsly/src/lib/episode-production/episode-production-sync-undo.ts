type JsonRecord = Record<string, unknown>;

export type EpisodeProductionSyncUndoPlan =
  | {
      ok: true;
      snapshot: JsonRecord;
      remainingHistory: unknown[];
      productionPatch: JsonRecord;
      clientTimelineRestoreRequired: boolean;
    }
  | {
      ok: false;
      code: "sync-undo-empty" | "sync-undo-unsupported";
      message: string;
      snapshot: JsonRecord | null;
    };

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function planEpisodeProductionSyncUndo(
  productionJsonValue: unknown,
): EpisodeProductionSyncUndoPlan {
  const productionJson = record(productionJsonValue);
  const history = Array.isArray(productionJson.syncHistory)
    ? productionJson.syncHistory
    : [];
  const [latestValue, ...remainingHistory] = history;
  const snapshot = record(latestValue);
  const type = text(snapshot.type);

  if (!type) {
    return {
      ok: false,
      code: "sync-undo-empty",
      message: "No sync history to undo.",
      snapshot: null,
    };
  }

  if (
    type === "sync-status"
    || type === "ai-suggestion"
    || type === "alignment-review"
  ) {
    const assetId = text(snapshot.assetId);
    const importedMedia = Array.isArray(productionJson.importedMedia)
      ? productionJson.importedMedia
      : [];
    const matched = importedMedia.some((item) => {
      const asset = record(item);
      return asset.id === assetId || asset.sourceId === assetId;
    });
    if (!assetId || !matched) {
      return {
        ok: false,
        code: "sync-undo-unsupported",
        message: "The source referenced by the latest sync history entry is no longer attached. The history was preserved.",
        snapshot,
      };
    }
    return {
      ok: true,
      snapshot,
      remainingHistory,
      productionPatch: {
        importedMedia: importedMedia.map((item) => {
          const asset = record(item);
          if (asset.id !== assetId && asset.sourceId !== assetId) return item;
          return {
            ...asset,
            sync: record(snapshot.beforeSync),
          };
        }),
      },
      clientTimelineRestoreRequired: false,
    };
  }

  if (type === "set-spine-audio") {
    const before = record(snapshot.beforeSync);
    return {
      ok: true,
      snapshot,
      remainingHistory,
      productionPatch: {
        spineAudioAssetId: before.spineAudioAssetId ?? null,
        spineAudioClipId: before.spineAudioClipId ?? null,
        spineAudioSource: before.spineAudioSource ?? null,
        spineAudioLabel: before.spineAudioLabel ?? null,
        spineAudioSetAt: before.spineAudioSetAt ?? null,
        spineAudioSetBy: before.spineAudioSetBy ?? null,
      },
      clientTimelineRestoreRequired: false,
    };
  }

  if (type === "attach-source") {
    const beforeClip = record(snapshot.beforeClip);
    if (!text(beforeClip.id)) {
      return {
        ok: false,
        code: "sync-undo-unsupported",
        message: "The latest clip-source history entry has no restorable clip identity. The history was preserved.",
        snapshot,
      };
    }
    return {
      ok: true,
      snapshot,
      remainingHistory,
      productionPatch: {},
      clientTimelineRestoreRequired: true,
    };
  }

  return {
    ok: false,
    code: "sync-undo-unsupported",
    message: `The latest history entry (${type}) needs its dedicated recovery workflow and was not removed.`,
    snapshot,
  };
}
