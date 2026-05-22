import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSharedRoomMetadataPath,
  buildSharedRoomUrl,
  buildSourceMonitorProxyStoragePath,
  isSharedRoomMetadata,
  parseSharedRoomQuery,
  sanitizeSharedRoomPart,
  sanitizeStorageFileName,
} from "../apps/studio-cut-web/src/sharedRoom.ts";

const manifest = {
  id: "episode-004",
  title: "Episode 004",
  durationMs: 600000,
  sources: {
    homer: { role: "homer", label: "Homer aligned proxy" },
    charlie: { role: "charlie", label: "Charlie aligned proxy" },
    clip: { role: "clip", label: "Clip aligned proxy" },
    program: { role: "program", label: "Source monitor proxy" },
  },
  sourceMonitorProxy: {
    localPlaceholderPath: "./source-monitor-proxy.mp4",
    panes: {
      homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
      charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      clip: { x: 0, y: 0.5, width: 1, height: 0.5 },
    },
  },
  syncBootstrap: {
    source: "premiere",
  },
};

test("shared room query parsing sanitizes project and branch IDs", () => {
  assert.deepEqual(
    parseSharedRoomQuery("?projectId=Episode 004&branchId=Main Cut", {
      projectId: "fallback-project",
      branchId: "fallback-branch",
    }),
    {
      projectId: "episode-004",
      branchId: "main-cut",
    },
  );

  assert.deepEqual(
    parseSharedRoomQuery("", {
      projectId: "fallback-project",
      branchId: "fallback-branch",
    }),
    {
      projectId: "fallback-project",
      branchId: "fallback-branch",
    },
  );
});

test("shared room paths are stable and do not include raw file path separators", () => {
  assert.equal(sanitizeSharedRoomPart(" Episode 004! "), "episode-004");
  assert.equal(
    sanitizeStorageFileName("../Episode 004 Source Monitor.MP4"),
    "episode-004-source-monitor.mp4",
  );
  assert.equal(
    buildSharedRoomMetadataPath("Episode 004", "Main"),
    "studioCutProjects/episode-004/branches/main/room/meta",
  );
  assert.equal(
    buildSourceMonitorProxyStoragePath({
      projectId: "Episode 004",
      branchId: "Main",
      fileName: "../Episode 004 Source Monitor.MP4",
    }),
    "studioCutProjects/episode-004/branches/main/source-monitor-proxy/episode-004-source-monitor.mp4",
  );
});

test("shared room URL builder preserves origin and replaces room query params", () => {
  assert.equal(
    buildSharedRoomUrl("https://high-ground-odyssey.web.app/?foo=bar", {
      projectId: "Episode 004",
      branchId: "Main",
    }),
    "https://high-ground-odyssey.web.app/?foo=bar&projectId=episode-004&branchId=main",
  );
});

test("shared room metadata validates manifest and proxy storage fields", () => {
  const metadata = {
    projectId: "episode-004",
    branchId: "main",
    title: "Episode 004",
    manifest,
    sourceMonitorProxyStoragePath:
      "studioCutProjects/episode-004/branches/main/source-monitor-proxy/source-monitor.mp4",
    sourceMonitorProxyFileName: "source-monitor.mp4",
    sourceMonitorProxyContentType: "video/mp4",
    sourceMonitorProxySizeBytes: 1024,
    createdBy: "charlie@highgroundodyssey.com",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:01:00.000Z",
  };

  assert.equal(isSharedRoomMetadata(metadata), true);
  assert.equal(
    isSharedRoomMetadata({
      ...metadata,
      sourceMonitorProxySizeBytes: -1,
    }),
    false,
  );
  assert.equal(
    isSharedRoomMetadata({
      ...metadata,
      manifest: { ...manifest, durationMs: 0 },
    }),
    false,
  );
});
