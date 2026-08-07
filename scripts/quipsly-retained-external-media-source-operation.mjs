#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { attachVerifiedExternalMediaSource } from "../apps/quipsly/src/lib/server/external-media-source.ts";
import { readSourceStoryWorkspace } from "../apps/quipsly/src/lib/server/source-story.ts";

const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(`Refusing retained external-media dogfood against non-loopback database ${parsedDatabase.hostname}.`);
}

const sourcePath = path.resolve(process.env.QUIPSLY_EXTERNAL_MEDIA_SOURCE || "/Users/wall-e/Downloads/Ted Lasso Be Curious.mp4");
const projectSlug = process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey-manuscript";
const actorEmail = String(process.env.QUIPSLY_EXTERNAL_MEDIA_ACTOR || "render-dogfood@quipsly.test").trim().toLowerCase();

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const [sourceStat, checksumSha256, actor, project] = await Promise.all([
    stat(sourcePath),
    sha256File(sourcePath),
    prisma.user.findFirst({ where: { primaryEmail: actorEmail }, select: { id: true } }),
    prisma.studioProject.findFirst({ where: { slug: projectSlug }, orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, name: true } }),
  ]);
  if (!sourceStat.isFile()) throw new Error(`External source is not a file: ${sourcePath}`);
  if (!actor) throw new Error(`Retained actor not found: ${actorEmail}`);
  if (!project) throw new Error(`Retained Nest not found: ${projectSlug}`);

  // A background launchd worker cannot safely inherit Terminal/Codex access to
  // Downloads. Materialize one checksum-addressed, copy-on-write execution
  // cache under its dedicated root. The original remains the provider truth;
  // the cache is bounded, rebuildable, and independently verified.
  const cacheDirectory = path.join(tmpdir(), "quipsly-media-ingest", "external-source-cache");
  const cachePath = path.join(cacheDirectory, `${checksumSha256}.mp4`);
  await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
  const cached = await stat(cachePath).catch(() => null);
  if (!cached || cached.size !== sourceStat.size || await sha256File(cachePath) !== checksumSha256) {
    await copyFile(sourcePath, cachePath, constants.COPYFILE_FICLONE);
    await chmod(cachePath, 0o400);
  }
  if ((await sha256File(cachePath)) !== checksumSha256) throw new Error("The local executor cache failed checksum verification.");

  const externalFileId = `local-file:${createHash("sha256").update(sourcePath).digest("hex")}`;
  const headRevisionKey = `sha256:${checksumSha256}`;
  const existing = await prisma.studioExternalMediaReference.findUnique({
    where: { projectId_provider_externalFileId: { projectId: project.id, provider: "local-file-vault", externalFileId } },
    select: { revision: true },
  });
  const operation = existing ? "refresh" : "attach";
  const expectedReferenceRevision = existing?.revision ?? null;
  const clientRequestId = deterministicUuid(
    `${project.id}:${externalFileId}:${headRevisionKey}:available:${operation}:${expectedReferenceRevision ?? 0}`,
  );
  const result = await attachVerifiedExternalMediaSource({
    prisma,
    value: {
      projectId: project.id,
      actorUserId: actor.id,
      actorEmail,
      clientRequestId,
      operation,
      expectedReferenceRevision,
      verifiedFile: {
        provider: "local-file-vault",
        connectionKey: `local-vault:${createHash("sha256").update(path.dirname(sourcePath)).digest("hex").slice(0, 20)}`,
        externalFileId,
        fileName: path.basename(sourcePath),
        mimeType: "video/mp4",
        sizeBytes: sourceStat.size,
        headRevisionKey,
        checksumSha256,
        localPath: cachePath,
        providerCreatedAt: sourceStat.birthtime,
        providerModifiedAt: sourceStat.mtime,
        accessState: "available",
        capabilityState: "downloadable",
        canDownload: true,
        canReadRevisions: false,
        canCopy: true,
      },
    },
  });
  const workspace = await readSourceStoryWorkspace(prisma, project.id);
  const projected = workspace.externalSources.find((source) => source.id === result.reference.id);
  if (!projected) throw new Error("The retained external source did not appear in the source-story projection.");
  const serializedProjection = JSON.stringify(projected);
  if (serializedProjection.includes(sourcePath) || serializedProjection.includes(path.dirname(sourcePath))) {
    throw new Error("The client-safe source projection exposed a local provider locator.");
  }
  console.log(JSON.stringify({
    schema: "quipsly-retained-external-media-operation-v1",
    project: project.name,
    referenceId: result.reference.id,
    referenceRevision: result.reference.revision,
    sourceRevisionId: result.sourceRevisionId,
    replayed: result.replayed,
    fileName: projected.fileName,
    sizeBytes: projected.sizeBytes,
    sourceState: projected.latestSourceRevision?.sourceState,
    accessState: projected.accessState,
    capabilityState: projected.capabilityState,
    providerLocatorExposed: false,
    sourceMutated: false,
    executionCache: {
      policy: "checksum-addressed-apfs-clone",
      sizeBytes: sourceStat.size,
      checksumSha256,
      rebuildable: true,
    },
    originalCopiedToQuipslyStorage: false,
    localExecutionCacheCreated: true,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
