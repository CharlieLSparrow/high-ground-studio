#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const FIREBASE_PROJECT_ID = "quipsly-reef";
const FIREBASE_SIGNER_SERVICE_ACCOUNT =
  "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com";
const DEFAULTS = Object.freeze({
  baseUrl: "https://nest.quipsly.com",
  hostEmail: "charlie@highgroundodyssey.com",
  projectSlug: "high-ground-odyssey-rehearsal",
  episodeSlug: "testflight-rehearsal",
  fixtureName: "Quipsly Capture Rehearsal System Check.m4a",
  durationSeconds: 0,
});

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
    fixtureName:
      process.env.QUIPSLY_REHEARSAL_FIXTURE_NAME || DEFAULTS.fixtureName,
    durationSeconds: Number(
      process.env.QUIPSLY_REHEARSAL_FIXTURE_DURATION
        || DEFAULTS.durationSeconds,
    ),
    mediaPath: "",
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
    else if (flag === "--fixture-name") options.fixtureName = value;
    else if (flag === "--duration-seconds") {
      options.durationSeconds = Number(value);
    } else if (flag === "--media") options.mediaPath = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  options.baseUrl = clean(options.baseUrl).replace(/\/+$/, "");
  options.hostEmail = normalizeEmail(options.hostEmail);
  options.projectSlug = clean(options.projectSlug);
  options.episodeSlug = clean(options.episodeSlug);
  options.fixtureName = path.basename(clean(options.fixtureName));
  options.mediaPath = clean(options.mediaPath);
  options.outputPath = clean(options.outputPath);
  if (!options.baseUrl.startsWith("https://")) {
    fail("baseUrl must be HTTPS.");
  }
  for (const [name, value] of Object.entries({
    hostEmail: options.hostEmail,
    projectSlug: options.projectSlug,
    episodeSlug: options.episodeSlug,
    fixtureName: options.fixtureName,
  })) {
    if (!value) fail(`${name} is required.`);
  }
  if (
    !Number.isFinite(options.durationSeconds)
    || options.durationSeconds < 0
  ) {
    fail("durationSeconds must be a non-negative number.");
  }
  if (options.apply && !options.mediaPath) {
    fail("--media is required with --apply.");
  }
  return options;
}

function usage() {
  return `Usage:
  DATABASE_URL=<secret> QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT=<port> \\
    node scripts/quipsly-verify-hgo-rehearsal-media.mjs [--apply] [options]

Without --apply, this is a read-only production plan.

Options:
  --base-url <url>
  --host-email <email>
  --project-slug <slug>
  --episode-slug <slug>
  --fixture-name <name>
  --duration-seconds <seconds>
  --media <path>        Required only with --apply.
  --output <path>       Redacted mode-0600 receipt.
  --apply               Import and verify the synthetic rehearsal fixture.
`;
}

function databaseUrlForProxy() {
  const raw = clean(process.env.DATABASE_URL);
  if (!raw) fail("DATABASE_URL is required.");
  const url = new URL(raw);
  const proxyPort = clean(process.env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT);
  const socketHost = url.searchParams.get("host") || "";
  if (proxyPort && socketHost.startsWith("/cloudsql/")) {
    url.hostname = "127.0.0.1";
    url.port = proxyPort;
    url.searchParams.delete("host");
  }
  return url.toString();
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrlForProxy(),
      connectionTimeoutMillis: 20_000,
    }),
  });
}

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".aac") return "audio/aac";
  fail("Synthetic rehearsal media must be M4A, WAV, MP3, or AAC.");
}

async function hostUser(prisma, email) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: email },
        { aliases: { some: { email } } },
      ],
    },
    select: {
      id: true,
      primaryEmail: true,
      firebaseUid: true,
      isActive: true,
    },
  });
}

async function firebaseIdToken(options, host) {
  if (!host?.firebaseUid || !host.isActive) {
    fail("The rehearsal host must be active and linked to Firebase.");
  }
  const configResponse = await fetch(
    `${options.baseUrl}/api/mac/firebase-client-config`,
    { headers: { Accept: "application/json" } },
  );
  const config = await configResponse.json();
  const apiKey = clean(config?.firebase?.apiKey);
  if (!configResponse.ok || config?.ok !== true || !apiKey) {
    fail("Nest did not expose usable Firebase client configuration.");
  }

  const firebaseApp = initializeApp(
    {
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
      serviceAccountId: FIREBASE_SIGNER_SERVICE_ACCOUNT,
    },
    `quipsly-rehearsal-media-${Date.now()}`,
  );
  const auth = getAuth(firebaseApp);
  const firebaseUser = await auth.getUser(host.firebaseUid);
  if (
    normalizeEmail(firebaseUser.email)
    !== normalizeEmail(options.hostEmail)
  ) {
    fail("Host Firebase identity does not match the requested rehearsal host.");
  }
  const customToken = await auth.createCustomToken(host.firebaseUid, {
    purpose: "quipsly-hgo-rehearsal-media-proof",
  });
  const exchangeResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchange = await exchangeResponse.json();
  if (!exchangeResponse.ok || !clean(exchange?.idToken)) {
    fail(
      "Firebase custom-token exchange failed for the rehearsal host"
      + `${clean(exchange?.error?.message) ? `: ${clean(exchange.error.message)}` : "."}`,
    );
  }
  return exchange.idToken;
}

async function nestSessionCookie(options, idToken) {
  const response = await fetch(`${options.baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ idToken }),
  });
  const document = await response.json();
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("session="));
  const cookiePair = sessionCookie?.split(";", 1)[0] || "";
  if (!response.ok || document?.success !== true || !cookiePair) {
    fail(
      `Nest session exchange failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "missing session cookie"}`,
    );
  }
  return cookiePair;
}

function authenticatedHeaders(credentials, extra = {}) {
  return {
    Authorization: `Bearer ${credentials.idToken}`,
    Cookie: credentials.sessionCookie,
    ...extra,
  };
}

function episodeRoomEndpoint(options) {
  return `${options.baseUrl}/api/nests/${encodeURIComponent(options.projectSlug)}/episode-room`;
}

async function readEpisodeDesk(options, credentials) {
  const endpoint = new URL(episodeRoomEndpoint(options));
  endpoint.searchParams.set("episode", options.episodeSlug);
  const response = await fetch(endpoint, {
    headers: authenticatedHeaders(credentials, {
      Accept: "application/json",
    }),
  });
  const document = await response.json();
  if (
    !response.ok
    || document?.ok !== true
    || !document?.desk?.room
    || !Array.isArray(document?.desk?.importedCandidates)
  ) {
    fail(
      `Production Episode Room read failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }
  return { status: response.status, desk: document.desk };
}

function matchingFixture(desk, fixtureName) {
  return desk.importedCandidates.find(
    (candidate) =>
      clean(candidate?.title) === fixtureName
      && clean(candidate?.importRole) === "rehearsal-proof",
  ) || null;
}

async function importFixture(options, credentials, mediaBytes) {
  const form = new FormData();
  form.set("projectSlug", options.projectSlug);
  form.set("episodeSlug", options.episodeSlug);
  form.set("importRole", "rehearsal-proof");
  form.set("durationSeconds", String(options.durationSeconds));
  form.set("deviceLabel", "Quipsly production rehearsal system check");
  form.set(
    "sourceDeviceClockNotes",
    "Synthetic non-human readiness fixture. No participant recording or consent is represented.",
  );
  form.set(
    "file",
    new Blob([mediaBytes], { type: contentTypeFor(options.fixtureName) }),
    options.fixtureName,
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
    || !clean(document?.playbackUrl)
  ) {
    fail(
      `Production media import failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }
  return {
    status: response.status,
    assetId: clean(document.importedAsset.id),
    sourceId: clean(document.sourceId),
    playbackUrl: clean(document.playbackUrl),
  };
}

async function attachFixtureToWatch(
  options,
  credentials,
  desk,
  candidate,
) {
  if (candidate.attached === true) {
    return { changed: false, status: 200 };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(episodeRoomEndpoint(options), {
      method: "POST",
      headers: authenticatedHeaders(credentials, {
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        episodeSlug: options.episodeSlug,
        type: "ADD_CLIP",
        assetId: candidate.assetId,
        clientRequestId:
          `rehearsal-proof-${candidate.assetId}`.slice(0, 160),
        expectedRevision: desk.room.revision,
      }),
    });
    const document = await response.json();
    if (response.status === 409 && attempt === 0) {
      ({ desk } = await readEpisodeDesk(options, credentials));
      const refreshed = matchingFixture(desk, options.fixtureName);
      if (refreshed?.attached === true) {
        return { changed: false, status: 200 };
      }
      continue;
    }
    if (!response.ok || document?.ok !== true || !document?.room) {
      fail(
        `Episode Watch attachment failed with HTTP ${response.status}: `
        + `${clean(document?.error) || "unknown error"}`,
      );
    }
    return { changed: true, status: response.status };
  }
  fail("Episode Watch attachment exhausted its revision retry.");
}

async function verifyPlayback(
  options,
  credentials,
  candidate,
  expectedBytes,
) {
  const playbackUrl = new URL(candidate.playbackUrl, options.baseUrl);
  const outsiderResponse = await fetch(playbackUrl, {
    headers: { Accept: "*/*" },
    redirect: "manual",
  });
  await outsiderResponse.arrayBuffer();

  const authenticatedResponse = await fetch(playbackUrl, {
    headers: authenticatedHeaders(credentials, {
      Accept: "*/*",
    }),
  });
  const playbackBytes = Buffer.from(
    await authenticatedResponse.arrayBuffer(),
  );
  const expectedSha256 = createHash("sha256")
    .update(expectedBytes)
    .digest("hex");
  const playbackSha256 = createHash("sha256")
    .update(playbackBytes)
    .digest("hex");
  return {
    outsiderStatus: outsiderResponse.status,
    outsiderDenied: [401, 403, 404].includes(outsiderResponse.status),
    authenticatedStatus: authenticatedResponse.status,
    authenticatedContentType:
      authenticatedResponse.headers.get("content-type"),
    authenticatedBytes: playbackBytes.byteLength,
    expectedSha256,
    playbackSha256,
    exactBytesMatch:
      authenticatedResponse.status === 200
      && playbackBytes.byteLength === expectedBytes.byteLength
      && playbackSha256 === expectedSha256,
  };
}

async function timelineReadback(prisma, options, assetId) {
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: options.episodeSlug,
      project: { slug: options.projectSlug },
    },
    select: {
      id: true,
      productionJson: true,
      updatedAt: true,
    },
  });
  if (!production) fail("The rehearsal episode production is missing.");
  const productionJson =
    production.productionJson
    && typeof production.productionJson === "object"
    && !Array.isArray(production.productionJson)
      ? production.productionJson
      : {};
  const timelineClips = Array.isArray(productionJson.timelineClips)
    ? productionJson.timelineClips
    : [];
  const clip = timelineClips.find(
    (entry) =>
      entry
      && typeof entry === "object"
      && !Array.isArray(entry)
      && clean(entry.assetId) === assetId,
  );
  const audioTakeStack =
    productionJson.audioTakeStack
    && typeof productionJson.audioTakeStack === "object"
    && !Array.isArray(productionJson.audioTakeStack)
      ? productionJson.audioTakeStack
      : {};
  return {
    productionId: production.id,
    productionUpdatedAt: production.updatedAt.toISOString(),
    timelineClipCount: timelineClips.length,
    fixtureTimelineClipReady: Boolean(clip),
    fixtureTimelineTrackId: clean(clip?.trackId) || null,
    fixtureTimelineStartSeconds:
      typeof clip?.startIn === "number" ? clip.startIn : null,
    fixtureTimelineDurationSeconds:
      typeof clip?.duration === "number" ? clip.duration : null,
    audioTakeStackClipCount:
      typeof audioTakeStack.clipCount === "number"
        ? audioTakeStack.clipCount
        : null,
  };
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
  const prisma = createPrisma();
  try {
    const host = await hostUser(prisma, options.hostEmail);
    const idToken = await firebaseIdToken(options, host);
    const sessionCookie = await nestSessionCookie(options, idToken);
    const credentials = { idToken, sessionCookie };
    const initial = await readEpisodeDesk(options, credentials);
    let candidate = matchingFixture(initial.desk, options.fixtureName);
    let importResult = null;
    let mediaBytes = null;
    let mediaStat = null;

    if (options.apply) {
      mediaStat = await stat(options.mediaPath);
      if (!mediaStat.isFile() || mediaStat.size <= 0) {
        fail("Synthetic rehearsal media must be a non-empty regular file.");
      }
      mediaBytes = await readFile(options.mediaPath);
      if (!candidate) {
        importResult = await importFixture(
          options,
          credentials,
          mediaBytes,
        );
        const refreshed = await readEpisodeDesk(options, credentials);
        candidate = matchingFixture(refreshed.desk, options.fixtureName);
      }
      if (!candidate) {
        fail("Imported rehearsal fixture did not appear in Episode Room.");
      }
      await attachFixtureToWatch(
        options,
        credentials,
        (await readEpisodeDesk(options, credentials)).desk,
        candidate,
      );
    }

    const finalDesk = await readEpisodeDesk(options, credentials);
    candidate = matchingFixture(finalDesk.desk, options.fixtureName);
    const playback =
      options.apply && candidate && mediaBytes
        ? await verifyPlayback(
            options,
            credentials,
            candidate,
            mediaBytes,
          )
        : null;
    const timeline = candidate
      ? await timelineReadback(prisma, options, candidate.assetId)
      : null;
    const value = {
      schema: "quipsly-hgo-rehearsal-media-proof-v1",
      auditedAt: new Date().toISOString(),
      mode: options.apply ? "apply" : "plan",
      baseUrl: options.baseUrl,
      hostEmailDigest: createHash("sha256")
        .update(options.hostEmail)
        .digest("hex"),
      projectSlug: options.projectSlug,
      episodeSlug: options.episodeSlug,
      fixture: {
        name: options.fixtureName,
        synthetic: true,
        containsHumanRecording: false,
        consentRepresented: false,
        localBytes: mediaStat?.size ?? null,
        durationSeconds: options.durationSeconds || null,
        existedBefore: Boolean(
          matchingFixture(initial.desk, options.fixtureName),
        ),
        importedThisRun: Boolean(importResult),
        assetId: candidate?.assetId ?? null,
        sourceId: candidate?.sourceId ?? importResult?.sourceId ?? null,
        attachedToWatch: candidate?.attached === true,
        readinessLabel: candidate?.readinessLabel ?? null,
      },
      api: {
        episodeDeskStatus: finalDesk.status,
        canEdit: finalDesk.desk.canEdit === true,
        roomRevision: finalDesk.desk.room.revision,
        importedCandidateCount:
          finalDesk.desk.importedCandidates.length,
        timelineClipCount: finalDesk.desk.timelineClipCount,
      },
      playback,
      timeline,
      safety: {
        humanConsentMutated: false,
        recordingStarted: false,
        providerJoined: false,
        credentialsPrinted: false,
        outsiderPlaybackDenied: playback?.outsiderDenied ?? null,
      },
      passed: Boolean(
        options.apply
        && candidate?.attached === true
        && finalDesk.desk.canEdit === true
        && playback?.exactBytesMatch === true
        && playback?.outsiderDenied === true
        && timeline?.fixtureTimelineClipReady === true
        && (timeline?.fixtureTimelineDurationSeconds ?? 0) > 0,
      ),
    };
    await writeReceipt(options.outputPath, value);
    if (options.apply && !value.passed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

export {
  authenticatedHeaders,
  contentTypeFor,
  matchingFixture,
  parseArguments,
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
