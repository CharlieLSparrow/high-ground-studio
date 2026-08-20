#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  assertNoHorizontalOverflow,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

if (process.env.QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION !== "1") {
  throw new Error(
    "Set QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION=1 to authorize this retained local-media regression.",
  );
}

const baseURL = new URL(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
).origin;
if (
  !baseURL.startsWith("http://127.0.0.1:") &&
  !baseURL.startsWith("http://localhost:")
) {
  throw new Error("The retained browser-source operation is loopback-only.");
}

const roomId = "retained-coaching-follow-up-20260731";
const email = "quipsly-coach-retained-20260731@example.test";
const password = `Qp-${randomBytes(18).toString("base64url")}!26`;
const authEmulatorHost =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.GCLOUD_PROJECT = "quipsly-reef";
process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
process.env.DATABASE_URL =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";

const fixtureDirectory = await mkdtemp(
  path.join(tmpdir(), "quipsly-browser-source-"),
);
const fakeAudioPath = path.join(fixtureDirectory, "coaching-rehearsal.wav");
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:sample_rate=48000:duration=14",
    "-af",
    "volume=0.08",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    fakeAudioPath,
  ],
  { stdio: "inherit" },
);

const firebaseApp = initializeApp(
  { projectId: "quipsly-reef" },
  `retained-browser-source-${Date.now()}`,
);
const auth = getAuth(firebaseApp);
const firebaseUser = await auth.getUserByEmail(email);
await auth.updateUser(firebaseUser.uid, {
  password,
  emailVerified: true,
  disabled: false,
});

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const actor = await prisma.user.findUniqueOrThrow({
  where: { primaryEmail: email },
  select: { id: true },
});
const participant = await prisma.callParticipant.findFirstOrThrow({
  where: { roomId, userId: actor.id, accessStatus: "ACTIVE" },
  select: { id: true },
});

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${fakeAudioPath}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const startedAfter = new Date();
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity: { role: "retained coaching browser source", email },
    password,
    callbackPath: `/sessions/${roomId}?mode=live`,
  });

  await page
    .getByRole("heading", { name: "Retained coaching follow-up rehearsal" })
    .waitFor();
  const liveDock = page.locator('aside[aria-label$="live call dock"]');
  await liveDock.waitFor({ timeout: 3_000 }).catch(() => undefined);
  if (!(await liveDock.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Open mic, camera & call" }).click();
    await liveDock.waitFor();
  }
  await page.getByRole("button", { name: "Allow microphone" }).click();
  const microphone = page.locator("select").filter({
    has: page.locator('option[value=""]', { hasText: "Choose a microphone" }),
  });
  await microphone
    .locator('option:not([value=""])')
    .first()
    .waitFor({ state: "attached" });
  if (!(await microphone.inputValue())) {
    const firstMicrophone = await microphone
      .locator('option:not([value=""])')
      .first()
      .getAttribute("value");
    if (!firstMicrophone)
      throw new Error("No synthetic microphone was exposed.");
    await microphone.selectOption(firstMicrophone);
  }
  await page.getByRole("button", { name: "Test selected setup" }).click();
  await page
    .getByText(
      /Selected setup is ready|Live input is ready|Microphone names are visible/i,
    )
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);

  const recorder = page.getByRole("region", {
    name: /Record (?:this coaching Session|the selected studio source)/,
  });
  await recorder.waitFor();
  const reopenButton = recorder.getByRole("button", {
    name: "Reopen Session to record",
  });
  if (await reopenButton.isVisible().catch(() => false)) {
    await reopenButton.click();
    await recorder.getByText(/Session reopened/i).waitFor({ timeout: 20_000 });
  }
  await recorder.getByLabel(/I am monitoring through headphones/).check();
  await recorder
    .getByLabel(/Every audible participant was notified and agreed/)
    .check();
  await recorder.getByLabel(/I separately agree to transcription/).check();
  await recorder
    .getByRole("button", { name: "Save my consent receipt" })
    .click();
  await recorder
    .getByText(
      /All currently signed-in participants are ready|receipt is saved/i,
    )
    .waitFor({ timeout: 20_000 });

  const recordButton = recorder.getByRole("button", {
    name: /Record (?:on this device|local source)/,
  });
  await recordButton.waitFor();
  if (!(await recordButton.isEnabled())) {
    throw new Error(
      `The rendered record action stayed held: ${await recorder.getByRole("status").innerText()}`,
    );
  }
  await recordButton.click();
  const stopButton = recorder.getByRole("button", {
    name: "Stop local source",
  });
  await stopButton.waitFor({ timeout: 30_000 }).catch(async () => {
    throw new Error(
      `The retained source did not enter recording: ${await recorder.getByRole("status").first().innerText()}`,
    );
  });
  await page.waitForTimeout(8_000);
  await stopButton.click();
  await recorder
    .getByText(/Source uploaded|verified editor evidence/i)
    .first()
    .waitFor({ timeout: 90_000 });

  const recording = await prisma.recordingAsset.findFirst({
    where: {
      roomId,
      participantId: participant.id,
      createdAt: { gte: startedAfter },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      byteSize: true,
      checksum: true,
      verifiedAt: true,
      recordedStartedAt: true,
      recordedStoppedAt: true,
      localManifestJson: true,
      transcriptJobs: {
        select: { id: true, status: true },
      },
    },
  });
  if (
    !recording ||
    recording.status !== "VERIFIED" ||
    !recording.checksum ||
    !recording.verifiedAt ||
    !recording.byteSize ||
    recording.byteSize <= 0
  ) {
    throw new Error(
      `Canonical recording verification failed: ${JSON.stringify(recording)}`,
    );
  }
  const manifest =
    recording.localManifestJson &&
    typeof recording.localManifestJson === "object" &&
    !Array.isArray(recording.localManifestJson)
      ? recording.localManifestJson
      : {};
  await assertNoHorizontalOverflow(
    page.getByRole("main").last(),
    "retained browser-source Session",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        testLane: "retained-regression",
        humanAcceptanceSatisfied: false,
        fixtureIdentifiersUsed: true,
        syntheticMedia: true,
        externalSideEffects: false,
        roomId,
        recording: {
          id: recording.id,
          captureId: manifest.captureId ?? null,
          captureGroupId: manifest.captureGroupId ?? null,
          fileName: recording.fileName,
          status: recording.status,
          byteSize: recording.byteSize.toString(),
          checksum: recording.checksum,
          verifiedAt: recording.verifiedAt.toISOString(),
          recordedStartedAt: recording.recordedStartedAt?.toISOString() ?? null,
          recordedStoppedAt: recording.recordedStoppedAt?.toISOString() ?? null,
          transcriptJobs: recording.transcriptJobs,
        },
        operated: {
          ordinaryLogin: true,
          devicePermission: true,
          selectedSetupPreview: true,
          explicitConsent: true,
          explicitRecordAndStop: true,
          opfsLocalRetention: true,
          resumableUploadAndVerification: true,
          canonicalReadback: true,
        },
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
  await prisma.$disconnect();
  await deleteApp(firebaseApp);
  await rm(fixtureDirectory, { recursive: true, force: true });
}
