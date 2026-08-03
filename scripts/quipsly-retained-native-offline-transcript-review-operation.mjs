#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  cloneRetainedFixture,
  COACH_EMAIL,
  KEYCHAIN_SERVICE,
} from "./quipsly-retained-native-reviewed-packet-materialization-operation.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(value) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(value);
}

function requireLoopbackOrigin(value) {
  const url = new URL(String(value || ""));
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password,
    "Offline transcript review operation requires a credential-free loopback Nest origin.",
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol)
      && loopbackHost(url.hostname)
      && url.pathname !== "/",
    "Offline transcript review operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

async function main() {
  assert(
    process.env.QUIPSLY_RETAINED_OFFLINE_TRANSCRIPT_REVIEW_OPERATION === "1",
    "Set QUIPSLY_RETAINED_OFFLINE_TRANSCRIPT_REVIEW_OPERATION=1 to authorize retained local test artifacts.",
  );
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: COACH_EMAIL,
  });
  assert(password, "The retained coach has no Keychain password.");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
  try {
    const fixture = await cloneRetainedFixture(prisma);
    const [confirmationSegmentID, correctionSegmentID] = fixture.goalSegmentIDs;
    assert(
      confirmationSegmentID && correctionSegmentID && confirmationSegmentID !== correctionSegmentID,
      "The retained fixture did not provide two distinct transcript segments.",
    );
    const beforeSegments = await prisma.transcriptSegment.findMany({
      where: { id: { in: [confirmationSegmentID, correctionSegmentID] } },
      orderBy: { startSeconds: "asc" },
    });
    assert(beforeSegments.length === 2, "The exact offline-review segments are unavailable.");
    const initialDecisionState = await Promise.all([
      prisma.transcriptSegmentVerification.count({ where: { roomId: fixture.roomID } }),
      prisma.transcriptCorrection.count({ where: { roomId: fixture.roomID } }),
    ]);
    assert(
      initialDecisionState[0] === 0 && initialDecisionState[1] === 0,
      "The fresh offline-review fixture must begin without transcript decisions.",
    );

    const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const phoneCorrectionText = `Offline phone-reviewed wording ${stamp}`;
    const conflictCorrectionText = `Concurrent Nest-reviewed wording ${stamp}`;
    const localRecordingID = randomUUID();
    const resultBundle = `/private/tmp/quipsly-offline-transcript-review-${stamp}-${process.pid}.xcresult`;
    const operation = spawnSync("bash", [RUNNER], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-review-offline-reconcile",
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
        QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS: [
          confirmationSegmentID,
          correctionSegmentID,
        ].join(","),
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_PHONE_CORRECTION_TEXT: phoneCorrectionText,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_CONFLICT_CORRECTION_TEXT: conflictCorrectionText,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PATH: fixture.sourcePath,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_LOCAL_ID: localRecordingID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ASSET_ID: fixture.assetID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ROOM_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PARTICIPANT_ID: fixture.participantID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_CONSENT_ID: fixture.consentID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_OWNER_ACCOUNT_ID: fixture.coachUserID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_SHA256: fixture.sourceSHA256,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
        QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS: "1200",
      },
      stdio: "inherit",
    });
    assert(
      operation.status === 0,
      `Compiled Capture offline transcript operation failed (exit ${String(operation.status)}).`,
    );

    const [verifications, corrections, afterSegments, tasks, goals, notes, calendarLinks] = await Promise.all([
      prisma.transcriptSegmentVerification.findMany({ where: { roomId: fixture.roomID } }),
      prisma.transcriptCorrection.findMany({
        where: { roomId: fixture.roomID },
        include: { revisions: { orderBy: { revision: "asc" } } },
      }),
      prisma.transcriptSegment.findMany({
        where: { id: { in: [confirmationSegmentID, correctionSegmentID] } },
        orderBy: { startSeconds: "asc" },
      }),
      prisma.actionItem.findMany({ where: { roomId: fixture.roomID } }),
      prisma.goal.findMany({ where: { roomId: fixture.roomID } }),
      prisma.coachingNote.findMany({ where: { roomId: fixture.roomID } }),
      prisma.calendarEventLink.findMany({ where: { roomId: fixture.roomID } }),
    ]);
    const confirmationSegment = afterSegments.find((segment) => segment.id === confirmationSegmentID);
    const confirmation = verifications.find(
      (verification) => verification.segmentId === confirmationSegmentID,
    );
    assert(
      verifications.length === 1
        && confirmationSegment
        && confirmation?.reviewKind === "confirmed-as-is"
        && confirmation.recordingAssetId === fixture.assetID
        && confirmation.playbackPositionSeconds >= confirmationSegment.endSeconds - 0.25,
      "The unchanged offline decision did not reconcile to one exact playback verification.",
    );
    assert(
      corrections.length === 1
        && corrections[0].segmentId === correctionSegmentID
        && corrections[0].origin === "human"
        && corrections[0].status === "accepted"
        && corrections[0].correctedText === conflictCorrectionText
        && corrections[0].correctedText !== phoneCorrectionText
        && corrections[0].revisions.length === 1,
      "The concurrent canonical overlay or held phone-decision boundary is incorrect.",
    );
    assert(
      afterSegments.every((segment, index) => segment.text === beforeSegments[index].text),
      "Transcript review must preserve immutable provider segment text.",
    );
    assert(
      tasks.length === 0
        && goals.length === 0
        && notes.length === 0
        && calendarLinks.length === 0,
      "Offline transcript review must not create work, notes, or calendar placement.",
    );
    await stat(resultBundle);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      compiledIPhoneOperation: true,
      protectedOfflineShellUsed: true,
      processDeathRecovery: true,
      exactSourcePlayback: true,
      reconciledAsIsVerification: confirmation.id,
      heldStaleOverlayDecision: true,
      canonicalConcurrentCorrection: corrections[0].id,
      providerSegmentsImmutable: true,
      canonicalMaterialization: { notes: 0, tasks: 0, goals: 0, calendarLinks: 0 },
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      sourceSHA256: fixture.sourceSHA256,
      resultBundle,
      credentialsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
