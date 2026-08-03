#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const ROOM_ID = "qa-retained-coaching-next-session-20260807";
const ROOM_TITLE = "QA Retained · Coaching continuity Session 2";
const EXPECTED_SOURCE_TEXT = "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackOrigin(value, label) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
  assert(url.protocol === "http:", `${label} requires loopback HTTP.`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    `${label} refuses a non-loopback origin.`,
  );
  return url.origin;
}

async function authenticate({ email, password }) {
  const authOrigin = requireLoopbackOrigin(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
    "Native retained transcript packet auth",
  );
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json().catch(() => null);
  assert(
    response.status === 200 && typeof body?.idToken === "string",
    "The retained coach could not authenticate with the local Firebase emulator.",
  );
  return body.idToken;
}

function packetEvidence(body) {
  const packet = body?.packet;
  assert(body?.ok === true && packet, "Nest did not return the canonical transcript packet.");
  assert(body?.boundaries?.sideEffectFreeRead === true, "Packet GET lost its side-effect-free read boundary.");
  assert(packet?.status === "READY_FOR_REVIEW", "The retained packet is not ready for review.");
  assert(packet?.summary?.source?.packetTemplateVersion === "quipsly-session-packet-v4", "The retained packet is not v4.");

  const notes = Array.isArray(packet.noteCandidates) ? packet.noteCandidates : [];
  const actions = Array.isArray(packet.actionCandidates) ? packet.actionCandidates : [];
  const goals = Array.isArray(packet.goalCandidates) ? packet.goalCandidates : [];
  const completeGoal = goals.find((candidate) => candidate?.sourceText === EXPECTED_SOURCE_TEXT);
  assert(completeGoal, "The v4 packet lost the expected complete goal thought.");
  assert(completeGoal.segmentIds?.length === 3, "The expected goal is not anchored to three transcript segments.");
  assert(completeGoal.sourceSpan?.segments?.length === 3, "The expected goal lost its immutable source-span receipt.");
  assert(completeGoal.committedGoalId == null, "The retained review candidate unexpectedly became a canonical goal.");
  assert(notes.every((candidate) => candidate?.committedNoteId == null), "A packet note candidate unexpectedly became a canonical note.");
  assert(actions.every((candidate) => candidate?.committedActionItemId == null), "A packet action candidate unexpectedly became canonical work.");

  const reviewProjection = {
    packetBuildId: packet?.build?.packetBuildId ?? null,
    summaryId: packet?.summary?.id ?? null,
    notes: notes.map((candidate) => ({
      id: candidate?.id ?? null,
      reviewStatus: candidate?.laneStatus ?? null,
      committedNoteId: candidate?.committedNoteId ?? null,
      segmentIds: candidate?.segmentIds ?? [],
      sourceTextSha256: candidate?.sourceTextSha256 ?? null,
    })),
    actions: actions.map((candidate) => ({
      id: candidate?.id ?? null,
      reviewStatus: candidate?.reviewStatus ?? null,
      committedActionItemId: candidate?.committedActionItemId ?? null,
      segmentIds: candidate?.segmentIds ?? [],
      sourceTextSha256: candidate?.sourceTextSha256 ?? null,
    })),
    goals: goals.map((candidate) => ({
      id: candidate?.id ?? null,
      reviewStatus: candidate?.reviewStatus ?? null,
      committedGoalId: candidate?.committedGoalId ?? null,
      segmentIds: candidate?.segmentIds ?? [],
      sourceTextSha256: candidate?.sourceTextSha256 ?? null,
    })),
  };
  return {
    ...reviewProjection,
    digest: createHash("sha256").update(JSON.stringify(reviewProjection)).digest("hex"),
    candidateCounts: {
      notes: notes.length,
      actions: actions.length,
      goals: goals.length,
    },
    completeGoalCandidateId: completeGoal.id,
    completeGoalSegmentCount: completeGoal.segmentIds.length,
  };
}

async function readPacket({ baseURL, idToken }) {
  const url = new URL("/api/mobile/capture/transcripts/packet", baseURL);
  url.searchParams.set("callRoomId", ROOM_ID);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${idToken}`, "cache-control": "no-cache" },
  });
  const body = await response.json().catch(() => null);
  assert(response.status === 200, `Packet read failed with HTTP ${response.status}.`);
  return packetEvidence(body);
}

function parseArguments(args) {
  const result = { help: false, resultBundle: "" };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--help" || item === "-h") result.help = true;
    else if (item === "--result-bundle") result.resultBundle = args[++index] || "";
    else throw new Error(`Unknown argument: ${item}`);
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:native-transcript-packet

Operates the compiled Capture app against the retained local v4 transcript
packet, preserves the xcresult below /private/tmp, and proves the read-only
review left every packet candidate and canonical-work boundary unchanged.`);
    return;
  }
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "Native retained transcript packet operation",
  );
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert(password, "The retained coach has no Keychain password.");
  const idToken = await authenticate({ email: COACH_EMAIL, password });
  const before = await readPacket({ baseURL, idToken });
  const resultBundle = path.resolve(
    options.resultBundle
      || `/private/tmp/quipsly-retained-native-transcript-packet-${Date.now()}-${process.pid}.xcresult`,
  );
  assert(resultBundle.startsWith("/private/tmp/"), "Result bundle must remain below /private/tmp.");

  const result = spawnSync("bash", [RUNNER], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-span",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: ROOM_ID,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: ROOM_TITLE,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(result.status === 0, `Compiled Capture packet review failed (exit ${String(result.status)}).`);

  const after = await readPacket({ baseURL, idToken });
  assert(after.digest === before.digest, "Native packet review changed authoritative candidate or review state.");
  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    retained: true,
    compiledCaptureOperation: true,
    roomID: ROOM_ID,
    packetBuildID: after.packetBuildId,
    candidateCounts: after.candidateCounts,
    completeGoalCandidateID: after.completeGoalCandidateId,
    completeGoalSegmentCount: after.completeGoalSegmentCount,
    authoritativeDigestBefore: before.digest,
    authoritativeDigestAfter: after.digest,
    canonicalCandidateMaterialization: { notes: 0, tasks: 0, goals: 0 },
    resultBundle,
    screenshotPreserved: true,
    credentialsPrinted: false,
    externalSideEffects: false,
  }, null, 2));
}

await main();
