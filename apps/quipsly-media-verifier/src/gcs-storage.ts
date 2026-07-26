import { createHash } from "node:crypto";

import { Storage, type GetFilesOptions } from "@google-cloud/storage";
import {
  LONG_SOURCE_QUEUE_PREFIX,
} from "@high-ground/quipsly-capture-verification";

import type {
  GenerationMatchedJson,
  HashedSourceObject,
  LongSourceWorkerStorage,
  QueueObject,
  SourceObjectEvidence,
} from "./worker.js";

export class GcsLongSourceWorkerStorage implements LongSourceWorkerStorage {
  private readonly bucket;

  constructor(
    bucketName: string,
    storage = new Storage(),
  ) {
    if (!bucketName.trim()) throw new Error("QUIPSLY_MEDIA_BUCKET is required.");
    this.bucket = storage.bucket(bucketName.trim());
  }

  async listQueueObjects(limit: number): Promise<QueueObject[]> {
    const options: GetFilesOptions = {
      prefix: `${LONG_SOURCE_QUEUE_PREFIX}/`,
      autoPaginate: false,
      maxResults: limit,
    };
    const [files] = await this.bucket.getFiles(options);
    const results = await Promise.all(
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
    return results.sort((left, right) => left.name.localeCompare(right.name));
  }

  async loadJson(
    objectName: string,
    generation?: string,
  ): Promise<GenerationMatchedJson> {
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
  ): Promise<GenerationMatchedJson> {
    await this.bucket.file(objectName).save(JSON.stringify(value), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch },
    });
    return this.loadJson(objectName);
  }

  async sourceObjectEvidence(
    objectName: string,
    generation: string,
  ): Promise<SourceObjectEvidence | null> {
    const file = this.bucket.file(objectName, { generation });
    try {
      const [metadata] = await file.getMetadata();
      const customMetadata = Object.fromEntries(
        Object.entries(metadata.metadata ?? {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      );
      return {
        bucketName: this.bucket.name,
        objectName,
        generation: requiredGeneration(metadata.generation),
        sizeBytes: Number(metadata.size),
        contentType: String(metadata.contentType ?? ""),
        crc32c: metadata.crc32c ? String(metadata.crc32c) : null,
        md5Hash: metadata.md5Hash ? String(metadata.md5Hash) : null,
        customMetadata,
      };
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return null;
      throw error;
    }
  }

  async hashSourceObject(
    objectName: string,
    generation: string,
  ): Promise<HashedSourceObject> {
    const hash = createHash("sha256");
    let streamedBytes = 0;
    const stream = this.bucket
      .file(objectName, { generation })
      .createReadStream({ validation: "crc32c" });
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      streamedBytes += buffer.byteLength;
    }
    return { sha256: hash.digest("hex"), streamedBytes };
  }

  async deleteObject(objectName: string, ifGenerationMatch: string) {
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
      const code = Number((error as { code?: unknown }).code);
      if (code !== 409 && code !== 412) throw error;
    }
  }
}

function requiredGeneration(value: string | number | undefined) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("GCS object is missing an immutable generation.");
  }
  return generation;
}
