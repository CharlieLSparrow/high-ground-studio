/* Quipsly Capture durable OPFS writer.
 * A dedicated worker is required because FileSystemSyncAccessHandle is not
 * exposed on the window thread. Every acknowledged chunk is flushed before
 * the recorder ledger advances, so an abrupt page loss cannot acknowledge
 * bytes that still exist only in an uncommitted writable stream.
 */

let accessHandle = null;

function reply(id, packet) {
  self.postMessage({ id, ...packet });
}

self.addEventListener("message", async (event) => {
  const { id, action } = event.data || {};
  try {
    if (action === "init") {
      if (!self.navigator?.storage?.getDirectory) {
        throw new Error("Origin-private file storage is unavailable in this worker.");
      }
      const root = await self.navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(
        "quipsly-browser-sources-v1",
        { create: true },
      );
      const file = await directory.getFileHandle(event.data.opfsFileName, {
        create: true,
      });
      if (typeof file.createSyncAccessHandle !== "function") {
        throw new Error("Synchronous OPFS access is unavailable in this browser.");
      }
      accessHandle = await file.createSyncAccessHandle();
      accessHandle.truncate(0);
      accessHandle.flush();
      reply(id, { ok: true, committedSizeBytes: 0 });
      return;
    }

    if (!accessHandle) throw new Error("The durable source file is not open.");

    if (action === "write") {
      const byteOffset = Number(event.data.byteOffset);
      const bytes = new Uint8Array(event.data.bytes);
      if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) {
        throw new Error("The source chunk offset is invalid.");
      }
      const currentSize = accessHandle.getSize();
      if (currentSize !== byteOffset) {
        throw new Error(
          `The durable source contains ${currentSize} bytes; expected ${byteOffset} before append.`,
        );
      }
      const written = accessHandle.write(bytes, { at: byteOffset });
      if (written !== bytes.byteLength) {
        throw new Error(
          `The durable source wrote ${written} of ${bytes.byteLength} bytes.`,
        );
      }
      accessHandle.flush();
      reply(id, { ok: true, committedSizeBytes: accessHandle.getSize() });
      return;
    }

    if (action === "close") {
      accessHandle.flush();
      const committedSizeBytes = accessHandle.getSize();
      accessHandle.close();
      accessHandle = null;
      reply(id, { ok: true, committedSizeBytes });
      self.close();
      return;
    }

    throw new Error("The durable source writer received an unknown action.");
  } catch (error) {
    reply(id, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The durable source writer failed.",
    });
  }
});
