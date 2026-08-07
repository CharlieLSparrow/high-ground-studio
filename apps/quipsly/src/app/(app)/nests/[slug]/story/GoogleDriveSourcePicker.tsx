"use client";

import {
  Cloud,
  ExternalLink,
  FileVideo2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type DriveConnection = {
  id: string;
  accountLabel: string | null;
  status: string;
  revision: number;
  verifiedAt: string | null;
};

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
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
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
  builder.enableFeature(picker.Feature.SUPPORT_DRIVES);
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

export function GoogleDriveSourcePicker({
  projectSlug,
  canWrite,
  onAttached,
}: {
  projectSlug: string;
  canWrite: boolean;
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
          clientRequestId: crypto.randomUUID(),
        }),
      },
    );
    const payload = (await response.json()) as {
      error?: string;
      operation?: {
        attachedCount?: number;
        sourceUnitCount?: number;
        plan?: FolderPlan;
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
      plan: payload.operation?.plan ?? null,
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

  async function browseDrive(mode: "files" | "folder" | "360-files") {
    if (!selectedConnectionId) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const tokenResponse = await fetch(
        "/api/media/connections/google-drive/picker-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: selectedConnectionId }),
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
                  ? attach360Documents(token.connectionId!, documents)
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
                    `Grouped ${result.attachedCount} exact Drive file${result.attachedCount === 1 ? "" : "s"} into ${result.sourceUnitCount} camera segment${result.sourceUnitCount === 1 ? "" : "s"}. Originals remain in Drive.`,
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
      setMessage(
        `Attached ${sourceUnits} camera segment${sourceUnits === 1 ? "" : "s"} from ${files} exact Drive file${files === 1 ? "" : "s"}. Originals remain in Drive.`,
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
                Attach package manifest
              </button>
              <p className="mt-2 text-[9px] font-semibold leading-4 text-[#5f684f]">
                Quipsly retains provider identities and package relationships.
                It does not copy original camera files during attachment.
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
              This Drive connection is safe, but Quipsly cannot refresh it
              until provider setup is complete. Existing sources remain
              unchanged.
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-xs font-semibold text-amber-900">
              Editor access is required to attach a source.
            </p>
          ) : null}
        </div>
      ) : null}
      {!loadingConnections &&
      !verifiedConnections.length &&
      oauthConfigured ? (
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
