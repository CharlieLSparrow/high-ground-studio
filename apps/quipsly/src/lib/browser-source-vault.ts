"use client";

import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";
import { createSHA256 } from "hash-wasm";

const DATABASE_NAME = "QuipslyBrowserSourceVault";
const DATABASE_VERSION = 2;
const LEDGER_STORE = "capture-ledgers";
const ROOM_PARTICIPANT_INDEX = "callRoomId-participantId";
const OPFS_DIRECTORY = "quipsly-browser-sources-v1";

let databasePromise: Promise<IDBDatabase> | null = null;
let activeDatabase: IDBDatabase | null = null;

function database() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (databasePromise === opening) databasePromise = null;
      reject(error);
    };
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(LEDGER_STORE)
        ? request.transaction!.objectStore(LEDGER_STORE)
        : request.result.createObjectStore(LEDGER_STORE, { keyPath: "captureId" });
      if (!store.indexNames.contains("callRoomId")) {
        store.createIndex("callRoomId", "callRoomId", { unique: false });
      }
      if (!store.indexNames.contains("updatedAt")) {
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!store.indexNames.contains(ROOM_PARTICIPANT_INDEX)) {
        store.createIndex(
          ROOM_PARTICIPANT_INDEX,
          ["callRoomId", "participantId"],
          { unique: false },
        );
      }
    };
    request.onsuccess = () => {
      const opened = request.result;
      if (settled) {
        opened.close();
        return;
      }
      settled = true;
      activeDatabase = opened;
      opened.onversionchange = () => {
        opened.close();
        if (activeDatabase === opened) activeDatabase = null;
        if (databasePromise === opening) databasePromise = null;
      };
      resolve(opened);
    };
    request.onerror = () =>
      fail(
        request.error || new Error("Browser source ledger could not open."),
      );
    request.onblocked = () =>
      fail(
        new Error(
          "Recording storage is waiting on another older Quipsly tab. Close that tab, then try recording again; protected local sources are unchanged.",
        ),
      );
  });
  databasePromise = opening;
  return opening;
}

function transactionRequest<T>(request: IDBRequest<T>, transaction: IDBTransaction) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let requestSucceeded = false;
    let result: T;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.onsuccess = () => {
      requestSucceeded = true;
      result = request.result;
    };
    request.onerror = () =>
      fail(
        request.error ||
          transaction.error ||
          new Error("Browser source ledger request failed."),
      );
    transaction.oncomplete = () => {
      if (!requestSucceeded) {
        fail(
          new Error(
            "Browser source ledger transaction completed without a request result.",
          ),
        );
        return;
      }
      if (settled) return;
      settled = true;
      resolve(result);
    };
    transaction.onerror = () =>
      fail(
        transaction.error ||
          new Error("Browser source ledger transaction failed."),
      );
    transaction.onabort = () =>
      fail(
        transaction.error ||
          new Error("Browser source ledger transaction was interrupted."),
      );
  });
}

async function sourceDirectory(create: boolean) {
  if (!navigator.storage?.getDirectory) throw new Error("Origin-private file storage is unavailable.");
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIRECTORY, { create });
}

export async function browserSourceVaultReadiness() {
  if (!navigator.storage?.getDirectory || !window.indexedDB) {
    return { available: false as const, persistent: false, quotaBytes: null, usageBytes: null };
  }
  try {
    await sourceDirectory(true);
    await database();
    const persistent = await navigator.storage.persist?.().catch(() => false) ?? false;
    const estimate: StorageEstimate = await navigator.storage.estimate?.().catch(() => ({})) ?? {};
    return {
      available: true as const,
      persistent,
      quotaBytes: Number.isFinite(estimate.quota) ? Number(estimate.quota) : null,
      usageBytes: Number.isFinite(estimate.usage) ? Number(estimate.usage) : null,
    };
  } catch {
    return { available: false as const, persistent: false, quotaBytes: null, usageBytes: null };
  }
}

export async function saveBrowserSourceLedger(ledger: BrowserSourceCaptureLedger) {
  const db = await database();
  const transaction = db.transaction(LEDGER_STORE, "readwrite");
  await transactionRequest(transaction.objectStore(LEDGER_STORE).put(ledger), transaction);
  return ledger;
}

export async function listBrowserSourceLedgers(callRoomId?: string) {
  const db = await database();
  const transaction = db.transaction(LEDGER_STORE, "readonly");
  const store = transaction.objectStore(LEDGER_STORE);
  const request = callRoomId
    ? store.index("callRoomId").getAll(IDBKeyRange.only(callRoomId))
    : store.getAll();
  const rows = await transactionRequest(request, transaction) as BrowserSourceCaptureLedger[];
  return rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function browserSourceLedgersOwnedByParticipant(
  ledgers: readonly BrowserSourceCaptureLedger[],
  participantId: string,
) {
  const ownerParticipantId = participantId.trim();
  if (!ownerParticipantId) return [];
  return ledgers.filter(
    (ledger) => ledger.participantId === ownerParticipantId,
  );
}

export async function listBrowserSourceLedgersForParticipant(input: {
  callRoomId: string;
  participantId: string;
}) {
  const callRoomId = input.callRoomId.trim();
  const participantId = input.participantId.trim();
  if (!callRoomId || !participantId) return [];
  const db = await database();
  const transaction = db.transaction(LEDGER_STORE, "readonly");
  const request = transaction.objectStore(LEDGER_STORE)
    .index(ROOM_PARTICIPANT_INDEX)
    .getAll(IDBKeyRange.only([callRoomId, participantId]));
  const rows = await transactionRequest(
    request,
    transaction,
  ) as BrowserSourceCaptureLedger[];
  return browserSourceLedgersOwnedByParticipant(rows, participantId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export type BrowserSourceDurableWriter = {
  readonly mode: "opfs-sync-flush-worker" | "opfs-transaction-per-chunk";
  write: (
    chunk: Blob,
    byteOffset: number,
  ) => Promise<{ committedSizeBytes: number }>;
  close: () => Promise<void>;
};

type WorkerReply = {
  id?: unknown;
  ok?: unknown;
  error?: unknown;
  committedSizeBytes?: unknown;
};

async function createSyncFlushWorkerWriter(
  opfsFileName: string,
): Promise<BrowserSourceDurableWriter> {
  if (typeof Worker !== "function") throw new Error("Worker is unavailable.");
  const worker = new Worker("/workers/quipsly-opfs-source-writer-v1.js");
  let sequence = 0;
  let closed = false;
  const pending = new Map<
    number,
    {
      resolve: (reply: WorkerReply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
    const id = Number(event.data?.id);
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    if (event.data?.ok === true) request.resolve(event.data);
    else
      request.reject(
        new Error(
          typeof event.data?.error === "string"
            ? event.data.error
            : "The durable source writer failed.",
        ),
      );
  });
  worker.addEventListener("error", () => {
    rejectPending(new Error("The durable source writer stopped unexpectedly."));
  });

  const request = (
    action: "init" | "write" | "close",
    payload: Record<string, unknown> = {},
    transfer: Transferable[] = [],
  ) => {
    const id = ++sequence;
    return new Promise<WorkerReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("The durable source writer timed out."));
      }, 60_000);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, action, ...payload }, transfer);
    });
  };

  try {
    await request("init", { opfsFileName });
  } catch (error) {
    worker.terminate();
    rejectPending(
      error instanceof Error ? error : new Error("OPFS worker setup failed."),
    );
    throw error;
  }

  return {
    mode: "opfs-sync-flush-worker",
    async write(chunk, byteOffset) {
      if (closed) throw new Error("The durable source writer is closed.");
      const bytes = await chunk.arrayBuffer();
      const reply = await request(
        "write",
        { byteOffset, bytes },
        [bytes],
      );
      const committedSizeBytes = Number(reply.committedSizeBytes);
      if (!Number.isSafeInteger(committedSizeBytes) || committedSizeBytes < 0) {
        throw new Error("The durable source writer returned an invalid size.");
      }
      return { committedSizeBytes };
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await request("close");
      } finally {
        worker.terminate();
        rejectPending(new Error("The durable source writer is closed."));
      }
    },
  };
}

async function createTransactionalChunkWriter(
  opfsFileName: string,
): Promise<BrowserSourceDurableWriter> {
  const directory = await sourceDirectory(true);
  const handle = await directory.getFileHandle(opfsFileName, { create: true });
  const initial = await handle.createWritable({ keepExistingData: false });
  await initial.close();
  let closed = false;
  return {
    mode: "opfs-transaction-per-chunk",
    async write(chunk, byteOffset) {
      if (closed) throw new Error("The durable source writer is closed.");
      const writable = await handle.createWritable({ keepExistingData: true });
      try {
        await writable.seek(byteOffset);
        await writable.write(chunk);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      const committedSizeBytes = (await handle.getFile()).size;
      const expectedSizeBytes = byteOffset + chunk.size;
      if (committedSizeBytes !== expectedSizeBytes) {
        throw new Error(
          `The durable source committed ${committedSizeBytes} bytes; expected ${expectedSizeBytes}.`,
        );
      }
      return { committedSizeBytes };
    },
    async close() {
      closed = true;
    },
  };
}

export async function createBrowserSourceDurableWriter(
  opfsFileName: string,
): Promise<BrowserSourceDurableWriter> {
  try {
    return await createSyncFlushWorkerWriter(opfsFileName);
  } catch {
    return createTransactionalChunkWriter(opfsFileName);
  }
}

export async function loadBrowserSourceFile(opfsFileName: string) {
  const directory = await sourceDirectory(false);
  const handle = await directory.getFileHandle(opfsFileName);
  return handle.getFile();
}

export async function hashBrowserSourceFile(file: File) {
  const hasher = await createSHA256();
  hasher.init();
  const reader = file.stream().getReader();
  let sizeBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    sizeBytes += value.byteLength;
    hasher.update(value);
  }
  return { sha256: hasher.digest("hex"), sizeBytes };
}

export async function downloadBrowserSource(ledger: BrowserSourceCaptureLedger) {
  const file = await loadBrowserSourceFile(ledger.opfsFileName);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = ledger.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
