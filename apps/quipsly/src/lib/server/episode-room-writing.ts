import "server-only";

import { createHash } from "node:crypto";

export type EpisodeRoomWritingRevisionSignals = {
  documentUpdatedAt: Date;
  latestBlockUpdatedAt: Date | null;
  blockCount: number;
  latestOperationId: string | null;
};

export function episodeRoomWritingVersion(
  signals: EpisodeRoomWritingRevisionSignals,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      documentUpdatedAt: signals.documentUpdatedAt.toISOString(),
      latestBlockUpdatedAt: signals.latestBlockUpdatedAt?.toISOString() ?? null,
      blockCount: Math.max(0, Math.trunc(signals.blockCount)),
      latestOperationId: signals.latestOperationId,
    }))
    .digest("base64url")
    .slice(0, 24);
}

export function episodeRoomWritingUpdatedAt(
  signals: Pick<
    EpisodeRoomWritingRevisionSignals,
    "documentUpdatedAt" | "latestBlockUpdatedAt"
  >,
) {
  const latest = signals.latestBlockUpdatedAt
    && signals.latestBlockUpdatedAt > signals.documentUpdatedAt
    ? signals.latestBlockUpdatedAt
    : signals.documentUpdatedAt;
  return latest.toISOString();
}
