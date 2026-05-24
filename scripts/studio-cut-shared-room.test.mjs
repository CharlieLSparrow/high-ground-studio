import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGeneratedPackagePreflight,
  buildGeneratedPackageStoragePath,
  buildSharedRoomMetadataPath,
  buildSharedRoomUrl,
  buildSourceMonitorProxyStoragePath,
  isSharedRoomMetadata,
  isSafeSharedRoomStoragePath,
  parseSharedRoomQuery,
  sanitizeSharedRoomPart,
  sanitizeStorageFileName,
  validateGeneratedPackageCompatibility,
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

const referenceRail = {
  syncJobId: "episode-004-rescue-sync",
  referenceRole: "phoneReferenceAudio",
  segments: [
    {
      inputId: "phone-reference-01",
      fileName: "phone-reference-01.m4a",
      railStartMs: 0,
      sourceStartMs: 0,
      durationMs: 600000,
      confidence: 0.9,
      warnings: [],
    },
  ],
  totalDurationMs: 600000,
  warnings: [],
};

const syncMap = {
  syncMapId: "episode-004-sync-map",
  syncJobId: "episode-004-rescue-sync",
  projectId: "episode-004",
  branchId: "main",
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:01:00.000Z",
  canonicalTimeline: {
    durationMs: 600000,
    timebase: "milliseconds",
    referenceRole: "phoneReferenceAudio",
  },
  assets: [
    {
      assetId: "homer-video-asset",
      inputId: "homer-video",
      role: "homerVideo",
      fileName: "homer-video.mp4",
      originalStoragePath:
        "studioCutSyncJobs/episode-004-rescue-sync/uploads/homerVideo/homer-video.mp4",
      proxyStoragePath:
        "studioCutSyncJobs/episode-004-rescue-sync/outputs/homer-video-proxy.mp4",
      timelineStartMs: 0,
      assetStartMs: 0,
      durationMs: 600000,
      estimatedOffsetMs: 0,
      confidence: 0.82,
      warnings: [],
    },
  ],
  referenceRail,
  globalWarnings: [],
};

const syncReport = {
  syncJobId: "episode-004-rescue-sync",
  generatedAt: "2026-05-22T12:01:00.000Z",
  status: "ready",
  referenceRail,
  trackOffsets: [
    {
      role: "homerVideo",
      inputId: "homer-video",
      fileName: "homer-video.mp4",
      estimatedOffsetMs: 0,
      confidence: 0.82,
      warnings: [],
    },
  ],
  globalWarnings: [],
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
  assert.equal(
    buildGeneratedPackageStoragePath({
      syncJobId: "Episode 004 Rescue Sync",
      fileName: "../Sync Map.JSON",
    }),
    "studioCutSyncJobs/episode-004-rescue-sync/outputs/sync-map.json",
  );
  assert.equal(
    isSafeSharedRoomStoragePath(
      "studioCutSyncJobs/episode-004-rescue-sync/outputs/sync-map.json",
    ),
    true,
  );
  assert.equal(isSafeSharedRoomStoragePath("/tmp/sync-map.json"), false);
  assert.equal(isSafeSharedRoomStoragePath("file:///tmp/sync-map.json"), false);
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
    packageKind: "rescue_sync_generated",
    syncJobId: "episode-004-rescue-sync",
    manifestStoragePath:
      "studioCutSyncJobs/episode-004-rescue-sync/outputs/episode-manifest.json",
    syncMapStoragePath:
      "studioCutSyncJobs/episode-004-rescue-sync/outputs/sync-map.json",
    syncReportStoragePath:
      "studioCutSyncJobs/episode-004-rescue-sync/outputs/sync-report.json",
    generatedByWorkerVersion: "studio-cut-cloud-sync-worker-v0",
    packageCreatedAt: "2026-05-22T12:01:00.000Z",
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
  assert.equal(
    isSharedRoomMetadata({
      ...metadata,
      syncMapStoragePath: "/Users/charlie/sync-map.json",
    }),
    false,
  );
  assert.equal(
    isSharedRoomMetadata({
      ...metadata,
      packageKind: "raw_original_upload",
    }),
    false,
  );

  assert.equal(
    isSharedRoomMetadata({
      ...metadata,
      sourceMonitorProxyStoragePath:
        "studioCutSyncJobs/episode-004-rescue-sync/outputs/source-monitor-proxy.mp4",
      sourceMonitorProxySizeBytes: 0,
      notes:
        "Published directly from Cloud Sync worker outputs without local path metadata.",
    }),
    true,
  );
});

test("generated Rescue Sync package compatibility validates durable metadata", () => {
  assert.deepEqual(
    validateGeneratedPackageCompatibility({
      manifest,
      syncMap,
      syncReport,
    }),
    { ok: true, errors: [] },
  );

  assert.equal(
    validateGeneratedPackageCompatibility({
      manifest: { ...manifest, durationMs: 602500 },
      syncMap,
      syncReport,
    }).ok,
    false,
  );
  assert.equal(
    validateGeneratedPackageCompatibility({
      manifest: { ...manifest, id: "episode-005" },
      syncMap,
      syncReport,
    }).ok,
    false,
  );
  assert.equal(
    validateGeneratedPackageCompatibility({
      manifest,
      syncMap,
      syncReport: { ...syncReport, syncJobId: "other-job" },
    }).ok,
    false,
  );
  assert.equal(
    validateGeneratedPackageCompatibility({
      manifest: {
        ...manifest,
        sourceMonitorProxy: {
          ...manifest.sourceMonitorProxy,
          localPlaceholderPath: "/Users/charlie/episode-004/source-monitor.mp4",
        },
      },
      syncMap,
      syncReport,
    }).ok,
    false,
  );
});

test("generated Rescue Sync package preflight summarizes publish readiness", () => {
  const ready = buildGeneratedPackagePreflight({
    roomSelection: { projectId: "episode-004", branchId: "main" },
    manifest,
    syncMap,
    syncReport,
    proxyFileName: "source-monitor-proxy.synthetic.mp4",
    proxySizeBytes: 1234,
  });

  assert.equal(ready.status, "ready");
  assert.equal(ready.canPublish, true);
  assert.deepEqual(ready.targetRoom, {
    projectId: "episode-004",
    branchId: "main",
  });
  assert.equal(ready.errors.length, 0);
  assert.equal(
    ready.checks.every(
      (check) => check.status === "ready" || check.status === "optional",
    ),
    true,
  );

  const waiting = buildGeneratedPackagePreflight({
    roomSelection: { projectId: "episode-004", branchId: "main" },
    manifest,
  });

  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.canPublish, false);
  assert.equal(
    waiting.checks.some((check) => check.detail.includes("source-monitor proxy")),
    true,
  );

  const blocked = buildGeneratedPackagePreflight({
    roomSelection: { projectId: "episode-004", branchId: "draft" },
    manifest,
    syncMap,
    proxyFileName: "source-monitor.mp4",
    proxySizeBytes: 1234,
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.canPublish, false);
  assert.equal(
    blocked.errors.some((error) => error.includes("package targets episode-004 / main")),
    true,
  );
});
