import { createHash } from "node:crypto";

import {
  Storage,
  type GetFilesOptions,
} from "@google-cloud/storage";

import {
  captureTranscriptQueuePrefix,
  type CaptureTranscriptWorkerStorage,
  type ObjectEvidence,
  type StoredJson,
  type StoredProviderResponse,
} from "./worker.js";

export class GcsCaptureTranscriptWorkerStorage
implements CaptureTranscriptWorkerStorage {
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
    const options: GetFilesOptions = {
      prefix: captureTranscriptQueuePrefix(),
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
      const [metadata] = await this.bucket
        .file(objectName, { generation })
        .getMetadata();
      return {
        bucketName: this.bucket.name,
        objectName: String(metadata.name ?? objectName),
        generation: requiredGeneration(metadata.generation),
        sizeBytes: Number(metadata.size),
        contentType: String(metadata.contentType ?? ""),
        customMetadata: Object.fromEntries(
          Object.entries(metadata.metadata ?? {}).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      };
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return null;
      throw error;
    }
  }

  async signedReadUrl(
    objectName: string,
    generation: string,
    expiresAt: Date,
  ) {
    const [url] = await this.bucket
      .file(objectName, { generation })
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
        queryParams: { generation },
      });
    const parsed = new URL(url);
    if (parsed.searchParams.get("generation") !== generation) {
      throw new Error("Signed transcript source URL is not generation-bound.");
    }
    return url;
  }

  async saveProviderResponseIfAbsent(
    objectName: string,
    value: unknown,
    customMetadata: Record<string, string>,
  ): Promise<StoredProviderResponse> {
    const bytes = Buffer.from(JSON.stringify(value));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await this.bucket.file(objectName).save(bytes, {
        resumable: false,
        validation: "crc32c",
        contentType: "application/json",
        metadata: {
          cacheControl: "private, no-store",
          metadata: {
            ...customMetadata,
            quipslyProviderResponseSha256: sha256,
          },
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
    }
    const file = this.bucket.file(objectName);
    const [metadata] = await file.getMetadata();
    const generation = requiredGeneration(metadata.generation);
    const [stored] = await this.bucket
      .file(objectName, { generation })
      .download({ validation: "crc32c" });
    return {
      value: JSON.parse(stored.toString("utf8")) as unknown,
      generation,
      sizeBytes: stored.byteLength,
      sha256: createHash("sha256").update(stored).digest("hex"),
    };
  }

  async loadProviderResponse(
    objectName: string,
  ): Promise<StoredProviderResponse | null> {
    try {
      const file = this.bucket.file(objectName);
      const [metadata] = await file.getMetadata();
      const generation = requiredGeneration(metadata.generation);
      const [stored] = await this.bucket
        .file(objectName, { generation })
        .download({ validation: "crc32c" });
      return {
        value: JSON.parse(stored.toString("utf8")) as unknown,
        generation,
        sizeBytes: stored.byteLength,
        sha256: createHash("sha256").update(stored).digest("hex"),
      };
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return null;
      throw error;
    }
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
      if (!isPreconditionFailure(error)) throw error;
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

function isPreconditionFailure(error: unknown) {
  const code = Number(
    (error as { code?: unknown; status?: unknown })?.code
    ?? (error as { status?: unknown })?.status,
  );
  return code === 409 || code === 412;
}
