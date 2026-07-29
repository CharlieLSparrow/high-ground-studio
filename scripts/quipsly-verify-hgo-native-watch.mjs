#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const FIREBASE_PROJECT_ID = "quipsly-reef";
const FIREBASE_SIGNER_SERVICE_ACCOUNT =
  "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com";
const EXPECTED_MEDIA = Object.freeze([
  Object.freeze({
    title: "Ted Lasso Be Curious.mp4",
    byteCount: 19_100_059,
    sha256:
      "acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3",
  }),
  Object.freeze({
    title: "I love lucy.mp4",
    byteCount: 10_880_177,
    sha256:
      "7ea7a14735b99cd6e4c5b4c35aecfb97a97df04a7c6f7ba61cf9d3623bcc8078",
  }),
  Object.freeze({
    title: "LOTR Ring Back.mp4",
    byteCount: 28_459_489,
    sha256:
      "0cd069b802ff719859673878061d63daee89dd7743a245c360a0f05d857d08bf",
  }),
]);
const EXPECTED_CLIP_TITLES = Object.freeze(
  EXPECTED_MEDIA.map((media) => media.title),
);
const DEFAULTS = Object.freeze({
  hostEmail: "charlie@highgroundodyssey.com",
  projectSlug: "high-ground-odyssey-rehearsal",
  episodeSlug: "testflight-rehearsal",
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
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
    baseUrl: clean(process.env.QUIPSLY_REHEARSAL_BASE_URL),
    hostEmail:
      clean(process.env.QUIPSLY_REHEARSAL_HOST_EMAIL)
      || DEFAULTS.hostEmail,
    projectSlug:
      clean(process.env.QUIPSLY_REHEARSAL_PROJECT_SLUG)
      || DEFAULTS.projectSlug,
    episodeSlug:
      clean(process.env.QUIPSLY_REHEARSAL_EPISODE_SLUG)
      || DEFAULTS.episodeSlug,
    expectedSourceSha: clean(process.env.QUIPSLY_EXPECTED_SOURCE_SHA),
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--host-email") options.hostEmail = value;
    else if (flag === "--project-slug") options.projectSlug = value;
    else if (flag === "--episode-slug") options.episodeSlug = value;
    else if (flag === "--expected-source-sha") {
      options.expectedSourceSha = value;
    } else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  options.baseUrl = clean(options.baseUrl).replace(/\/+$/, "");
  options.hostEmail = clean(options.hostEmail).toLowerCase();
  options.projectSlug = clean(options.projectSlug);
  options.episodeSlug = clean(options.episodeSlug);
  options.expectedSourceSha = clean(options.expectedSourceSha).toLowerCase();
  options.outputPath = clean(options.outputPath);

  if (options.help) return options;
  if (!options.baseUrl.startsWith("https://")) {
    fail("--base-url must be an explicit HTTPS preview origin.");
  }
  const parsedBaseUrl = new URL(options.baseUrl);
  if (parsedBaseUrl.pathname !== "/" || parsedBaseUrl.search || parsedBaseUrl.hash) {
    fail("--base-url must be an origin without a path, query, or fragment.");
  }
  for (const [name, value] of Object.entries({
    hostEmail: options.hostEmail,
    projectSlug: options.projectSlug,
    episodeSlug: options.episodeSlug,
  })) {
    if (!value) fail(`${name} is required.`);
  }
  if (
    options.expectedSourceSha
    && !/^[a-f0-9]{40}$/.test(options.expectedSourceSha)
  ) {
    fail("--expected-source-sha must be a full 40-character Git SHA.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/quipsly-verify-hgo-native-watch.mjs \\
    --base-url <zero-traffic-preview-origin> \\
    [--expected-source-sha <full-git-sha>] [--output <receipt.json>]

This proof is intentionally read-only. It:
  - mints a short-lived Firebase token for the configured rehearsal host;
  - exercises the native bearer-auth Watch projection;
  - proves the same Watch and media routes deny an outsider;
  - verifies all three exact clip byte counts and SHA-256 values while streaming; and
  - asserts that no Watch session or watched segment has been invented.

Options:
  --base-url <url>             Required explicit HTTPS preview origin.
  --host-email <email>         Defaults to the HGO rehearsal host.
  --project-slug <slug>        Defaults to high-ground-odyssey-rehearsal.
  --episode-slug <slug>        Defaults to testflight-rehearsal.
  --expected-source-sha <sha>  Require healthz to name this exact Git SHA.
  --output <path>              Redacted mode-0600 receipt.
`;
}

async function jsonResponse(response, label) {
  const document = await response.json().catch(() => null);
  if (!document || typeof document !== "object") {
    fail(`${label} returned non-JSON HTTP ${response.status}.`);
  }
  return document;
}

async function firebaseIdToken(options) {
  const configResponse = await fetch(
    `${options.baseUrl}/api/mac/firebase-client-config`,
    { headers: { Accept: "application/json" } },
  );
  const config = await jsonResponse(configResponse, "Firebase client config");
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
    `quipsly-native-watch-proof-${Date.now()}`,
  );
  try {
    const auth = getAuth(firebaseApp);
    const user = await auth.getUserByEmail(options.hostEmail);
    if (clean(user.email).toLowerCase() !== options.hostEmail) {
      fail("Firebase returned a different rehearsal host identity.");
    }
    const customToken = await auth.createCustomToken(user.uid, {
      purpose: "quipsly-hgo-native-watch-read-only-proof",
    });
    const exchangeResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const exchange = await jsonResponse(
      exchangeResponse,
      "Firebase custom-token exchange",
    );
    if (!exchangeResponse.ok || !clean(exchange?.idToken)) {
      fail(
        "Firebase custom-token exchange failed"
        + `${clean(exchange?.error?.message) ? `: ${clean(exchange.error.message)}` : "."}`,
      );
    }
    return exchange.idToken;
  } finally {
    await deleteApp(firebaseApp);
  }
}

function watchEndpoint(options) {
  const endpoint = new URL(
    `/api/nests/${encodeURIComponent(options.projectSlug)}/episode-room`,
    options.baseUrl,
  );
  endpoint.searchParams.set("episode", options.episodeSlug);
  endpoint.searchParams.set("watch", "1");
  return endpoint;
}

async function readWatch(options, idToken) {
  const outsiderResponse = await fetch(watchEndpoint(options), {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });
  await outsiderResponse.arrayBuffer();

  const startedAt = performance.now();
  const authenticatedResponse = await fetch(watchEndpoint(options), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });
  const endedAt = performance.now();
  const document = await jsonResponse(
    authenticatedResponse,
    "Authenticated native Watch projection",
  );
  if (
    !authenticatedResponse.ok
    || document?.ok !== true
    || !document?.room
  ) {
    fail(
      `Authenticated native Watch projection failed with HTTP ${authenticatedResponse.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }

  return {
    outsiderStatus: outsiderResponse.status,
    outsiderDenied: [401, 403, 404].includes(outsiderResponse.status),
    authenticatedStatus: authenticatedResponse.status,
    roundTripMilliseconds: Math.max(0, endedAt - startedAt),
    document,
  };
}

function assertRehearsalState(watch) {
  const { document } = watch;
  const room = document.room;
  const clips = Array.isArray(room.clips) ? room.clips : [];
  const clipTitles = clips.map((clip) => clean(clip?.title));
  const selectedClip = clips.find(
    (clip) => clean(clip?.assetId) === clean(room.selectedClipId),
  );
  const segments = Array.isArray(room.segments) ? room.segments : [];
  const receipts = Array.isArray(room.receipts) ? room.receipts : [];
  const serverNow = clean(document.serverNow);

  const state = {
    canEdit: document.canEdit === true,
    serverNowValid: Boolean(serverNow && Number.isFinite(Date.parse(serverNow))),
    version: clean(room.version),
    revision: Number.isInteger(room.revision) ? room.revision : null,
    status: clean(room.status),
    positionSeconds:
      Number.isFinite(Number(room.positionSeconds))
        ? Number(room.positionSeconds)
        : null,
    clipTitles,
    exactClipOrder:
      JSON.stringify(clipTitles) === JSON.stringify(EXPECTED_CLIP_TITLES),
    selectedClipTitle: clean(selectedClip?.title) || null,
    leadSelected: clean(selectedClip?.title) === EXPECTED_CLIP_TITLES[0],
    sessionStarted: Boolean(room.session),
    activeSegment: Boolean(room.activeSegment),
    watchedSegmentCount: segments.length,
    receiptCount: receipts.length,
  };
  const passed =
    watch.outsiderDenied
    && state.canEdit
    && state.serverNowValid
    && state.version === "quipsly-episode-room.v1"
    && state.revision !== null
    && state.revision >= 0
    && state.status === "paused"
    && state.exactClipOrder
    && state.leadSelected
    && !state.sessionStarted
    && !state.activeSegment
    && state.watchedSegmentCount === 0;
  if (!passed) {
    fail(`The rehearsal Watch state failed its safety contract: ${JSON.stringify(state)}`);
  }
  return { state, selectedClip, clips };
}

async function streamSha256(response) {
  if (!response.body) fail("Protected media response did not include a body.");
  const hash = createHash("sha256");
  let byteCount = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    byteCount += chunk.byteLength;
  }
  return {
    byteCount,
    sha256: hash.digest("hex"),
  };
}

function expectedMediaForClip(clip) {
  const title = clean(clip?.title);
  const expected = EXPECTED_MEDIA.find((media) => media.title === title);
  if (!expected) {
    fail(`No immutable rehearsal media identity is pinned for ${title || "an untitled clip"}.`);
  }
  return expected;
}

async function verifyProtectedClip(options, idToken, clip) {
  const expected = expectedMediaForClip(clip);
  const playbackUrl = new URL(clean(clip?.playbackUrl), options.baseUrl);
  if (playbackUrl.origin !== new URL(options.baseUrl).origin) {
    fail("Protected playback URL left the verified preview origin.");
  }

  const outsiderResponse = await fetch(playbackUrl, {
    headers: { Accept: "*/*" },
    redirect: "manual",
  });
  await outsiderResponse.arrayBuffer();

  const authenticatedResponse = await fetch(playbackUrl, {
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${idToken}`,
    },
    redirect: "manual",
  });
  const streamed = await streamSha256(authenticatedResponse);
  const contentLength = Number(
    authenticatedResponse.headers.get("content-length"),
  );
  const evidence = {
    title: expected.title,
    outsiderStatus: outsiderResponse.status,
    outsiderDenied: [401, 403, 404].includes(outsiderResponse.status),
    authenticatedStatus: authenticatedResponse.status,
    contentType: authenticatedResponse.headers.get("content-type"),
    contentLength:
      Number.isFinite(contentLength) && contentLength >= 0
        ? contentLength
        : null,
    streamedBytes: streamed.byteCount,
    streamedSha256: streamed.sha256,
    exactBytesMatch:
      authenticatedResponse.status === 200
      && streamed.byteCount === expected.byteCount
      && streamed.sha256 === expected.sha256,
  };
  if (!evidence.outsiderDenied || !evidence.exactBytesMatch) {
    fail(`Protected ${expected.title} playback failed its boundary proof: ${JSON.stringify(evidence)}`);
  }
  return evidence;
}

async function verifyProtectedMedia(options, idToken, clips) {
  const media = [];
  for (const clip of clips) {
    media.push(await verifyProtectedClip(options, idToken, clip));
  }
  return media;
}

async function readRelease(options) {
  const response = await fetch(`${options.baseUrl}/api/healthz`, {
    headers: { Accept: "application/json" },
  });
  const document = await jsonResponse(response, "Preview healthz");
  const evidence = {
    status: response.status,
    revisionName: clean(document?.runtime?.revisionName) || null,
    imageTag: clean(document?.release?.imageTag) || null,
    sourceSha: clean(document?.release?.sourceSha).toLowerCase() || null,
    releaseChannel: clean(document?.release?.releaseChannel) || null,
  };
  if (
    !response.ok
    || document?.ok !== true
    || evidence.releaseChannel !== "preview"
    || (
      options.expectedSourceSha
      && evidence.sourceSha !== options.expectedSourceSha
    )
  ) {
    fail(`Preview release identity failed: ${JSON.stringify(evidence)}`);
  }
  return evidence;
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
  const release = await readRelease(options);
  const idToken = await firebaseIdToken(options);
  const watch = await readWatch(options, idToken);
  const { state, selectedClip, clips } = assertRehearsalState(watch);
  const media = await verifyProtectedMedia(options, idToken, clips);
  const value = {
    schema: "quipsly-hgo-native-watch-read-only-proof-v2",
    auditedAt: new Date().toISOString(),
    mode: "read-only",
    baseUrl: options.baseUrl,
    hostEmailDigest: createHash("sha256")
      .update(options.hostEmail)
      .digest("hex"),
    projectSlug: options.projectSlug,
    episodeSlug: options.episodeSlug,
    release,
    watch: {
      outsiderStatus: watch.outsiderStatus,
      outsiderDenied: watch.outsiderDenied,
      authenticatedStatus: watch.authenticatedStatus,
      roundTripMilliseconds: watch.roundTripMilliseconds,
      ...state,
    },
    leadMedia:
      media.find((entry) => entry.title === clean(selectedClip?.title))
      ?? null,
    protectedMedia: media,
    safety: {
      methodsUsed: ["GET"],
      databaseAccessedDirectly: false,
      roomMutated: false,
      consentMutated: false,
      recordingStarted: false,
      providerJoined: false,
      credentialsPrinted: false,
    },
    passed: true,
  };
  await writeReceipt(options.outputPath, value);
}

export {
  assertRehearsalState,
  expectedMediaForClip,
  parseArguments,
  readRelease,
  readWatch,
  verifyProtectedMedia,
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
