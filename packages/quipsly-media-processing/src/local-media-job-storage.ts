import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, link, lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type StoredJson = { value: unknown; generation: string };
type LocalReceipt = { generation: string; sizeBytes: number; contentType: string; customMetadata: Record<string, string>; crc32c?: string; createdAt: string };
const generation = () => BigInt(`0x${randomBytes(12).toString("hex")}`).toString();
const failure = (code: number, message: string) => Object.assign(new Error(message), { code });
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0x82f63b78 : 0);
  return value >>> 0;
});

async function fingerprints(file: string) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(file)) {
    const bytes = Buffer.from(chunk);
    hash.update(bytes);
    sizeBytes += bytes.length;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return { sizeBytes, sha256: hash.digest("hex"), crc32c: checksum.toString("base64") };
}

/** Filesystem transport for the same manifests, leases and workers used in GCS.
 * Control JSON uses atomic generation-CAS; media uses the Capture vault's existing
 * immutable object/receipt layout. This adapter is exclusively for local workers.
 */
export class LocalMediaJobStorage {
  readonly bucketName = "quipsly-local-development-vault";
  readonly root: string;

  constructor(root: string) {
    if (process.env.NODE_ENV === "production") throw new Error("Local media storage is disabled in production.");
    this.root = path.resolve(root);
    if (this.root === path.parse(this.root).root) throw new Error("A dedicated local media directory is required.");
  }

  private async file(area: "jobs" | "objects", name: string) {
    if (!name || name.split("/").some((part) => !part || part === "." || part === "..") || /[\\\0]/.test(name) || path.isAbsolute(name)) {
      throw new Error("Invalid local media object name.");
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await realpath(this.root);
    const target = path.join(root, area, name);
    // Reject symlinks at every existing segment, including sidecar/control files.
    let cursor = root;
    for (const segment of [area, ...name.split("/")]) {
      cursor = path.join(cursor, segment);
      try {
        if ((await lstat(cursor)).isSymbolicLink()) throw new Error("Local media paths cannot contain symlinks.");
      } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    }
    return target;
  }

  private async locked<T>(file: string, action: () => Promise<T>): Promise<T> {
    await mkdir(path.dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    const owner = `${file}.${randomUUID()}.owner`;
    const handle = await open(owner, "wx", 0o600);
    await handle.writeFile(String(process.pid));
    await handle.close();
    let acquired = false;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await link(owner, lock); acquired = true; break; }
        catch (error: any) {
          if (error?.code !== "EEXIST") throw error;
          try {
            const pid = Number(await readFile(lock, "utf8"));
            if (Number.isSafeInteger(pid) && pid > 0) {
              try { process.kill(pid, 0); }
              catch (processError: any) { if (processError?.code === "ESRCH") await unlink(lock).catch(() => undefined); }
            }
          } catch (readError: any) { if (readError?.code !== "ENOENT") throw readError; }
          await delay(25);
        }
      }
      if (!acquired) throw new Error("Local media object is busy; retry the job.");
      return await action();
    } finally {
      if (acquired) await unlink(lock);
      await unlink(owner).catch(() => undefined);
    }
  }

  private async atomicJson(file: string, value: unknown) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    try { await rename(temporary, file); }
    finally { await unlink(temporary).catch(() => undefined); }
  }

  async loadJson(name: string, expected?: string): Promise<StoredJson> {
    try {
      const stored = JSON.parse(await readFile(await this.file("jobs", name), "utf8")) as StoredJson;
      if (!/^[1-9][0-9]*$/.test(stored.generation)) throw new Error("Invalid local object generation.");
      if (expected && stored.generation !== expected) throw failure(412, "Local object generation changed.");
      return stored;
    } catch (error: any) { if (error?.code === "ENOENT") throw failure(404, "Local control object is missing."); throw error; }
  }

  async saveJson(name: string, value: unknown, expected: string) {
    const file = await this.file("jobs", name);
    return this.locked(file, async () => {
      let existing: StoredJson | null = null;
      try { existing = await this.loadJson(name); } catch (error: any) { if (error?.code !== 404) throw error; }
      if ((existing?.generation ?? "0") !== expected) throw failure(412, "Local object generation changed.");
      const stored = { value, generation: generation() };
      await this.atomicJson(file, stored);
      return stored;
    });
  }

  async saveJsonIfAbsent(name: string, value: unknown) {
    try { return await this.saveJson(name, value, "0"); }
    catch (error: any) { if (error?.code !== 412) throw error; return this.loadJson(name); }
  }

  async listQueueObjects(limit: number) { return this.listQueueObjectsUnder("media-vault/control/capture-proxy/queue/", limit); }
  async listQueueObjectsUnder(prefix: string, limit: number) {
    if (!prefix.endsWith("/") || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Invalid local queue listing.");
    const directory = await this.file("jobs", prefix.slice(0, -1));
    let entries: string[];
    try { entries = await readdir(directory); } catch (error: any) { if (error?.code === "ENOENT") return []; throw error; }
    const rows: { name: string; generation: string }[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
      try { const stored = await this.loadJson(`${prefix}${entry}`); rows.push({ name: `${prefix}${entry}`, generation: stored.generation }); }
      catch (error: any) { if (error?.code !== 404) throw error; }
      if (rows.length === limit) break;
    }
    return rows;
  }

  async deleteObject(name: string, expected: string) {
    const file = await this.file("jobs", name);
    await this.locked(file, async () => { await this.loadJson(name, expected); await unlink(file); });
  }
  async writeDeadLetter(name: string, value: unknown, _queueGeneration: string) { await this.saveJsonIfAbsent(name, value); }

  async objectEvidence(name: string, expected: string) {
    try {
      const file = await this.file("objects", name);
      const receipt = JSON.parse(await readFile(await this.file("objects", `${name}.quipsly.json`), "utf8")) as LocalReceipt;
      if (receipt.generation !== expected) return null;
      if ((await stat(file)).size !== receipt.sizeBytes) throw new Error("Local media size differs from its receipt.");
      if (receipt.crc32c) {
        const actual = await fingerprints(file);
        if (actual.crc32c !== receipt.crc32c || (receipt.customMetadata.quipslyOutputSha256 && actual.sha256 !== receipt.customMetadata.quipslyOutputSha256)) throw new Error("Local derivative bytes differ from their verified receipt.");
      }
      return { bucketName: this.bucketName, objectName: name, generation: receipt.generation, sizeBytes: receipt.sizeBytes, contentType: receipt.contentType, crc32c: receipt.crc32c ?? null, customMetadata: receipt.customMetadata };
    } catch (error: any) { if (error?.code === "ENOENT") return null; throw error; }
  }

  async materializeObject(name: string, expected: string, destination: string) {
    if (!await this.objectEvidence(name, expected)) throw failure(404, "Local source generation is missing.");
    await copyFile(await this.file("objects", name), destination);
    return fingerprints(destination);
  }

  async uploadProxy(source: string, name: string, contentType: string, customMetadata: Record<string, string>) {
    if (!name.startsWith("media-vault/derived/")) throw new Error("Worker outputs must be derived media.");
    const file = await this.file("objects", name);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await copyFile(source, temporary);
    await chmod(temporary, 0o600);
    const evidence = await fingerprints(temporary);
    try {
      return await this.locked(file, async () => {
        const receiptFile = await this.file("objects", `${name}.quipsly.json`);
        let receipt: LocalReceipt | null = null;
        try { receipt = JSON.parse(await readFile(receiptFile, "utf8")); } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
        if (receipt) {
          const existing = await fingerprints(file);
          if (existing.sha256 !== evidence.sha256 || receipt.contentType !== contentType || Object.entries(customMetadata).some(([key, value]) => receipt!.customMetadata[key] !== value)) throw new Error("Immutable local derivative already has different bytes or lineage.");
        } else {
          await rename(temporary, file);
          receipt = { generation: generation(), sizeBytes: evidence.sizeBytes, crc32c: evidence.crc32c, contentType, customMetadata, createdAt: new Date().toISOString() };
          await this.atomicJson(receiptFile, receipt);
        }
        const result = await this.objectEvidence(name, receipt.generation);
        if (!result) throw new Error("Local derivative registration failed.");
        return result;
      });
    } finally { await unlink(temporary).catch(() => undefined); }
  }
}
