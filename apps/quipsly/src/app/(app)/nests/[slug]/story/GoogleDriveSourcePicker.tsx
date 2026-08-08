"use client";

import {
  Cloud,
  ExternalLink,
  FileVideo2,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ExternalMediaLibraryProjection } from "@/lib/external-media-library-contract";

type DriveConnection = {
  id: string;
  accountLabel: string | null;
  status: string;
  revision: number;
  verifiedAt: string | null;
};

type LibraryConformPlan = {
  schema: "quipsly-google-drive-library-conform-plan-v1";
  library: {
    id: string;
    name: string;
    unattachedHeldSegmentCount: number;
  };
  summary: {
    segmentCount: number;
    renderReady: number;
    readyToBind: number;
    preparing: number;
    needsPreparation: number;
    held: number;
    totalOriginalBytes: string;
    remainingBytes: string;
    aggregateShortfallBytes: string;
    inventoryTruncated: boolean;
  };
  executor: {
    status: "measured" | "unavailable";
    safeAvailableBytes: string | null;
    availableBytes: string | null;
    reserveBytes: string | null;
    measuredAt: string | null;
    workspaceMode: "durable" | "temporary" | "unknown";
    localPathWithheld: true;
  };
  days: Array<{
    date: string | null;
    segmentCount: number;
    renderReadyCount: number;
    heldCount: number;
    remainingBytes: string;
    originalBytes: string;
    segments: Array<{
      sourceUnitId: string;
      title: string;
      captureKey: string | null;
      status:
        | "render-ready"
        | "held"
        | "ready-to-bind"
        | "preparing"
        | "needs-preparation";
      remainingBytes: string;
      originalBytes: string;
      holds: string[];
    }>;
  }>;
};

type ExternalMediaLibrary = ExternalMediaLibraryProjection;

type PickerDocument = {
  id?: string;
  resourceKey?: string;
};

type PickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; RESOURCE_KEY: string };
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsView: new (viewId: string) => {
    setMode(value: string): unknown;
    setIncludeFolders(value: boolean): unknown;
    setSelectFolderEnabled(value: boolean): unknown;
    setMimeTypes(value: string): unknown;
  };
  PickerBuilder: new () => {
    addView(view: unknown): unknown;
    setOAuthToken(token: string): unknown;
    setDeveloperKey(key: string): unknown;
    setAppId(appId: string): unknown;
    enableFeature(feature: string): unknown;
    setCallback(callback: (data: Record<string, unknown>) => void): unknown;
    build(): { setVisible(value: boolean): void };
  };
};

type PickerWindow = Window & {
  gapi?: {
    load(name: string, options: { callback(): void; onerror(): void }): void;
  };
  google?: { picker?: PickerNamespace };
};

function pickerWindow() {
  return window as PickerWindow;
}

let pickerApiPromise: Promise<PickerNamespace> | null = null;

function loadGooglePicker() {
  const browser = pickerWindow();
  if (browser.google?.picker) return Promise.resolve(browser.google.picker);
  if (pickerApiPromise) return pickerApiPromise;
  pickerApiPromise = new Promise<PickerNamespace>((resolve, reject) => {
    const loadModule = () => {
      if (!browser.gapi)
        return reject(new Error("Google Picker did not initialize."));
      browser.gapi.load("picker", {
        callback: () =>
          browser.google?.picker
            ? resolve(browser.google.picker)
            : reject(new Error("Google Picker is unavailable.")),
        onerror: () => reject(new Error("Google Picker could not load.")),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-quipsly-google-picker="true"]',
    );
    if (existing) {
      if (browser.gapi) loadModule();
      else {
        existing.addEventListener("load", loadModule, { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Google Picker could not load.")),
          { once: true },
        );
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.quipslyGooglePicker = "true";
    script.addEventListener("load", loadModule, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Picker could not load.")),
      { once: true },
    );
    document.head.append(script);
  }).catch((error) => {
    pickerApiPromise = null;
    throw error;
  });
  return pickerApiPromise;
}

function pickerBuilder(
  picker: PickerNamespace,
  input: {
    accessToken: string;
    apiKey: string;
    appId: string;
    mode: "files" | "folder";
    callback(data: Record<string, unknown>): void;
  },
) {
  const view = new picker.DocsView(picker.ViewId.DOCS);
  // `drive.file` deliberately does not grant thumbnail access for every file
  // the account can browse. Google's current Picker guidance recommends list
  // mode for that least-privilege scope so the chooser remains complete and
  // does not fill with unavailable preview tiles.
  view.setMode(picker.DocsViewMode.LIST);
  view.setIncludeFolders(true);
  view.setSelectFolderEnabled(input.mode === "folder");
  if (input.mode === "folder")
    view.setMimeTypes("application/vnd.google-apps.folder");
  const builder = new picker.PickerBuilder();
  builder.addView(view);
  builder.setOAuthToken(input.accessToken);
  builder.setDeveloperKey(input.apiKey);
  builder.setAppId(input.appId);
  if (input.mode === "files")
    builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
  builder.setCallback(input.callback);
  return builder.build();
}

type FolderPlan = {
  schema: "quipsly-google-drive-media-library-plan-v1";
  root: { name: string };
  status: "ready" | "partial" | "empty";
  totalFiles: number;
  totalSizeBytes: string;
  readySegmentCount: number;
  heldSegmentCount: number;
  batches: Array<{
    folder: {
      name: string;
      captureBatchKey: string;
      expectedSegments: string[];
    };
    status: "ready" | "partial" | "empty";
    segments: Array<{
      key: string;
      displayName: string;
      status: string;
      reasons: string[];
      totalSizeBytes: string;
      members: Array<{ name: string; role: string; sizeBytes: string | null }>;
    }>;
  }>;
};

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024)).toLocaleString()} KB`;
}

function formatCaptureDay(value: string | null) {
  if (!value) return "Capture date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCountDelta(current: number, previous: number) {
  const delta = current - previous;
  return delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta}`;
}

function FollowedDriveLibraries({
  libraries,
  canWrite,
  pending,
  onRefresh,
  onPrepare,
  onCheck,
  conformPlan,
  onPlanConform,
  onAdd,
}: {
  libraries?: ExternalMediaLibrary[];
  canWrite: boolean;
  pending: boolean;
  onRefresh(library: ExternalMediaLibrary): void;
  onPrepare(library: ExternalMediaLibrary): void;
  onCheck(library: ExternalMediaLibrary): void;
  conformPlan: LibraryConformPlan | null;
  onPlanConform(library: ExternalMediaLibrary): void;
  onAdd(library: ExternalMediaLibrary): void;
}) {
  if (!libraries?.length) return null;
  return (
    <section
      aria-label="External source libraries"
      className="mt-3 space-y-2 rounded-xl border border-teal-200 bg-white p-3"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-900">
          External source libraries
        </p>
        <p className="mt-1 text-[10px] font-semibold leading-4 text-[#5f684f]">
          Drive libraries and user-authorized Mac folders discover camera
          packages without moving originals into Quipsly. Neither mode treats a
          missing observation as permission to delete source history.
        </p>
      </div>
      {libraries.map((library) => (
        <article
          key={library.id}
          className="rounded-xl border border-[#e4ddcf] bg-[#fffdf8] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#3e2f21]">
                {library.name}
              </p>
              <p className="mt-1 text-[9px] font-bold text-[#806a4d]">
                {library.totalFileCount.toLocaleString()} files ·{" "}
                {formatBytes(library.totalSizeBytes)} ·{" "}
                {library.readySegmentCount} ready · {library.heldSegmentCount}{" "}
                held
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${library.status === "ready" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}
              >
                {library.status}
              </span>
              <span className="rounded-full border border-teal-200 bg-white px-2 py-1 text-[8px] font-black uppercase text-teal-900">
                {library.discoveryMode === "selected-files"
                  ? "Selected files"
                  : library.discoveryMode === "device-folder-scan"
                    ? "Mac folder"
                    : "Drive folder"}
              </span>
            </div>
          </div>
          {library.notObservedCount > 0 ? (
            <p className="mt-2 text-[9px] font-bold leading-4 text-amber-900">
              {library.notObservedCount} previously seen file
              {library.notObservedCount === 1 ? " was" : "s were"} not observed
              in the latest complete scan. Existing cards, ranges, and revisions
              remain intact.
            </p>
          ) : null}
          {library.heldSegmentCount > 0 ? (
            <>
              <p className="mt-2 text-[9px] font-semibold leading-4 text-amber-900">
                Held packages are observed but not attached as usable Studio
                sources. Refresh from the owning surface after syncing finishes
                or missing camera companions arrive; complete packages attach
                without disturbing existing cards.
              </p>
              {library.heldSegments?.length ? (
                <details className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-2">
                  <summary className="cursor-pointer min-h-11 py-3 text-[9px] font-black uppercase tracking-wide text-amber-950">
                    Review {library.heldSegmentCount} held camera segment
                    {library.heldSegmentCount === 1 ? "" : "s"}
                  </summary>
                  <div className="max-h-56 space-y-2 overflow-y-auto pb-2 pr-1">
                    {library.heldSegments.map((segment) => (
                      <article
                        key={`${segment.batchName}:${segment.segment}`}
                        className="rounded-lg border border-amber-200 bg-white p-2"
                      >
                        <p className="truncate text-[8px] font-black uppercase tracking-wide text-amber-800">
                          {segment.batchName}
                        </p>
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <p className="text-[10px] font-black text-[#3e2f21]">
                            {segment.displayName}
                          </p>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-950">
                            {segment.observedMemberCount} observed
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] font-semibold leading-4 text-amber-950">
                          {segment.reasons.join(" ") ||
                            "The camera package is not complete yet."}
                        </p>
                      </article>
                    ))}
                    {(library.heldSegmentsOmittedCount ?? 0) > 0 ? (
                      <p className="rounded-lg border border-amber-200 bg-white p-2 text-[9px] font-bold text-amber-950">
                        {library.heldSegmentsOmittedCount} additional held
                        segments are retained in the library receipt. Split very
                        large roots into smaller working libraries for detailed
                        review.
                      </p>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
          {library.discoveryMode === "selected-files" ? (
            <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50/70 p-2">
              <p className="text-[9px] font-semibold leading-4 text-teal-900">
                Least-privilege library: Refresh rechecks only the exact files
                you selected. To add a camera batch, open its folder in Google
                Picker and select the matching INSV and LRV files together.
                Quipsly does not scan unrelated Drive content.
              </p>
              {library.connectedByCurrentUser ? (
                <button
                  type="button"
                  disabled={!canWrite || pending || !library.canRefresh}
                  onClick={() => onAdd(library)}
                  className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-teal-400 bg-white px-3 text-[10px] font-black text-teal-950 disabled:opacity-50"
                >
                  <FileVideo2 size={13} aria-hidden="true" />
                  Authorize more 360 files
                </button>
              ) : null}
            </div>
          ) : null}
          {library.provider === "quipsly-device-folder" ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-emerald-950">
                Mac-resolved originals
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-emerald-900">
                Nest has safe package identities and health, but no local path
                and no permission to fetch these bytes. Open Quipsly Studio on
                the Mac that granted this folder to refresh it, verify exact
                bytes, build proxies, or render. Drive for desktop may keep the
                originals streamed until one of those explicit operations.
              </p>
            </div>
          ) : library.navigationHealth?.eligibleSourceCount ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wide text-sky-950">
                    Browse readiness
                  </p>
                  <p className="mt-1 text-xs font-black text-sky-950">
                    {library.navigationHealth.browseReadyCount} of{" "}
                    {library.navigationHealth.eligibleSourceCount} camera
                    segments ready to scan
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-sky-950">
                  {Math.round(
                    (library.navigationHealth.browseReadyCount /
                      library.navigationHealth.eligibleSourceCount) *
                      100,
                  )}
                  %
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${library.name} browse readiness`}
                aria-valuemin={0}
                aria-valuemax={library.navigationHealth.eligibleSourceCount}
                aria-valuenow={library.navigationHealth.browseReadyCount}
                className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100"
              >
                <span
                  className="block h-full rounded-full bg-sky-700 transition-[width]"
                  style={{
                    width: `${(library.navigationHealth.browseReadyCount / library.navigationHealth.eligibleSourceCount) * 100}%`,
                  }}
                />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-[8px] sm:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-5">
                {[
                  [
                    "LRV retained",
                    library.navigationHealth.retainedBrowseCount,
                  ],
                  ["Proxy", library.navigationHealth.proxyReadyCount],
                  ["Visual map", library.navigationHealth.visualReadyCount],
                  ["Waveform", library.navigationHealth.audioReadyCount],
                  ["Complete", library.navigationHealth.browseReadyCount],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-sky-100 bg-white p-2"
                  >
                    <dt className="font-bold text-sky-700">{label}</dt>
                    <dd className="mt-1 text-[11px] font-black text-sky-950">
                      {value} / {library.navigationHealth!.eligibleSourceCount}
                    </dd>
                  </div>
                ))}
              </dl>
              {library.navigationHealth.captureDays.length ? (
                <details className="mt-2 rounded-xl border border-sky-200 bg-white px-2">
                  <summary className="cursor-pointer min-h-11 py-3 text-[9px] font-black uppercase tracking-wide text-sky-950">
                    Camera days · {library.navigationHealth.captureDays.length}
                  </summary>
                  <div className="space-y-2 pb-2">
                    {library.navigationHealth.captureDays.map((day) => (
                      <div
                        key={day.date ?? "capture-date-unavailable"}
                        className="flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50/60 p-2"
                      >
                        <div>
                          <p className="text-[10px] font-black text-sky-950">
                            {formatCaptureDay(day.date)}
                          </p>
                          <p className="mt-1 text-[8px] font-bold text-sky-700">
                            {day.browseReadyCount} of {day.eligibleSourceCount}{" "}
                            ready to scan
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[8px] font-black text-sky-950">
                          {day.pendingTransferBytes === "0"
                            ? "LRV retained"
                            : `${formatBytes(day.pendingTransferBytes)} left`}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {library.navigationHealth.remainingCount > 0 ? (
                <p className="mt-2 text-[9px] font-semibold leading-4 text-sky-900">
                  Next resumable pass: {library.navigationHealth.nextBatchCount}{" "}
                  segment
                  {library.navigationHealth.nextBatchCount === 1 ? "" : "s"} ·
                  up to{" "}
                  {formatBytes(library.navigationHealth.nextBatchTransferBytes)}{" "}
                  in this storage-aware pass.{" "}
                  {formatBytes(library.navigationHealth.pendingTransferBytes)}{" "}
                  of LRV companions remain overall. INSV originals stay in
                  Drive.
                </p>
              ) : (
                <p className="mt-2 rounded-lg bg-emerald-100 p-2 text-[9px] font-black text-emerald-950">
                  Every attached camera segment has a proxy, visual map, and
                  measured waveform.
                </p>
              )}
              {library.navigationHealth.executorStorage.status ===
              "measured" ? (
                <div
                  role="status"
                  className={`mt-2 rounded-lg border p-2 text-[9px] font-bold leading-4 ${
                    library.navigationHealth.nextBatchFits === false
                      ? "border-rose-300 bg-rose-100 text-rose-950"
                      : library.navigationHealth.executorStorage
                            .workspaceMode === "durable"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-950"
                        : "border-amber-300 bg-amber-100 text-amber-950"
                  }`}
                >
                  {library.navigationHealth.nextBatchFits === false ? (
                    <>
                      This pass needs{" "}
                      {formatBytes(
                        library.navigationHealth.nextBatchShortfallBytes,
                      )}{" "}
                      more safe storage. No transfer will be queued. Free space
                      or activate a durable media workspace.
                    </>
                  ) : library.navigationHealth.executorStorage.workspaceMode ===
                    "durable" ? (
                    <>
                      Durable Mac workspace ·{" "}
                      {formatBytes(
                        library.navigationHealth.executorStorage
                          .safeAvailableBytes ?? "0",
                      )}{" "}
                      safely available after the reserve.
                    </>
                  ) : (
                    <>
                      Temporary Mac workspace ·{" "}
                      {formatBytes(
                        library.navigationHealth.executorStorage
                          .safeAvailableBytes ?? "0",
                      )}{" "}
                      safely available after the reserve. Prepared media may be
                      reclaimed by macOS; activate a durable workspace before
                      production batches.
                    </>
                  )}
                </div>
              ) : (
                <p
                  role="status"
                  className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px] font-bold leading-4 text-amber-950"
                >
                  No fresh Mac capacity reading. The local worker still refuses
                  transfers that cross its storage reserve.
                </p>
              )}
              {library.navigationHealth.inventoryTruncated ? (
                <p className="mt-2 text-[9px] font-bold leading-4 text-amber-900">
                  This progress view is bounded to the first 500 observed files.
                  Split this root into smaller working libraries before bulk
                  preparation.
                </p>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onCheck(library)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-3 text-[10px] font-black text-sky-950 disabled:opacity-50"
                >
                  <RefreshCw
                    size={13}
                    className={pending ? "animate-spin" : ""}
                    aria-hidden="true"
                  />
                  Check progress
                </button>
                <button
                  type="button"
                  disabled={
                    !canWrite ||
                    pending ||
                    !library.canRefresh ||
                    library.navigationHealth.remainingCount === 0 ||
                    library.navigationHealth.nextBatchFits === false
                  }
                  onClick={() => onPrepare(library)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-950 px-3 text-[10px] font-black text-white disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2
                      size={13}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileVideo2 size={13} aria-hidden="true" />
                  )}
                  Prepare next {library.navigationHealth.nextBatchCount}
                </button>
              </div>
            </div>
          ) : library.provider === "google-drive" &&
            library.connectedByCurrentUser &&
            library.readySegmentCount > 0 ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-sky-950">
                Local browse preparation
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-sky-900">
                Prepare up to 12 camera segments in one resumable pass. Quipsly
                caches only each LRV, then builds a small proxy, visual map, and
                full-decode waveform on this Mac. INSV originals stay in Drive.
              </p>
              <button
                type="button"
                disabled={!canWrite || pending || !library.canRefresh}
                onClick={() => onPrepare(library)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-3 text-[10px] font-black text-white disabled:opacity-50"
              >
                {pending ? (
                  <Loader2
                    size={13}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FileVideo2 size={13} aria-hidden="true" />
                )}
                Prepare next 12 browse maps
              </button>
            </div>
          ) : null}
          {library.provider === "google-drive" &&
          library.readySegmentCount > 0 ? (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wide text-violet-950">
                    Final-quality originals
                  </p>
                  <p className="mt-1 text-[9px] font-semibold leading-4 text-violet-900">
                    Inspect exact INSV storage for the whole followed library.
                    This metadata-only plan cannot start a download.
                  </p>
                </div>
                <HardDrive
                  size={16}
                  className="shrink-0 text-violet-800"
                  aria-hidden="true"
                />
              </div>
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() => onPlanConform(library)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-3 text-[10px] font-black text-violet-950 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2
                    size={13}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <HardDrive size={13} aria-hidden="true" />
                )}
                {conformPlan?.library.id === library.id
                  ? "Refresh final-quality plan"
                  : "Plan final-quality storage"}
              </button>
              {conformPlan?.library.id === library.id ? (
                <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3 text-[9px] text-violet-950">
                  <p className="text-xs font-black">
                    {conformPlan.summary.renderReady} of{" "}
                    {conformPlan.summary.segmentCount} attached segments are
                    render-ready
                  </p>
                  <p className="mt-1 font-semibold leading-4">
                    {formatBytes(conformPlan.summary.remainingBytes)} remain
                    across {formatBytes(conformPlan.summary.totalOriginalBytes)}{" "}
                    of exact originals. No downloads have started.
                  </p>
                  {conformPlan.executor.status === "measured" ? (
                    <p className="mt-2 rounded-lg bg-violet-50 p-2 font-bold leading-4">
                      {formatBytes(
                        conformPlan.executor.safeAvailableBytes ?? "0",
                      )}{" "}
                      safely available on the active Mac after its{" "}
                      {formatBytes(conformPlan.executor.reserveBytes ?? "0")}{" "}
                      reserve.
                    </p>
                  ) : (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 font-bold leading-4 text-amber-950">
                      No fresh Mac storage measurement is available. Individual
                      preparation still refuses to cross the configured safety
                      reserve.
                    </p>
                  )}
                  {conformPlan.summary.aggregateShortfallBytes !== "0" ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 font-black leading-4 text-rose-950">
                      The whole library is{" "}
                      {formatBytes(conformPlan.summary.aggregateShortfallBytes)}{" "}
                      over this Mac&apos;s safe capacity. Prepare only chosen
                      segments or free storage first.
                    </p>
                  ) : null}
                  {conformPlan.library.unattachedHeldSegmentCount > 0 ? (
                    <p className="mt-2 font-bold leading-4 text-amber-950">
                      {conformPlan.library.unattachedHeldSegmentCount}{" "}
                      incomplete library segment
                      {conformPlan.library.unattachedHeldSegmentCount === 1
                        ? " is"
                        : "s are"}{" "}
                      excluded until the exact camera package is complete.
                    </p>
                  ) : null}
                  <details className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2">
                    <summary className="cursor-pointer min-h-11 py-3 font-black uppercase tracking-wide">
                      Final-quality camera days · {conformPlan.days.length}
                    </summary>
                    <div className="space-y-2 pb-2">
                      {conformPlan.days.map((day) => (
                        <article
                          key={day.date ?? "conform-date-unavailable"}
                          className="rounded-lg border border-violet-100 bg-white p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black">
                                {formatCaptureDay(day.date)}
                              </p>
                              <p className="mt-1 font-bold text-violet-700">
                                {day.renderReadyCount} of {day.segmentCount}{" "}
                                render-ready · {formatBytes(day.remainingBytes)}{" "}
                                remain
                              </p>
                            </div>
                            {day.heldCount > 0 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-950">
                                {day.heldCount} held
                              </span>
                            ) : null}
                          </div>
                          <ul className="mt-2 space-y-1">
                            {day.segments.map((segment) => (
                              <li
                                key={segment.sourceUnitId}
                                className="rounded-md bg-violet-50 p-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="min-w-0 truncate font-black">
                                    {segment.title}
                                  </span>
                                  <span className="shrink-0 uppercase text-violet-700">
                                    {segment.status.replaceAll("-", " ")}
                                  </span>
                                </div>
                                <p className="mt-1 font-semibold text-violet-800">
                                  {formatBytes(segment.remainingBytes)} remain
                                  {segment.holds.length
                                    ? ` · ${segment.holds.join(" ")}`
                                    : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </details>
                  {conformPlan.summary.inventoryTruncated ? (
                    <p className="mt-2 font-bold leading-4 text-amber-950">
                      This plan is bounded to 50 attached camera segments. Split
                      larger archives into working libraries before conform.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[8px] font-semibold text-[#806a4d]">
              Checked {new Date(library.lastCheckedAt).toLocaleString()}
              {!library.connectedByCurrentUser
                ? " · connected by a collaborator"
                : ""}
            </p>
            {library.provider === "google-drive" ? (
              <button
                type="button"
                disabled={!canWrite || pending || !library.canRefresh}
                onClick={() => onRefresh(library)}
                className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-teal-300 bg-white px-3 text-[10px] font-black text-teal-950 disabled:opacity-50"
              >
                <RefreshCw
                  size={12}
                  className={pending ? "animate-spin" : ""}
                  aria-hidden="true"
                />
                Refresh from Drive
              </button>
            ) : (
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] font-black text-emerald-950">
                Refresh in Quipsly Studio
              </span>
            )}
          </div>
          {!library.canRefresh && library.provider === "google-drive" ? (
            <p className="mt-2 text-[9px] font-semibold leading-4 text-[#806a4d]">
              The connected account owner can refresh this library;
              collaborators can keep reviewing the existing sources.
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export function GoogleDriveSourcePicker({
  projectSlug,
  canWrite,
  libraries,
  onAttached,
}: {
  projectSlug: string;
  canWrite: boolean;
  libraries?: ExternalMediaLibrary[];
  onAttached(): Promise<unknown>;
}) {
  const [connections, setConnections] = useState<DriveConnection[]>([]);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [pickerConfigured, setPickerConfigured] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [pending, setPending] = useState(false);
  const [folderSelection, setFolderSelection] = useState<PickerDocument | null>(
    null,
  );
  const [folderPlan, setFolderPlan] = useState<FolderPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryConformPlan, setLibraryConformPlan] =
    useState<LibraryConformPlan | null>(null);

  const returnTo = `/nests/${encodeURIComponent(projectSlug)}/story`;
  const connectHref = `/api/media/connections/google-drive/start?returnTo=${encodeURIComponent(returnTo)}`;
  const verifiedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "verified"),
    [connections],
  );

  async function loadConnections() {
    setLoadingConnections(true);
    try {
      const response = await fetch("/api/media/connections/google-drive", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        oauthConfigured?: boolean;
        pickerConfigured?: boolean;
        connections?: DriveConnection[];
      };
      if (!response.ok)
        throw new Error(
          payload.error || "Drive connections could not be loaded.",
        );
      const next = payload.connections ?? [];
      setConnections(next);
      setOauthConfigured(payload.oauthConfigured !== false);
      setPickerConfigured(payload.pickerConfigured !== false);
      setSelectedConnectionId((current) =>
        next.some(
          (connection) =>
            connection.id === current && connection.status === "verified",
        )
          ? current
          : (next.find((connection) => connection.status === "verified")?.id ??
            ""),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Drive connections could not be loaded.",
      );
    } finally {
      setLoadingConnections(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  async function attachDocuments(
    connectionId: string,
    documents: PickerDocument[],
  ) {
    let attached = 0;
    for (const document of documents) {
      if (!document.id) continue;
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "attach-google-drive-source",
            connectionId,
            externalFileId: document.id,
            resourceKey: document.resourceKey ?? null,
            clientRequestId: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          payload.error || "A selected Drive file could not be attached.",
        );
      attached += 1;
    }
    if (!attached)
      throw new Error("Google Picker did not return a file identity.");
    await onAttached();
    return attached;
  }

  async function attach360Documents(
    connectionId: string,
    documents: PickerDocument[],
    targetLibrary?: ExternalMediaLibrary | null,
  ) {
    const selections = documents
      .filter((document) => Boolean(document.id))
      .map((document) => ({
        externalFileId: document.id!,
        resourceKey: document.resourceKey ?? null,
      }));
    if (!selections.length)
      throw new Error("Google Picker did not return a file identity.");
    const response = await fetch(
      `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach-google-drive-files",
          connectionId,
          selections,
          libraryRootId: folderSelection?.id ?? null,
          libraryRootName: folderPlan?.root.name ?? null,
          libraryRootResourceKey: folderSelection?.resourceKey ?? null,
          existingLibraryId: targetLibrary?.id ?? null,
          clientRequestId: crypto.randomUUID(),
        }),
      },
    );
    const payload = (await response.json()) as {
      error?: string;
      operation?: {
        attachedCount?: number;
        sourceUnitCount?: number;
        sourceSetCount?: number;
        observedHeldSegmentCount?: number;
        plan?: FolderPlan;
        library?: ExternalMediaLibrary;
      };
    };
    if (!response.ok)
      throw new Error(
        payload.error || "Those Insta360 files could not be attached.",
      );
    await onAttached();
    return {
      attachedCount: payload.operation?.attachedCount ?? 0,
      sourceUnitCount: payload.operation?.sourceUnitCount ?? 0,
      sourceSetCount: payload.operation?.sourceSetCount ?? 0,
      observedHeldSegmentCount:
        payload.operation?.observedHeldSegmentCount ?? 0,
      plan: payload.operation?.plan ?? null,
      library: payload.operation?.library ?? null,
    };
  }

  async function inspectFolder(connectionId: string, document: PickerDocument) {
    if (!document.id)
      throw new Error("Google Picker did not return a folder identity.");
    const response = await fetch(
      `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inspect-google-drive-folder",
          connectionId,
          folderId: document.id,
          resourceKey: document.resourceKey ?? null,
        }),
      },
    );
    const payload = (await response.json()) as {
      error?: string;
      operation?: { plan?: FolderPlan };
    };
    if (!response.ok || !payload.operation?.plan)
      throw new Error(
        payload.error || "That Drive folder could not be inspected.",
      );
    setFolderSelection(document);
    setFolderPlan(payload.operation.plan);
    return payload.operation.plan;
  }

  async function browseDrive(
    mode: "files" | "folder" | "360-files",
    targetLibrary?: ExternalMediaLibrary | null,
  ) {
    const pickerConnectionId =
      targetLibrary?.connectionId ?? selectedConnectionId;
    if (!pickerConnectionId) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const tokenResponse = await fetch(
        "/api/media/connections/google-drive/picker-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: pickerConnectionId }),
        },
      );
      const token = (await tokenResponse.json()) as {
        error?: string;
        accessToken?: string;
        apiKey?: string;
        appId?: string;
        connectionId?: string;
      };
      if (
        !tokenResponse.ok ||
        !token.accessToken ||
        !token.apiKey ||
        !token.appId ||
        !token.connectionId
      ) {
        throw new Error(
          token.error || "Google Drive could not prepare the file browser.",
        );
      }
      const picker = await loadGooglePicker();
      await new Promise<void>((resolve, reject) => {
        const dialog = pickerBuilder(picker, {
          accessToken: token.accessToken!,
          apiKey: token.apiKey!,
          appId: token.appId!,
          mode: mode === "folder" ? "folder" : "files",
          callback: (data) => {
            const action = data[picker.Response.ACTION];
            if (action === picker.Action.CANCEL) {
              resolve();
              return;
            }
            if (action !== picker.Action.PICKED) return;
            const rawDocuments = data[picker.Response.DOCUMENTS];
            const documents = Array.isArray(rawDocuments)
              ? rawDocuments.map((document) => {
                  const record = document as Record<string, unknown>;
                  return {
                    id:
                      typeof record[picker.Document.ID] === "string"
                        ? String(record[picker.Document.ID])
                        : undefined,
                    resourceKey:
                      typeof record[picker.Document.RESOURCE_KEY] === "string"
                        ? String(record[picker.Document.RESOURCE_KEY])
                        : undefined,
                  };
                })
              : [];
            const operation =
              mode === "folder"
                ? inspectFolder(token.connectionId!, documents[0] ?? {})
                : mode === "360-files"
                  ? attach360Documents(
                      token.connectionId!,
                      documents,
                      targetLibrary,
                    )
                  : attachDocuments(token.connectionId!, documents);
            void operation
              .then((result) => {
                if (typeof result === "number") {
                  setMessage(
                    `Attached ${result} Drive source${result === 1 ? "" : "s"}. Originals remain in Drive.`,
                  );
                } else if ("root" in result) {
                  setMessage(
                    result.totalFiles === 0
                      ? `Google shared the ${result.root.name} folder identity but not its contents. Use “Choose 360 files” and select the matching INSV and LRV files; Quipsly will group them automatically.`
                      : `Inspected ${result.root.name}: ${result.readySegmentCount} segment${result.readySegmentCount === 1 ? "" : "s"} ready, ${result.heldSegmentCount} held.`,
                  );
                } else {
                  setFolderPlan(result.plan);
                  setMessage(
                    `Attached ${result.sourceUnitCount} ready camera segment${result.sourceUnitCount === 1 ? "" : "s"} from ${result.attachedCount} exact Drive file${result.attachedCount === 1 ? "" : "s"}. ${result.observedHeldSegmentCount} held segment${result.observedHeldSegmentCount === 1 ? " remains" : "s remain"} visible in the refreshable library without becoming usable sources. Originals remain in Drive.`,
                  );
                }
                resolve();
              })
              .catch(reject);
          },
        });
        dialog.setVisible(true);
        // The Picker owns this interaction until selection or cancellation.
        // Release the busy state immediately so canceling never leaves the page stuck.
        setPending(false);
      });
    } catch (browseError) {
      setError(
        browseError instanceof Error
          ? browseError.message
          : "Google Drive could not open.",
      );
    } finally {
      setPending(false);
    }
  }

  async function attachFolder() {
    if (!selectedConnectionId || !folderSelection?.id || !folderPlan) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "attach-google-drive-folder",
            connectionId: selectedConnectionId,
            folderId: folderSelection.id,
            resourceKey: folderSelection.resourceKey ?? null,
            clientRequestId: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        operation?: {
          attachedCount?: number;
          sourceUnitCount?: number;
          sourceSetCount?: number;
          observedHeldSegmentCount?: number;
          plan?: FolderPlan;
        };
      };
      if (!response.ok)
        throw new Error(
          payload.error || "That Drive media package could not be attached.",
        );
      setFolderPlan(payload.operation?.plan ?? folderPlan);
      await onAttached();
      const sourceUnits = payload.operation?.sourceUnitCount ?? 0;
      const files = payload.operation?.attachedCount ?? 0;
      const held =
        payload.operation?.observedHeldSegmentCount ??
        payload.operation?.plan?.heldSegmentCount ??
        folderPlan.heldSegmentCount;
      setMessage(
        `Attached ${sourceUnits} ready camera segment${sourceUnits === 1 ? "" : "s"} from ${files} exact Drive file${files === 1 ? "" : "s"}. ${held} held segment${held === 1 ? " remains" : "s remain"} visible and monitored without becoming usable sources. Originals remain in Drive.`,
      );
    } catch (attachError) {
      setError(
        attachError instanceof Error
          ? attachError.message
          : "That Drive media package could not be attached.",
      );
    } finally {
      setPending(false);
    }
  }

  async function refreshLibrary(library: ExternalMediaLibrary) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "refresh-google-drive-library",
            libraryId: library.id,
            clientRequestId: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        operation?: {
          library?: ExternalMediaLibrary;
        };
      };
      if (!response.ok)
        throw new Error(
          payload.error || "That Drive library could not be refreshed.",
        );
      await onAttached();
      const refreshed = payload.operation?.library;
      setMessage(
        refreshed
          ? `Refreshed ${refreshed.name}: ${refreshed.totalFileCount} files (${formatCountDelta(refreshed.totalFileCount, library.totalFileCount)}), ${refreshed.readySegmentCount} ready (${formatCountDelta(refreshed.readySegmentCount, library.readySegmentCount)}), ${refreshed.heldSegmentCount} held (${formatCountDelta(refreshed.heldSegmentCount, library.heldSegmentCount)}). No source history was deleted.`
          : `Refreshed ${library.name}. No source history was deleted.`,
      );
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "That Drive library could not be refreshed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function prepareLibraryNavigation(library: ExternalMediaLibrary) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare-google-drive-library-navigation",
            libraryId: library.id,
            clientRequestId: crypto.randomUUID(),
            limit: 12,
            retryFailed: true,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        operation?: {
          schema?: string;
          summary?: {
            eligibleSourceCount: number;
            alreadyReadyCount: number;
            selectedCount: number;
            remainingCount: number;
            materializationCount: number;
            proxyCount: number;
            navigationCount: number;
            heldCount: number;
            browseTransferBytes: string;
          };
        };
      };
      if (
        !response.ok ||
        payload.operation?.schema !==
          "quipsly-google-drive-library-navigation-batch-v1" ||
        !payload.operation.summary
      ) {
        throw new Error(
          payload.error || "That Drive library could not be prepared.",
        );
      }
      await onAttached();
      const summary = payload.operation.summary;
      setMessage(
        summary.selectedCount === 0
          ? `${library.name} is browse-ready: all ${summary.eligibleSourceCount} attached camera segments already have their proxy, visual map, and waveform.`
          : `Prepared the next ${summary.selectedCount} segment${summary.selectedCount === 1 ? "" : "s"}: ${summary.materializationCount} LRV transfer${summary.materializationCount === 1 ? "" : "s"} (${formatBytes(summary.browseTransferBytes)}), ${summary.proxyCount} proxy stage${summary.proxyCount === 1 ? "" : "s"}, and ${summary.navigationCount} navigation stage${summary.navigationCount === 1 ? "" : "s"}. ${summary.heldCount} held; ${summary.remainingCount} remain for the next bounded pass. You can leave while the local worker continues.`,
      );
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "That Drive library could not be prepared.",
      );
    } finally {
      setPending(false);
    }
  }

  async function checkLibraryProgress(library: ExternalMediaLibrary) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await onAttached();
      setMessage(
        `Updated ${library.name} browse readiness from the current retained jobs without rescanning Drive.`,
      );
    } catch (progressError) {
      setError(
        progressError instanceof Error
          ? progressError.message
          : "Browse readiness could not be refreshed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function inspectLibraryConform(library: ExternalMediaLibrary) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "plan-google-drive-library-conform",
            libraryId: library.id,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        operation?: LibraryConformPlan;
      };
      if (
        !response.ok ||
        payload.operation?.schema !==
          "quipsly-google-drive-library-conform-plan-v1"
      ) {
        throw new Error(
          payload.error || "Final-quality storage could not be planned.",
        );
      }
      setLibraryConformPlan(payload.operation);
      setMessage(
        `Inspected ${library.name} final-quality storage without downloading originals. Choose one segment in Source Story before any exact INSV transfer can begin.`,
      );
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : "Final-quality storage could not be planned.",
      );
    } finally {
      setPending(false);
    }
  }

  async function disconnectDrive() {
    if (
      !selectedConnectionId ||
      !window.confirm(
        "Disconnect this Google Drive account? Quipsly will revoke the grant, delete its encrypted refresh credential, and hold new proxy or render work for attached Drive sources.",
      )
    )
      return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/media/connections/google-drive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          payload.error || "Google Drive could not be disconnected.",
        );
      await Promise.all([loadConnections(), onAttached()]);
      setMessage(
        "Google Drive disconnected. Existing cards remain, and new exact-source work is held until reconnect.",
      );
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Google Drive could not be disconnected.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label="External media vault"
      className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-teal-900">
            <Cloud size={13} aria-hidden="true" />
            Bring your own media
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#5f684f]">
            Choose files without uploading originals. Quipsly verifies the
            provider identity before it creates a proxy or story range.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadConnections()}
          disabled={loadingConnections}
          aria-label="Refresh Drive connections"
          className="rounded-lg border border-teal-200 bg-white p-2 text-teal-900 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={loadingConnections ? "animate-spin" : ""}
            aria-hidden="true"
          />
        </button>
      </div>
      {loadingConnections ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-xs font-bold text-teal-900"
        >
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Checking Drive connection…
        </p>
      ) : null}
      {!loadingConnections ? (
        <FollowedDriveLibraries
          libraries={libraries ?? []}
          canWrite={canWrite}
          pending={pending}
          onRefresh={(library) => void refreshLibrary(library)}
          onPrepare={(library) => void prepareLibraryNavigation(library)}
          onCheck={(library) => void checkLibraryProgress(library)}
          conformPlan={libraryConformPlan}
          onPlanConform={(library) => void inspectLibraryConform(library)}
          onAdd={(library) => void browseDrive("360-files", library)}
        />
      ) : null}
      {!loadingConnections && verifiedConnections.length ? (
        <div className="mt-3 space-y-2">
          {verifiedConnections.length > 1 ? (
            <label className="block text-[10px] font-black uppercase tracking-wide text-teal-900">
              Drive account
              <select
                value={selectedConnectionId}
                onChange={(event) =>
                  setSelectedConnectionId(event.target.value)
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-teal-200 bg-white px-3 text-sm font-bold normal-case tracking-normal"
              >
                {verifiedConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.accountLabel || "Google Drive"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-xs font-bold text-teal-950">
              {verifiedConnections[0].accountLabel || "Google Drive connected"}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <button
              type="button"
              disabled={
                !canWrite || pending || !oauthConfigured || !pickerConfigured
              }
              onClick={() => void browseDrive("folder")}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-900 px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FolderOpen size={16} aria-hidden="true" />
              )}
              Choose 360 folder
            </button>
            <button
              type="button"
              disabled={
                !canWrite || pending || !oauthConfigured || !pickerConfigured
              }
              onClick={() => void browseDrive("360-files")}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal-300 bg-white px-3 text-sm font-black text-teal-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileVideo2 size={16} aria-hidden="true" />
              Choose 360 files
            </button>
            <button
              type="button"
              disabled={
                !canWrite || pending || !oauthConfigured || !pickerConfigured
              }
              onClick={() => void browseDrive("files")}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white/70 px-3 text-xs font-black text-teal-900 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 xl:col-span-1 2xl:col-span-2"
            >
              <FileVideo2 size={15} aria-hidden="true" />
              Choose other Drive files
            </button>
          </div>
          <p className="text-[10px] font-semibold leading-4 text-[#5f684f]">
            Start with the folder. If Google keeps its descendants private,
            choose the matching <code>VID_…insv</code> and <code>LRV_…lrv</code>{" "}
            files instead; Quipsly groups them into camera segments for you.
          </p>
          {folderPlan ? (
            <section
              aria-label="Insta360 folder inspection"
              className="rounded-xl border border-teal-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-teal-950">
                    {folderPlan.root.name}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-[#5f684f]">
                    {folderPlan.totalFiles} files ·{" "}
                    {formatBytes(folderPlan.totalSizeBytes)} ·{" "}
                    {folderPlan.readySegmentCount} ready ·{" "}
                    {folderPlan.heldSegmentCount} held
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${folderPlan.status === "ready" ? "bg-emerald-100 text-emerald-900" : folderPlan.status === "partial" ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-700"}`}
                >
                  {folderPlan.status}
                </span>
              </div>
              {folderPlan.totalFiles === 0 ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold leading-4 text-amber-950">
                  Google exposed the selected folder but not its children. No
                  broader Drive permission is required: use “Choose 360 files”
                  above and select the INSV/LRV companions explicitly.
                </p>
              ) : null}
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                {folderPlan.batches.flatMap((batch) =>
                  batch.segments.map((segment) => (
                    <div
                      key={`${batch.folder.name}:${segment.key}`}
                      className="rounded-lg border border-[#e4ddcf] bg-[#fffdf8] p-2"
                    >
                      <p className="mb-1 truncate text-[8px] font-black uppercase tracking-wide text-teal-800">
                        {batch.folder.name}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-[#3e2f21]">
                          {segment.displayName}
                        </span>
                        <span className="text-[9px] font-bold text-[#806a4d]">
                          {formatBytes(segment.totalSizeBytes)}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-[9px] font-black ${segment.status === "ready-to-attach" ? "text-emerald-800" : "text-amber-900"}`}
                      >
                        {segment.status.replaceAll("-", " ")}
                      </p>
                      {segment.reasons.length ? (
                        <p className="mt-1 text-[9px] font-semibold leading-4 text-amber-900">
                          {segment.reasons.join(" ")}
                        </p>
                      ) : null}
                    </div>
                  )),
                )}
              </div>
              <button
                type="button"
                disabled={!canWrite || pending || folderPlan.totalFiles === 0}
                onClick={() => void attachFolder()}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-3 text-xs font-black text-white disabled:opacity-50"
              >
                <Cloud size={15} aria-hidden="true" />
                {folderPlan.readySegmentCount > 0
                  ? "Attach ready + follow library"
                  : "Follow library for completion"}
              </button>
              <p className="mt-2 text-[9px] font-semibold leading-4 text-[#5f684f]">
                Complete packages become source-clock sets. Held packages stay
                in the observation ledger and cannot be used until complete.
                Quipsly retains provider identities and relationships without
                copying original camera files during attachment.
              </p>
            </section>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => void disconnectDrive()}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-white px-3 text-xs font-black text-teal-950 disabled:opacity-50"
          >
            <Unplug size={14} aria-hidden="true" />
            Disconnect Drive
          </button>
          {!pickerConfigured ? (
            <p className="text-xs font-semibold text-amber-900">
              The Drive account is connected, but the browser key still needs
              deployment configuration.
            </p>
          ) : null}
          {!oauthConfigured ? (
            <p className="text-xs font-semibold text-amber-900">
              This Drive connection is safe, but Quipsly cannot refresh it until
              provider setup is complete. Existing sources remain unchanged.
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-xs font-semibold text-amber-900">
              Editor access is required to attach a source.
            </p>
          ) : null}
        </div>
      ) : null}
      {!loadingConnections && !verifiedConnections.length && oauthConfigured ? (
        <a
          href={connectHref}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 text-sm font-black text-white"
        >
          Connect Google Drive <ExternalLink size={15} aria-hidden="true" />
        </a>
      ) : null}
      {!loadingConnections &&
      !verifiedConnections.length &&
      !oauthConfigured ? (
        <div
          role="status"
          className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs font-semibold leading-5 text-amber-950"
        >
          <p className="font-black">Google Drive setup is being finished</p>
          <p className="mt-1">
            Quipsly will enable connection here when its private Google client
            is ready. Nothing has been uploaded or changed in Drive.
          </p>
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-emerald-200 bg-white p-2 text-xs font-bold text-emerald-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-white p-2 text-xs font-bold text-rose-900"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
