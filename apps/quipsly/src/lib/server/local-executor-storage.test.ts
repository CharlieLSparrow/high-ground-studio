/** @jest-environment node */

import {
  localExecutorStorageShortfall,
  publicLocalExecutorStorage,
} from "./local-executor-storage";

describe("local executor storage projection", () => {
  it("publishes capacity and durability without exposing the local path", () => {
    const storage = publicLocalExecutorStorage({
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          status: "measured",
          availableBytes: 6_770_709_120,
          reserveBytes: 5_368_709_120,
          safeAvailableBytes: 1_402_000_000,
          measuredAt: "2026-08-08T20:00:00.000Z",
          workspaceMode: "temporary",
          pathWithheld: true,
          path: "/private/var/secret/quipsly-media-ingest",
        },
      },
      lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
    });

    expect(storage).toEqual({
      status: "measured",
      availableBytes: "6770709120",
      reserveBytes: "5368709120",
      safeAvailableBytes: "1402000000",
      measuredAt: "2026-08-08T20:00:00.000Z",
      workspaceMode: "temporary",
      localPathWithheld: true,
    });
    expect(JSON.stringify(storage)).not.toContain("/private/var/secret");
    expect(localExecutorStorageShortfall(storage!, 1_900_000_000n)).toBe(
      498_000_000n,
    );
  });

  it("treats legacy heartbeats as unknown rather than claiming durability", () => {
    const storage = publicLocalExecutorStorage({
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          status: "measured",
          availableBytes: 10_000,
          reserveBytes: 1_000,
          safeAvailableBytes: 9_000,
        },
      },
      lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
    });

    expect(storage).toMatchObject({
      status: "measured",
      workspaceMode: "unknown",
      measuredAt: "2026-08-08T20:00:00.000Z",
    });
  });
});
