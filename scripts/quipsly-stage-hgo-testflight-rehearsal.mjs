#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  authenticatedHeaders,
  createPrisma,
  episodeRoomEndpoint,
  firebaseIdToken,
  hostUser,
  nestSessionCookie,
  readEpisodeDesk,
  verifyPlayback,
} from "./quipsly-verify-hgo-rehearsal-media.mjs";

const execFileAsync = promisify(execFile);
const REFERENCE_CLIP_ROLE = "reference-clip";
const RETIRED_PROOF_ROLE = "rehearsal-proof";
const COLLABORATION_PROXY_POLL_INTERVAL_MS = 1_250;
const COLLABORATION_PROXY_MAX_POLLS = 360;
const DEFAULTS = Object.freeze({
  baseUrl: "https://nest.quipsly.com",
  hostEmail: "charlie@highgroundodyssey.com",
  projectSlug: "high-ground-odyssey-rehearsal",
  episodeSlug: "testflight-rehearsal",
});
const SYNTHETIC_REHEARSAL_CHECKLIST = [
  "## Rehearsal checklist",
  "",
  "- Both people join the Quipsly audio room.",
  "- Each person grants their own recording consent.",
  "- Record local audio and iPhone video.",
  "- Pause/resume and switch between front and back cameras.",
  "- End capture, verify upload, then listen to the assembled timeline.",
].join("\n");

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function fail(message) {
  throw new Error(message);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const options = {
    baseUrl: process.env.QUIPSLY_REHEARSAL_BASE_URL || DEFAULTS.baseUrl,
    hostEmail:
      process.env.QUIPSLY_REHEARSAL_HOST_EMAIL || DEFAULTS.hostEmail,
    projectSlug:
      process.env.QUIPSLY_REHEARSAL_PROJECT_SLUG || DEFAULTS.projectSlug,
    episodeSlug:
      process.env.QUIPSLY_REHEARSAL_EPISODE_SLUG || DEFAULTS.episodeSlug,
    manuscriptPath: "",
    clipPaths: [],
    outputPath: "",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--apply") {
      options.apply = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--host-email") options.hostEmail = value;
    else if (flag === "--project-slug") options.projectSlug = value;
    else if (flag === "--episode-slug") options.episodeSlug = value;
    else if (flag === "--manuscript") options.manuscriptPath = value;
    else if (flag === "--clip") options.clipPaths.push(value);
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  options.baseUrl = clean(options.baseUrl).replace(/\/+$/, "");
  options.hostEmail = normalizeEmail(options.hostEmail);
  options.projectSlug = clean(options.projectSlug);
  options.episodeSlug = clean(options.episodeSlug);
  options.manuscriptPath = clean(options.manuscriptPath);
  options.clipPaths = options.clipPaths.map(clean).filter(Boolean);
  options.outputPath = clean(options.outputPath);

  if (!options.baseUrl.startsWith("https://")) {
    fail("baseUrl must be HTTPS.");
  }
  for (const [name, value] of Object.entries({
    hostEmail: options.hostEmail,
    projectSlug: options.projectSlug,
    episodeSlug: options.episodeSlug,
  })) {
    if (!value) fail(`${name} is required.`);
  }
  if (options.apply && !options.manuscriptPath) {
    fail("--manuscript is required with --apply.");
  }
  if (options.apply && options.clipPaths.length === 0) {
    fail("At least one --clip is required with --apply.");
  }
  return options;
}

function usage() {
  return `Usage:
  DATABASE_URL=<secret> QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT=<port> \\
    node scripts/quipsly-stage-hgo-testflight-rehearsal.mjs \\
      --manuscript <path> --clip <lead.mp4> [--clip <next.mp4> ...] \\
      [--apply] [options]

The first --clip is the selected lead clip. Without --apply this performs an
authenticated, read-only production plan. Apply mode imports the manuscript
only when the episode is empty, privately uploads and byte-verifies each clip,
and prepares the Watch list without starting playback, joining a provider,
starting a recording, or changing participant consent.

Options:
  --base-url <url>
  --host-email <email>
  --project-slug <slug>
  --episode-slug <slug>
  --manuscript <path>
  --clip <path>         Repeat in desired Watch order; first is selected.
  --output <path>       Redacted mode-0600 receipt.
  --apply
`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function manuscriptBlocks(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 400);
}

function blocksDigest(blocks) {
  return sha256(Buffer.from(blocks.join("\n\n"), "utf8"));
}

function contentTypeForClip(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  fail("Rehearsal watch clips must be MP4, M4V, MOV, or WebM.");
}

async function inspectManuscript(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) {
    fail("The rehearsal manuscript must be a non-empty regular file.");
  }
  const bytes = await readFile(filePath);
  const body = bytes.toString("utf8");
  const blocks = manuscriptBlocks(body);
  if (!blocks.length) fail("The rehearsal manuscript has no importable text.");
  if (body.length > 200_000) {
    fail("The rehearsal manuscript exceeds Nest's 200,000-character limit.");
  }
  return {
    body,
    blocks,
    digest: blocksDigest(blocks),
    bytes: info.size,
    title: clean(blocks[0]?.split("\n", 1)[0]) || path.basename(filePath),
  };
}

async function inspectClip(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) {
    fail(`Watch clip is not a non-empty regular file: ${filePath}`);
  }
  const name = path.basename(filePath);
  const contentType = contentTypeForClip(name);
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height",
    "-of",
    "json",
    filePath,
  ]);
  const probe = JSON.parse(stdout);
  const durationSeconds = Number(probe?.format?.duration);
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream?.codec_type === "video");
  const audio = streams.find((stream) => stream?.codec_type === "audio");
  if (
    !video
    || !audio
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) {
    fail(`${name} must contain playable video, audio, and a positive duration.`);
  }
  const bytes = await readFile(filePath);
  return {
    path: filePath,
    name,
    contentType,
    durationSeconds,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    bytes,
    videoCodec: clean(video.codec_name),
    audioCodec: clean(audio.codec_name),
    width: Number(video.width) || null,
    height: Number(video.height) || null,
  };
}

function textBlocksFromDesk(desk) {
  return Array.isArray(desk?.textBlocks)
    ? desk.textBlocks.map((block) => clean(block?.body)).filter(Boolean)
    : [];
}

function isCanonicalSyntheticSeed(desk) {
  const blocks = Array.isArray(desk?.textBlocks)
    ? desk.textBlocks
    : [];
  const episodeTitle = clean(desk?.episode?.title);
  return blocks.length === 2
    && Boolean(episodeTitle)
    && Number(blocks[0]?.order) === 0
    && clean(blocks[0]?.body) === `# ${episodeTitle}`
    && Number(blocks[1]?.order) === 1000
    && clean(blocks[1]?.body) === SYNTHETIC_REHEARSAL_CHECKLIST;
}

function matchingReferenceCandidate(desk, clip) {
  return desk.importedCandidates.find(
    (candidate) =>
      clean(candidate?.title) === clip.name
      && clean(candidate?.importRole) === REFERENCE_CLIP_ROLE,
  ) || null;
}

async function replaceSyntheticSeedWithManuscript(
  prisma,
  options,
  manuscript,
) {
  const importedAt = new Date();
  const clientRequestId =
    `rehearsal-text-${manuscript.digest}`.slice(0, 160);
  return prisma.$transaction(async (tx) => {
    const production = await tx.studioEpisodeProduction.findFirst({
      where: {
        slug: options.episodeSlug,
        project: { slug: options.projectSlug },
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        documentId: true,
        productionJson: true,
      },
    });
    if (!production) fail("The rehearsal episode production is missing.");
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "StudioEpisodeProduction" WHERE "id" = $1 FOR UPDATE',
      production.id,
    );
    const existing = await tx.studioDocumentBlock.findMany({
      where: {
        documentId: production.documentId,
        archivedAt: null,
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        stableId: true,
        order: true,
        body: true,
        sourceLabel: true,
        sourcePath: true,
      },
    });
    const exactSeed =
      existing.length === 2
      && existing[0].order === 0
      && clean(existing[0].body) === `# ${clean(production.title)}`
      && !clean(existing[0].sourceLabel)
      && !clean(existing[0].sourcePath)
      && existing[1].order === 1000
      && clean(existing[1].body) === SYNTHETIC_REHEARSAL_CHECKLIST
      && !clean(existing[1].sourceLabel)
      && !clean(existing[1].sourcePath);
    if (!exactSeed) {
      fail(
        "The rehearsal writing changed after planning; refusing to replace it.",
      );
    }

    for (let index = 0; index < existing.length; index += 1) {
      await tx.studioDocumentBlock.update({
        where: { id: existing[index].id },
        data: {
          archivedAt: importedAt,
          archivedByLabel: "quipsly-rehearsal-seed-replacement",
          order: -10_000 - index,
        },
      });
    }
    const importedBlocks = manuscript.blocks.map((body, index) => ({
      id: randomUUID(),
      documentId: production.documentId,
      stableId: `episode-room-${randomUUID()}`,
      order: index,
      body,
      sourceLabel: "Episode Room text import",
      sourcePath:
        `episode-room://${options.projectSlug}/${options.episodeSlug}/${clientRequestId}`,
      isPrivate: true,
    }));
    await tx.studioDocumentBlock.createMany({ data: importedBlocks });
    // The working tree can contain additive StudioDocument fields that have
    // not crossed the production migration boundary yet. Update only the
    // deployed timestamp column so rehearsal staging does not accidentally
    // depend on, or roll out, unrelated schema work.
    await tx.$executeRawUnsafe(
      'UPDATE "StudioDocument" SET "updatedAt" = $2 WHERE "id" = $1',
      production.documentId,
      importedAt,
    );
    const operation = await tx.studioDocumentOperation.create({
      data: {
        projectId: production.projectId,
        documentId: production.documentId,
        groupId: clientRequestId,
        actorEmail: options.hostEmail,
        origin: "human",
        operationType: "episode-room-rehearsal-seed-replace",
        status: "applied",
        beforeJson: {
          synthetic: true,
          blocks: existing,
        },
        afterJson: {
          blockCount: importedBlocks.length,
          blockIds: importedBlocks.map((block) => block.id),
          stableIds: importedBlocks.map((block) => block.stableId),
        },
        payloadJson: {
          clientRequestId,
          episodeSlug: options.episodeSlug,
          contentSha256: manuscript.digest,
          source: "hgo-testflight-rehearsal-stage",
          retiredSyntheticSeedBlockIds: existing.map((block) => block.id),
        },
        // The retired seed remains archived for forensic recovery, but there
        // is no generic one-click inverse for this compound replacement.
        reversible: false,
      },
      select: { id: true },
    });
    const currentJson =
      production.productionJson
      && typeof production.productionJson === "object"
      && !Array.isArray(production.productionJson)
        ? production.productionJson
        : {};
    await tx.studioEpisodeProduction.update({
      where: { id: production.id },
      data: {
        productionJson: {
          ...currentJson,
          episodeTextImport: {
            version: 1,
            clientRequestId,
            importedAt: importedAt.toISOString(),
            importedBy: options.hostEmail,
            blockCount: importedBlocks.length,
            contentSha256: manuscript.digest,
            operationId: operation.id,
            replacedSyntheticRehearsalSeed: true,
          },
        },
      },
    });
    return {
      imported: true,
      alreadyImported: false,
      replacedSyntheticSeed: true,
      blockCount: importedBlocks.length,
      operationId: operation.id,
    };
  });
}

async function importManuscript(options, credentials, manuscript) {
  const response = await fetch(episodeRoomEndpoint(options), {
    method: "PUT",
    headers: authenticatedHeaders(credentials, {
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      episodeSlug: options.episodeSlug,
      body: manuscript.body,
      clientRequestId: `rehearsal-text-${manuscript.digest}`.slice(0, 160),
    }),
  });
  const document = await response.json();
  if (!response.ok || document?.ok !== true) {
    fail(
      `Episode manuscript import failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }
  return {
    imported: document.imported === true,
    alreadyImported: document.alreadyImported === true,
    blockCount: Number(document.blockCount) || manuscript.blocks.length,
  };
}

async function importClip(options, credentials, clip) {
  const form = new FormData();
  form.set("projectSlug", options.projectSlug);
  form.set("episodeSlug", options.episodeSlug);
  form.set("importRole", REFERENCE_CLIP_ROLE);
  form.set("durationSeconds", String(clip.durationSeconds));
  form.set("deviceLabel", "High Ground Odyssey episode source");
  form.set(
    "sourceDeviceClockNotes",
    "Private pre-recording reference clip. No participant recording or consent is represented.",
  );
  form.set(
    "file",
    new Blob([clip.bytes], { type: clip.contentType }),
    clip.name,
  );
  const response = await fetch(
    `${options.baseUrl}/api/episode-production/import-media`,
    {
      method: "POST",
      headers: authenticatedHeaders(credentials),
      body: form,
    },
  );
  const document = await response.json();
  if (
    !response.ok
    || document?.ok !== true
    || !clean(document?.importedAsset?.id)
    || !clean(document?.sourceId)
  ) {
    fail(
      `Reference clip import failed for ${clip.name} with HTTP `
      + `${response.status}: ${clean(document?.error) || "unknown error"}`,
    );
  }
  return {
    assetId: clean(document.importedAsset.id),
    sourceId: clean(document.sourceId),
    playbackUrl: clean(document.playbackUrl),
  };
}

function collaborationProxyEndpoint(options) {
  return `${options.baseUrl}/api/episode-production/collaboration-proxy`;
}

async function operateCollaborationProxy(
  options,
  credentials,
  candidate,
  action,
) {
  const response = await fetch(collaborationProxyEndpoint(options), {
    method: "POST",
    headers: authenticatedHeaders(credentials, {
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      action,
      projectSlug: options.projectSlug,
      episodeSlug: options.episodeSlug,
      assetId: candidate.assetId,
      sourceId: candidate.sourceId,
    }),
  });
  const document = await response.json();
  if (!response.ok || document?.ok !== true || !clean(document?.status)) {
    fail(
      `Collaboration proxy ${action} failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }
  return document;
}

async function verifyCollaborationProxyPlayback(
  options,
  credentials,
  proxy,
) {
  const playbackUrl = new URL(clean(proxy?.proxyUrl), options.baseUrl);
  const expectedSha256 = clean(proxy?.outputEvidence?.sha256);
  const expectedBytes = Number(proxy?.outputEvidence?.sizeBytes);
  if (!expectedSha256 || !Number.isFinite(expectedBytes) || expectedBytes <= 0) {
    fail("Completed collaboration proxy lacks immutable output evidence.");
  }
  const outsiderResponse = await fetch(playbackUrl, {
    headers: { Accept: "*/*" },
    redirect: "manual",
  });
  await outsiderResponse.arrayBuffer();
  const authenticatedResponse = await fetch(playbackUrl, {
    headers: authenticatedHeaders(credentials, { Accept: "*/*" }),
  });
  const bytes = Buffer.from(await authenticatedResponse.arrayBuffer());
  const playbackSha256 = sha256(bytes);
  return {
    outsiderStatus: outsiderResponse.status,
    outsiderDenied: [401, 403, 404].includes(outsiderResponse.status),
    authenticatedStatus: authenticatedResponse.status,
    authenticatedBytes: bytes.byteLength,
    expectedBytes,
    expectedSha256,
    playbackSha256,
    exactOutputMatch:
      authenticatedResponse.status === 200
      && bytes.byteLength === expectedBytes
      && playbackSha256 === expectedSha256,
  };
}

async function prepareCollaborationProxy(options, credentials, candidate) {
  if (!clean(candidate?.sourceId)) {
    fail(`${clean(candidate?.title) || "Video"} lacks a source identity.`);
  }
  let proxy = await operateCollaborationProxy(
    options,
    credentials,
    candidate,
    "queue",
  );
  for (let attempt = 0; attempt < COLLABORATION_PROXY_MAX_POLLS; attempt += 1) {
    if (proxy.status === "completed") {
      const playback = await verifyCollaborationProxyPlayback(
        options,
        credentials,
        proxy,
      );
      if (!playback.exactOutputMatch || !playback.outsiderDenied) {
        fail("Collaboration proxy failed protected playback verification.");
      }
      return { proxy, playback, pollCount: attempt };
    }
    if (proxy.status === "blocked" || proxy.status === "failed") {
      fail(
        `Collaboration proxy entered ${proxy.status}: `
        + `${clean(proxy.error) || "no durable error was returned"}`,
      );
    }
    if (attempt > 0 && attempt % 24 === 0) {
      process.stderr.write(
        `Collaboration proxy is ${proxy.status}; continuing durable reconciliation.\n`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, COLLABORATION_PROXY_POLL_INTERVAL_MS));
    // The worker completes through immutable object-store receipts. Reconcile,
    // rather than merely reading the database row, so a completed receipt is
    // registered back into the episode and becomes usable by Shared Watch.
    proxy = await operateCollaborationProxy(
      options,
      credentials,
      candidate,
      "reconcile",
    );
  }
  fail("Collaboration proxy did not finish within the bounded wait window.");
}

async function issueRoomCommand(
  options,
  credentials,
  type,
  fields,
  alreadySatisfied,
) {
  const clientRequestId =
    `rehearsal-stage-${type.toLowerCase()}-${randomUUID()}`.slice(0, 160);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readEpisodeDesk(options, credentials);
    if (alreadySatisfied(current.desk)) {
      return { changed: false, desk: current.desk };
    }
    const response = await fetch(episodeRoomEndpoint(options), {
      method: "POST",
      headers: authenticatedHeaders(credentials, {
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        episodeSlug: options.episodeSlug,
        type,
        clientRequestId,
        expectedRevision: current.desk.room.revision,
        ...fields,
      }),
    });
    const document = await response.json();
    if (response.status === 409 && attempt < 2) continue;
    if (!response.ok || document?.ok !== true || !document?.room) {
      fail(
        `Episode Room ${type} failed with HTTP ${response.status}: `
        + `${clean(document?.error) || "unknown error"}`,
      );
    }
    return {
      changed: true,
      desk: (await readEpisodeDesk(options, credentials)).desk,
    };
  }
  fail(`Episode Room ${type} exhausted its revision retries.`);
}

function roomAssetIds(desk) {
  return Array.isArray(desk?.room?.clips)
    ? desk.room.clips.map((clip) => clean(clip?.assetId)).filter(Boolean)
    : [];
}

function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

async function prepareWatchList(
  options,
  credentials,
  candidates,
) {
  let current = (await readEpisodeDesk(options, credentials)).desk;
  const room = current.room;
  if (
    room.status === "playing"
    || room.activeSegment
    || (Array.isArray(room.segments) && room.segments.length > 0)
  ) {
    fail(
      "The rehearsal Watch room already contains playback history; refusing "
      + "to reorder its clips automatically.",
    );
  }

  const desiredIds = candidates.map((candidate) => candidate.assetId);
  const allowedIds = new Set(desiredIds);
  const removableProofIds = new Set(
    current.importedCandidates
      .filter((candidate) => candidate.importRole === RETIRED_PROOF_ROLE)
      .map((candidate) => candidate.assetId),
  );
  const unexpected = roomAssetIds(current).filter(
    (assetId) => !allowedIds.has(assetId) && !removableProofIds.has(assetId),
  );
  if (unexpected.length > 0) {
    fail(
      "The Watch list contains an unexpected collaborator clip; refusing "
      + "to remove or reorder it automatically.",
    );
  }

  const exactAlready =
    arraysEqual(roomAssetIds(current), desiredIds)
    && room.selectedClipId === desiredIds[0];
  if (exactAlready) {
    return { changed: false, desk: current };
  }

  for (const assetId of roomAssetIds(current)) {
    const result = await issueRoomCommand(
      options,
      credentials,
      "REMOVE_CLIP",
      { clipId: assetId, positionSeconds: 0 },
      (desk) => !roomAssetIds(desk).includes(assetId),
    );
    current = result.desk;
  }
  for (const candidate of candidates) {
    const result = await issueRoomCommand(
      options,
      credentials,
      "ADD_CLIP",
      { assetId: candidate.assetId },
      (desk) => roomAssetIds(desk).includes(candidate.assetId),
    );
    current = result.desk;
  }
  if (current.room.selectedClipId !== desiredIds[0]) {
    current = (
      await issueRoomCommand(
        options,
        credentials,
        "SELECT_CLIP",
        { clipId: desiredIds[0], positionSeconds: 0 },
        (desk) => desk.room.selectedClipId === desiredIds[0],
      )
    ).desk;
  }
  return { changed: true, desk: current };
}

async function writeReceipt(outputPath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, serialized, { mode: 0o600 });
    await chmod(outputPath, 0o600);
  }
  process.stdout.write(serialized);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const manuscript = options.manuscriptPath
    ? await inspectManuscript(options.manuscriptPath)
    : null;
  const clips = [];
  for (const clipPath of options.clipPaths) {
    clips.push(await inspectClip(clipPath));
  }

  const duplicateNames = clips
    .map((clip) => clip.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    fail(`Clip filenames must be unique: ${duplicateNames.join(", ")}`);
  }

  const prisma = createPrisma();
  try {
    const host = await hostUser(prisma, options.hostEmail);
    const idToken = await firebaseIdToken(options, host);
    const sessionCookie = await nestSessionCookie(options, idToken);
    const credentials = { idToken, sessionCookie };
    const initial = await readEpisodeDesk(options, credentials);
    const initialBlocks = textBlocksFromDesk(initial.desk);
    const initialTextDigest = blocksDigest(initialBlocks);
    const initialIsSyntheticSeed = isCanonicalSyntheticSeed(initial.desk);
    const initialTextConflict =
      Boolean(manuscript)
      && initialBlocks.length > 0
      && initialTextDigest !== manuscript?.digest;
    let manuscriptResult = null;
    const clipResults = [];

    if (
      options.apply
      && initialTextConflict
      && !initialIsSyntheticSeed
    ) {
      fail(
        "The episode already contains different writing; refusing to overwrite it.",
      );
    }
    if (options.apply && manuscript) {
      if (initialIsSyntheticSeed) {
        manuscriptResult = await replaceSyntheticSeedWithManuscript(
          prisma,
          options,
          manuscript,
        );
      } else if (initialBlocks.length === 0) {
        manuscriptResult = await importManuscript(
          options,
          credentials,
          manuscript,
        );
      }
    }

    let desk = (await readEpisodeDesk(options, credentials)).desk;
    for (const clip of clips) {
      let candidate = matchingReferenceCandidate(desk, clip);
      let imported = false;
      if (options.apply && !candidate) {
        await importClip(options, credentials, clip);
        imported = true;
        desk = (await readEpisodeDesk(options, credentials)).desk;
        candidate = matchingReferenceCandidate(desk, clip);
      }
      if (options.apply && !candidate) {
        fail(`${clip.name} did not appear in the Episode Room after upload.`);
      }
      const sourcePlaybackCandidate = candidate
        ? {
            ...candidate,
            playbackUrl: `/api/ingest/media/${encodeURIComponent(candidate.sourceId)}`,
          }
        : null;
      const playback =
        options.apply && candidate
          ? await verifyPlayback(
              options,
              credentials,
              sourcePlaybackCandidate,
              clip.bytes,
            )
          : null;
      if (options.apply && !playback?.exactBytesMatch) {
        fail(`${clip.name} did not survive authenticated playback byte-for-byte.`);
      }
      if (options.apply && playback?.outsiderDenied !== true) {
        fail(`${clip.name} was readable without an authenticated Nest session.`);
      }
      const proxyResult =
        options.apply && candidate && candidate.kind === "video"
          ? await prepareCollaborationProxy(options, credentials, candidate)
          : null;
      if (proxyResult) {
        desk = (await readEpisodeDesk(options, credentials)).desk;
        candidate = matchingReferenceCandidate(desk, clip);
      }
      clipResults.push({
        name: clip.name,
        sha256: clip.sha256,
        localBytes: clip.byteLength,
        durationSeconds: clip.durationSeconds,
        video: {
          codec: clip.videoCodec,
          width: clip.width,
          height: clip.height,
        },
        audioCodec: clip.audioCodec,
        existedBefore: Boolean(
          matchingReferenceCandidate(initial.desk, clip),
        ),
        importedThisRun: imported,
        assetId: candidate?.assetId ?? null,
        sourceId: candidate?.sourceId ?? null,
        proxy: proxyResult
          ? {
              jobId: clean(proxyResult.proxy.jobId),
              status: proxyResult.proxy.status,
              proxyAssetId: clean(proxyResult.proxy.proxyAssetId),
              proxySourceId: clean(proxyResult.proxy.proxySourceId),
              variantId: clean(proxyResult.proxy.variantId),
              originalRemainsSourceTruth:
                proxyResult.proxy.originalRemainsSourceTruth === true,
              pollCount: proxyResult.pollCount,
              playback: proxyResult.playback,
            }
          : null,
        playback: playback
          ? {
              outsiderStatus: playback.outsiderStatus,
              outsiderDenied: playback.outsiderDenied,
              authenticatedStatus: playback.authenticatedStatus,
              authenticatedBytes: playback.authenticatedBytes,
              exactBytesMatch: playback.exactBytesMatch,
            }
          : null,
      });
    }

    let watchResult = null;
    if (options.apply && clipResults.length > 0) {
      desk = (await readEpisodeDesk(options, credentials)).desk;
      const candidates = clips.map((clip) => {
        const candidate = matchingReferenceCandidate(desk, clip);
        if (!candidate) fail(`Missing imported candidate for ${clip.name}.`);
        return candidate;
      });
      watchResult = await prepareWatchList(
        options,
        credentials,
        candidates,
      );
    }

    const final = await readEpisodeDesk(options, credentials);
    const finalBlocks = textBlocksFromDesk(final.desk);
    const desiredIds = clipResults.map((clip) => clip.assetId).filter(Boolean);
    const finalIds = roomAssetIds(final.desk);
    const value = {
      schema: "quipsly-hgo-testflight-rehearsal-stage-v1",
      auditedAt: new Date().toISOString(),
      mode: options.apply ? "apply" : "plan",
      baseUrl: options.baseUrl,
      roomUrl:
        `${options.baseUrl}/nests/${encodeURIComponent(options.projectSlug)}`
        + `/episodes/${encodeURIComponent(options.episodeSlug)}`,
      hostEmailDigest: sha256(Buffer.from(options.hostEmail, "utf8")),
      projectSlug: options.projectSlug,
      episodeSlug: options.episodeSlug,
      manuscript: manuscript
        ? {
            title: manuscript.title,
            sha256: manuscript.digest,
            localBytes: manuscript.bytes,
            expectedBlockCount: manuscript.blocks.length,
            existedBefore: initialBlocks.length > 0,
            initialBlockCount: initialBlocks.length,
            initialTextSha256: initialTextDigest,
            initialWasCanonicalSyntheticSeed: initialIsSyntheticSeed,
            textConflict: initialTextConflict,
            importedThisRun: manuscriptResult?.imported === true,
            replacedSyntheticSeed:
              manuscriptResult?.replacedSyntheticSeed === true,
            finalBlockCount: finalBlocks.length,
            exactTextMatch: blocksDigest(finalBlocks) === manuscript.digest,
          }
        : null,
      clips: clipResults,
      watch: {
        changedThisRun: watchResult?.changed === true,
        desiredAssetIds: desiredIds,
        finalAssetIds: finalIds,
        exactOrder: arraysEqual(finalIds, desiredIds),
        selectedLeadAssetId: final.desk.room.selectedClipId ?? null,
        leadSelected:
          desiredIds.length > 0
          && final.desk.room.selectedClipId === desiredIds[0],
        status: final.desk.room.status,
        segmentCount: Array.isArray(final.desk.room.segments)
          ? final.desk.room.segments.length
          : null,
        sessionStarted: Boolean(final.desk.room.session),
      },
      safety: {
        recordingStarted: false,
        providerJoined: false,
        playbackStarted: false,
        humanConsentMutated: false,
        credentialsPrinted: false,
        outsiderPlaybackDenied:
          clipResults.length > 0
          && clipResults.every(
            (clip) => clip.playback?.outsiderDenied === true,
          ),
      },
      passed: Boolean(
        options.apply
        && manuscript
        && blocksDigest(finalBlocks) === manuscript.digest
        && desiredIds.length === clips.length
        && arraysEqual(finalIds, desiredIds)
        && final.desk.room.selectedClipId === desiredIds[0]
        && final.desk.room.status !== "playing"
        && !final.desk.room.session
        && clipResults.every(
          (clip) =>
            clip.playback?.exactBytesMatch === true
            && clip.playback?.outsiderDenied === true
            && clip.proxy?.status === "completed"
            && clip.proxy?.originalRemainsSourceTruth === true
            && clip.proxy?.playback?.exactOutputMatch === true
            && clip.proxy?.playback?.outsiderDenied === true,
        ),
      ),
    };
    await writeReceipt(options.outputPath, value);
    if (options.apply && !value.passed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

export {
  arraysEqual,
  blocksDigest,
  contentTypeForClip,
  isCanonicalSyntheticSeed,
  manuscriptBlocks,
  matchingReferenceCandidate,
  parseArguments,
  roomAssetIds,
};

const launchedDirectly =
  Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launchedDirectly) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
  });
}
