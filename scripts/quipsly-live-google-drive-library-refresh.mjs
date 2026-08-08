#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { refreshGoogleDriveLibraryForNest } from "../apps/quipsly/src/lib/server/google-drive-source.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadGoogleDriveSecrets() {
  const project = process.env.QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT || "";
  const gcloud = process.env.QUIPSLY_LOCAL_GCLOUD_BIN || "gcloud";
  assert(project, "Set QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT.");
  const secrets = {
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "quipsly-google-drive-oauth-client-id",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET:
      "quipsly-google-drive-oauth-client-secret",
    GOOGLE_DRIVE_OAUTH_STATE_SECRET: "quipsly-google-drive-oauth-state-secret",
    GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY:
      "quipsly-google-drive-oauth-token-encryption-key",
  };
  for (const [environmentName, secretName] of Object.entries(secrets)) {
    if (process.env[environmentName]) continue;
    const value = execFileSync(
      gcloud,
      [
        "secrets",
        "versions",
        "access",
        "latest",
        `--secret=${secretName}`,
        `--project=${project}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    assert(value, `Secret Manager returned no value for ${secretName}.`);
    process.env[environmentName] = value;
  }
}

const databaseUrl =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(parsedDatabase.hostname),
  "Live Drive refresh refuses a non-loopback database.",
);

const projectSlug =
  process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey";
const libraryId = process.env.QUIPSLY_EXTERNAL_MEDIA_LIBRARY_ID || "";
assert(libraryId, "Set QUIPSLY_EXTERNAL_MEDIA_LIBRARY_ID explicitly.");
loadGoogleDriveSecrets();

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 4 }),
});

try {
  const library = await prisma.studioExternalMediaLibrary.findFirst({
    where: {
      id: libraryId,
      provider: "google-drive",
      project: { slug: projectSlug },
    },
    select: {
      id: true,
      name: true,
      projectId: true,
      totalFileCount: true,
      readySegmentCount: true,
      heldSegmentCount: true,
      providerLocatorJson: true,
      connection: {
        select: {
          userId: true,
          user: { select: { primaryEmail: true } },
        },
      },
    },
  });
  assert(library, "The requested local Drive library is unavailable.");
  assert(library.connection, "The requested library has no connected owner.");

  const locatorBefore =
    library.providerLocatorJson &&
    typeof library.providerLocatorJson === "object" &&
    !Array.isArray(library.providerLocatorJson)
      ? library.providerLocatorJson
      : {};
  const result = await refreshGoogleDriveLibraryForNest({
    prisma,
    projectId: library.projectId,
    actorUserId: library.connection.userId,
    actorEmail: library.connection.user.primaryEmail,
    libraryId: library.id,
    clientRequestId: randomUUID(),
    requestUrl: "http://127.0.0.1:3012/nests/local-drive-refresh",
    environment: process.env,
  });
  const stored = await prisma.studioExternalMediaLibrary.findUniqueOrThrow({
    where: { id: library.id },
    select: {
      revision: true,
      status: true,
      totalFileCount: true,
      totalSizeBytes: true,
      readySegmentCount: true,
      heldSegmentCount: true,
      providerLocatorJson: true,
      healthJson: true,
      _count: {
        select: {
          items: { where: { state: "not-observed" } },
        },
      },
    },
  });
  const locatorAfter =
    stored.providerLocatorJson &&
    typeof stored.providerLocatorJson === "object" &&
    !Array.isArray(stored.providerLocatorJson)
      ? stored.providerLocatorJson
      : {};
  const health =
    stored.healthJson &&
    typeof stored.healthJson === "object" &&
    !Array.isArray(stored.healthJson)
      ? stored.healthJson
      : {};

  console.log(
    JSON.stringify(
      {
        schema: "quipsly-live-google-drive-library-refresh-v1",
        project: projectSlug,
        library: library.name,
        before: {
          discoveryMode:
            locatorBefore.mode === "selection-manifest"
              ? "selected-files"
              : "folder-scan",
          totalFileCount: library.totalFileCount,
          readySegmentCount: library.readySegmentCount,
          heldSegmentCount: library.heldSegmentCount,
        },
        after: {
          discoveryMode:
            locatorAfter.mode === "selection-manifest"
              ? "selected-files"
              : "folder-scan",
          revision: stored.revision,
          status: stored.status,
          totalFileCount: stored.totalFileCount,
          totalSizeBytes: stored.totalSizeBytes.toString(),
          readySegmentCount: stored.readySegmentCount,
          heldSegmentCount: stored.heldSegmentCount,
          notObservedCount: stored._count.items,
          discoveryEvidence: health.discoveryEvidence ?? null,
        },
        attachment: {
          attachedCount: result.attachedCount,
          sourceUnitCount: result.sourceUnitCount,
          replayedCount: result.replayedCount,
          sourceSetCount: result.sourceSetCount,
        },
        boundaries: {
          loopbackDatabaseOnly: true,
          providerLocatorsWithheld: true,
          credentialsWithheld: true,
          originalsRemainInDrive: true,
          noAutomaticDeletion: true,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
