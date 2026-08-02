import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";

import {
  Storage,
  type GetFilesOptions,
} from "@google-cloud/storage";

import {
  captureProxyQueuePrefix,
  type CaptureProxyWorkerStorage,
  type ObjectEvidence,
  type StoredJson,
} from "./worker.js";

export class GcsCaptureProxyWorkerStorage
implements CaptureProxyWorkerStorage {
  private readonly bucket;

  constructor(
    bucketName: string,
    storage = new Storage(),
  ) {
    if (!bucketName.trim()) {
      throw new Error("QUIPSLY_MEDIA_BUCKET is required.");
    }
    this.bucket = storage.bucket(bucketName.trim());
  }

  async listQueueObjects(limit: number) {
    return this.listQueueObjectsUnder(captureProxyQueuePrefix(), limit);
  }

  async listQueueObjectsUnder(prefix: string, limit: number) {
    if (!prefix.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
      throw new Error("Media proxy queue listing contract is invalid.");
    }
    const options: GetFilesOptions = {
      prefix,
      autoPaginate: false,
      maxResults: limit,
    };
    const [files] = await this.bucket.getFiles(options);
    const rows = await Promise.all(
      files
        .filter((file) => file.name.endsWith(".json"))
        .map(async (file) => {
          const [metadata] = await file.getMetadata();
          return {
            name: file.name,
            generation: requiredGeneration(metadata.generation),
          };
        }),
    );
    return rows.sort((left, right) => left.name.localeCompare(right.name));
  }

  async loadJson(
    objectName: string,
    generation?: string,
  ): Promise<StoredJson> {
    const file = this.bucket.file(
      objectName,
      generation ? { generation } : undefined,
    );
    const [metadata] = await file.getMetadata();
    const resolvedGeneration = requiredGeneration(metadata.generation);
    const [raw] = await this.bucket
      .file(objectName, { generation: resolvedGeneration })
      .download({ validation: "crc32c" });
    return {
      value: JSON.parse(raw.toString("utf8")) as unknown,
      generation: resolvedGeneration,
    };
  }

  async saveJson(
    objectName: string,
    value: unknown,
    ifGenerationMatch: string,
  ) {
    await this.bucket.file(objectName).save(JSON.stringify(value), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch },
    });
    return this.loadJson(objectName);
  }

  async saveJsonIfAbsent(objectName: string, value: unknown) {
    try {
      await this.bucket.file(objectName).save(JSON.stringify(value), {
        resumable: false,
        validation: "crc32c",
        contentType: "application/json; charset=utf-8",
        metadata: { cacheControl: "private, no-store" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
    }
    return this.loadJson(objectName);
  }

  async objectEvidence(objectName: string, generation: string) {
    try {
      return await this.evidenceFor(
        this.bucket.file(objectName, { generation }),
      );
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return null;
      throw error;
    }
  }

  async materializeObject(
    objectName: string,
    generation: string,
    destinationPath: string,
  ) {
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const source = this.bucket
      .file(objectName, { generation })
      .createReadStream({ validation: "crc32c" });
    source.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      sizeBytes += chunk.byteLength;
    });
    await new Promise<void>((resolve, reject) => {
      const destination = createWriteStream(
        destinationPath,
        { flags: "wx", mode: 0o600 },
      );
      source.once("error", reject);
      destination.once("error", reject);
      destination.once("finish", resolve);
      source.pipe(destination);
    });
    return { sizeBytes, sha256: hash.digest("hex") };
  }

  async uploadProxy(
    sourcePath: string,
    objectName: string,
    contentType: string,
    customMetadata: Record<string, string>,
  ) {
    try {
      await this.bucket.upload(sourcePath, {
        destination: objectName,
        resumable: true,
        validation: "crc32c",
        metadata: {
          contentType,
          cacheControl: "private, no-store",
          metadata: customMetadata,
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
    }
    return this.evidenceFor(this.bucket.file(objectName));
  }

  async deleteObject(
    objectName: string,
    ifGenerationMatch: string,
  ) {
    try {
      await this.bucket.file(objectName).delete({
        ifGenerationMatch,
        ignoreNotFound: true,
      });
    } catch (error) {
      if (Number((error as { code?: unknown }).code) !== 404) throw error;
    }
  }

  async writeDeadLetter(
    objectName: string,
    value: unknown,
    sourceQueueGeneration: string,
  ) {
    try {
      await this.bucket.file(objectName).save(JSON.stringify(value), {
        resumable: false,
        validation: "crc32c",
        contentType: "application/json; charset=utf-8",
        metadata: {
          cacheControl: "private, no-store",
          metadata: { sourceQueueGeneration },
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
    }
  }

  private async evidenceFor(file: any): Promise<ObjectEvidence> {
    const [metadata] = await file.getMetadata();
    return {
      bucketName: this.bucket.name,
      objectName: String(metadata.name ?? file.name),
      generation: requiredGeneration(metadata.generation),
      sizeBytes: Number(metadata.size),
      contentType: String(metadata.contentType ?? ""),
      crc32c: metadata.crc32c ? String(metadata.crc32c) : null,
      customMetadata: Object.fromEntries(
        Object.entries(metadata.metadata ?? {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    };
  }
}

function requiredGeneration(value: string | number | undefined) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("GCS object is missing an immutable generation.");
  }
  return generation;
}

function isPreconditionFailure(error: unknown) {
  const code = Number(
    (error as { code?: unknown; status?: unknown })?.code
    ?? (error as { status?: unknown })?.status,
  );
  return code === 409 || code === 412;
}
