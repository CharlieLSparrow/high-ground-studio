#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { ReviewedSpatialStitchMasterVerifier } from "../apps/quipsly-media-processor/src/reviewed-spatial-stitch-master.ts";
import { registerReviewedSpatialStitchMaster } from "../apps/quipsly/src/lib/server/spatial-stitch-master.ts";
import { resolveExactSpatialSourceMember } from "../apps/quipsly/src/lib/spatial-exact-source.ts";

const executeFile = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const databaseUrl = localDatabase(
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
const sourceSetId = required(args, "source-set");
const reviewedExportPath = await realpath(required(args, "output"));
const reviewerEmail = required(args, "reviewer").trim().toLowerCase();
if (!boolean(args["visual-reviewed"], false))
  throw new Error(
    "Refusing registration until --visual-reviewed confirms the complete exported master was watched and inspected.",
  );

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
try {
  const [sourceSet, reviewer] = await Promise.all([
    prisma.studioMediaSourceSet.findUnique({
      where: { id: sourceSetId },
      select: {
        id: true,
        projectId: true,
        identitySha256: true,
        completeness: true,
        sourceClockRevision: {
          select: { id: true, durationSeconds: true, framesPerSecond: true },
        },
        members: {
          where: { requiredForRender: true },
          orderBy: [{ role: "asc" }, { ordinal: "asc" }],
          select: {
            role: true,
            sourceRevision: {
              select: {
                id: true,
                contentSha256: true,
                sizeBytes: true,
                sourceState: true,
                externalReference: {
                  select: {
                    provider: true,
                    fileName: true,
                    providerLocatorJson: true,
                  },
                },
                replicas: {
                  where: { storageProvider: "local-cache", status: "ready" },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    locator: true,
                    generation: true,
                    contentSha256: true,
                    sizeBytes: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { primaryEmail: { equals: reviewerEmail, mode: "insensitive" } },
          {
            aliases: {
              some: { email: { equals: reviewerEmail, mode: "insensitive" } },
            },
          },
        ],
      },
      select: { id: true, primaryEmail: true },
    }),
  ]);
  if (!sourceSet || sourceSet.completeness !== "complete")
    throw new Error(
      "The requested complete spatial source set does not exist.",
    );
  if (!reviewer)
    throw new Error(
      `No active canonical Quipsly user resolves reviewer ${reviewerEmail}.`,
    );
  if (
    !sourceSet.sourceClockRevision.durationSeconds ||
    !sourceSet.sourceClockRevision.framesPerSecond
  )
    throw new Error(
      "The spatial source clock is missing duration or frame-rate evidence.",
    );

  const exactMembers = sourceSet.members.map(({ role, sourceRevision }) => {
    const member = resolveExactSpatialSourceMember({ role, sourceRevision });
    return {
      sourceRevisionId: member.sourceRevisionId,
      role: member.role,
      fileName: member.fileName,
      locator: member.locator,
      generation: member.generation,
      sha256: member.sha256,
      sizeBytes: member.sizeBytes,
    };
  });
  if (!exactMembers.length)
    throw new Error("The spatial source set has no exact render members.");

  const reviewedExport = await inspect(reviewedExportPath);
  const vaultRoot = path.resolve(
    process.env.QUIPSLY_SPATIAL_MASTER_VAULT ||
      path.join(
        os.homedir(),
        "Movies",
        "Quipsly Media Vault",
        "Spatial Stitch Masters",
      ),
  );
  await mkdir(vaultRoot, { recursive: true, mode: 0o700 });
  const vaultPath = path.join(
    vaultRoot,
    `${sourceSet.identitySha256}-${reviewedExport.sha256}.mp4`,
  );
  const existing = await stat(vaultPath).catch(() => null);
  if (
    !existing ||
    existing.size !== reviewedExport.sizeBytes ||
    (await sha256File(vaultPath)) !== reviewedExport.sha256
  ) {
    const staged = `${vaultPath}.${process.pid}.staged`;
    try {
      await copyFile(reviewedExportPath, staged, constants.COPYFILE_FICLONE);
      const stagedEvidence = await inspect(staged);
      if (
        stagedEvidence.sha256 !== reviewedExport.sha256 ||
        stagedEvidence.sizeBytes !== reviewedExport.sizeBytes
      )
        throw new Error(
          "The local media-vault copy changed during registration.",
        );
      await chmod(staged, 0o400);
      await rename(staged, vaultPath);
    } finally {
      await rm(staged, { force: true }).catch(() => undefined);
    }
  }
  await chmod(vaultPath, 0o400);

  const applicationVersion =
    typeof args["app-version"] === "string"
      ? args["app-version"]
      : await detectInsta360StudioVersion();
  const reviewedAt =
    typeof args["reviewed-at"] === "string"
      ? new Date(args["reviewed-at"]).toISOString()
      : (await stat(reviewedExportPath)).mtime.toISOString();
  const stableIdentity = `${sourceSet.id}:${reviewedExport.sha256}:${reviewer.id}`;
  const receipt = await new ReviewedSpatialStitchMasterVerifier().verifyAndSeal(
    {
      receiptId: `spatialstitchreceipt_${digest(stableIdentity).slice(0, 40)}`,
      clientRequestId: `spatialstitchrequest_${digest(stableIdentity).slice(0, 40)}`,
      projectId: sourceSet.projectId,
      sourceSetId: sourceSet.id,
      sourceSetIdentitySha256: sourceSet.identitySha256,
      sourceClockRevisionId: sourceSet.sourceClockRevision.id,
      sourceDurationSeconds: sourceSet.sourceClockRevision.durationSeconds,
      sourceFramesPerSecond: sourceSet.sourceClockRevision.framesPerSecond,
      exactMembers,
      outputPath: vaultPath,
      review: {
        reviewedAt,
        reviewedByUserId: reviewer.id,
        reviewedByEmail: reviewerEmail,
        application: "Insta360 Studio",
        applicationVersion,
        flowStateEnabled: boolean(args.flowstate, true),
        horizonLockEnabled: boolean(args["horizon-lock"], true),
        stitchMode: stitchMode(args["stitch-mode"]),
        visualPlaybackReviewed: true,
      },
    },
  );
  const registration = await registerReviewedSpatialStitchMaster({
    prisma,
    receipt,
    authorizedRoot: vaultRoot,
  });
  console.log(
    JSON.stringify(
      {
        schema: "quipsly-reviewed-spatial-stitch-master-registration-v1",
        sourceSetId: sourceSet.id,
        sourceSetIdentitySha256: sourceSet.identitySha256,
        exactMemberCount: exactMembers.length,
        exactMembers: exactMembers.map(
          ({ locator: _locator, ...member }) => member,
        ),
        output: { ...registration.derivative, locatorExposed: false },
        receipt: registration.receipt,
        replayed: registration.replayed,
        boundaries: receipt.boundaries,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

function localDatabase(value) {
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname))
    throw new Error(
      `Refusing reviewed-master registration against non-loopback database ${parsed.hostname}.`,
    );
  return value;
}
function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token?.startsWith("--"))
      throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
function required(values, key) {
  const value = values[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`--${key} is required.`);
  return value.trim();
}
function boolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === "false") return false;
  throw new Error("Boolean flags accept true or false.");
}
function stitchMode(value) {
  const normalized = value === undefined ? "ai-flow" : String(value);
  if (!["ai-flow", "optical-flow", "dynamic", "template"].includes(normalized))
    throw new Error(
      "--stitch-mode must be ai-flow, optical-flow, dynamic, or template.",
    );
  return normalized;
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function inspect(filePath) {
  const file = await stat(filePath);
  if (
    !file.isFile() ||
    file.size <= 0 ||
    path.extname(filePath).toLowerCase() !== ".mp4"
  )
    throw new Error("The reviewed export must be a non-empty MP4 file.");
  return { sizeBytes: file.size, sha256: await sha256File(filePath) };
}
async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
async function detectInsta360StudioVersion() {
  const app = "/Applications/Insta360 Studio.app/Contents/Info.plist";
  const { stdout } = await executeFile(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleShortVersionString", app],
    { encoding: "utf8" },
  );
  const version = stdout.trim();
  if (!version)
    throw new Error(
      "Insta360 Studio version could not be detected; pass --app-version explicitly.",
    );
  return version;
}
