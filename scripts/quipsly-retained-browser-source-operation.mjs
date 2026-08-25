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
const canonicalRoom = await prisma.callRoom.findUniqueOrThrow({
  where: { id: roomId },
  select: { id: true, projectId: true, captureGroupId: true },
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
    const browserEntry = page
      .getByRole("button", {
        name: /^(?:Open call lobby|Join in browser|Join call)$/,
      })
      .filter({ visible: true })
      .first();
    await browserEntry.waitFor();
    await browserEntry.click();
    await liveDock.waitFor();
  }
  const deviceSettings = liveDock.getByTestId("call-device-settings");
  await deviceSettings.getByText("Audio and video settings", { exact: true }).click();
  const allowMicrophone = deviceSettings.getByRole("button", {
    name: /^Allow microphone(?: and camera)?$/,
  });
  const allowMicrophoneVisible = await allowMicrophone
    .isVisible()
    .catch(() => false);
  if (allowMicrophoneVisible) {
    await allowMicrophone.click();
  }
  const microphone = deviceSettings.locator("select").first();
  await microphone.waitFor({ state: "visible" });
  await microphone.selectOption({ index: 1 }, { timeout: 30_000 }).catch(
    async () => {
      throw new Error(
        `No synthetic microphone appeared after preflight permission. ${JSON.stringify({
          allowMicrophoneVisible,
          allowMicrophoneCount: await allowMicrophone.count(),
          callStatus: await liveDock
            .getByTestId("call-status-message")
            .textContent()
            .catch(() => null),
          deviceSettings: await deviceSettings.innerText(),
        })}`,
      );
    },
  );
  await deviceSettings.getByRole("button", { name: "Test selected setup" }).click();
  await page
    .getByText(
      /Selected setup is ready|Live input is ready|Microphone names are visible/i,
    )
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await liveDock.getByRole("button", { name: "Join call" }).click();
  const connectedCallControl = liveDock.getByRole("button", {
    name: /^(?:Mute|Unmute)$/,
  });
  const localRecordingFallback = liveDock.getByRole("region", {
    name: "Local recording fallback",
  });
  await Promise.race([
    connectedCallControl.waitFor({ timeout: 30_000 }),
    localRecordingFallback.waitFor({ timeout: 30_000 }),
  ]).catch(async () => {
      throw new Error(
        `The rendered browser call did not connect. ${JSON.stringify({
          callStatus: await liveDock
            .getByTestId("call-status-message")
            .textContent()
            .catch(() => null),
          liveDock: await liveDock.innerText(),
        })}`,
      );
  });
  const liveCallConnected = await connectedCallControl
    .isVisible()
    .catch(() => false);
  const localRecordingFallbackUsed = await localRecordingFallback
    .isVisible()
    .catch(() => false);
  if (!liveCallConnected && !localRecordingFallbackUsed) {
    throw new Error("Neither a connected call nor the local recording fallback became available.");
  }

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
  const allowRecording = recorder.getByRole("button", {
    name: "Allow recording",
  });
  let explicitConsentActionPerformed = false;
  if (await allowRecording.isVisible().catch(() => false)) {
    const consentDeadline = Date.now() + 30_000;
    while (
      Date.now() < consentDeadline &&
      (await allowRecording.isVisible().catch(() => false))
    ) {
      if (await allowRecording.isEnabled().catch(() => false)) {
        await allowRecording.click();
        explicitConsentActionPerformed = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    if (
      (await allowRecording.isVisible().catch(() => false)) &&
      !(await allowRecording.isEnabled().catch(() => false))
    ) {
      throw new Error(
        `Recording consent never became actionable: ${await recorder.innerText()}`,
      );
    }
  }

  const recordButton = recorder.getByRole("button", {
    name: "Record",
  });
  await recordButton.waitFor();
  if (!(await recordButton.isEnabled())) {
    throw new Error(
      `The rendered record action stayed held: ${await recorder.getByRole("status").innerText()}`,
    );
  }
  await recordButton.click();
  const stopButton = recorder.getByRole("button", {
    name: "Stop recording",
  });
  await stopButton.waitFor({ timeout: 30_000 }).catch(async () => {
    throw new Error(
      `The retained source did not enter recording: ${await recorder.getByRole("status").first().innerText()}`,
    );
  });
  await page.waitForTimeout(8_000);
  await stopButton.click();
  await recorder
    .getByText(/Recording saved(?: and verified in Quipsly|\. Quipsly is preparing it for reliable playback)/i)
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
      durationSeconds: true,
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
    recording.byteSize <= 0 ||
    !recording.durationSeconds ||
    recording.durationSeconds <= 0
  ) {
    throw new Error(
      `Canonical recording verification failed: ${JSON.stringify(recording)}`,
    );
  }
  const finalization = await prisma.mobileCaptureFinalizationReceipt.findFirst({
    where: { roomId, recordingAssetId: recording.id },
    orderBy: { updatedAt: "desc" },
    select: {
      uploadSessionId: true,
      captureId: true,
      startReceiptId: true,
      processingDisposition: true,
      transcriptDisposition: true,
      sourceId: true,
      mediaAssetId: true,
      transcriptJobId: true,
      metadataJson: true,
    },
  });
  if (
    !finalization ||
    finalization.processingDisposition !== "RELEASED" ||
    finalization.transcriptDisposition !== "RELEASED" ||
    !finalization.startReceiptId ||
    !finalization.sourceId ||
    !finalization.mediaAssetId ||
    !finalization.transcriptJobId
  ) {
    throw new Error(
      `Canonical finalization and release failed: ${JSON.stringify(finalization)}`,
    );
  }
  const [studioSource, studioAsset, studioAttachments] = await Promise.all([
    prisma.studioVideoSource.findUnique({
      where: { id: finalization.sourceId },
      select: { id: true, provider: true, url: true },
    }),
    prisma.studioMediaAsset.findUnique({
      where: { id: finalization.mediaAssetId },
      select: {
        id: true,
        filename: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        rawAssetId: true,
        cloudProvider: true,
      },
    }),
    prisma.studioAssetAttachment.findMany({
      where: { assetId: finalization.mediaAssetId },
      select: { projectId: true, role: true, source: true, metadataJson: true },
    }),
  ]);
  const projectAttachment = studioAttachments.find(
    (attachment) => attachment.projectId === canonicalRoom.projectId,
  );
  if (
    !studioSource ||
    studioSource.provider !== "capture-recording" ||
    !studioAsset ||
    studioAsset.rawAssetId !== studioSource.id ||
    studioAsset.sizeBytes !== recording.byteSize ||
    !projectAttachment ||
    projectAttachment.source !== "mobile-capture-finalization"
  ) {
    throw new Error(
      `Automatic Studio materialization failed: ${JSON.stringify(
        { studioSource, studioAsset, studioAttachments },
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
      )}`,
    );
  }

  const verifiedSize = Number(recording.byteSize);
  const playbackURL = `${baseURL}/api/sessions/${encodeURIComponent(roomId)}/recordings/${encodeURIComponent(recording.id)}/media`;
  const playbackWindows = [
    { label: "beginning", start: 0, end: Math.min(verifiedSize - 1, 4095) },
    {
      label: "middle",
      start: Math.max(0, Math.floor(verifiedSize / 2) - 2048),
      end: Math.min(verifiedSize - 1, Math.floor(verifiedSize / 2) + 2047),
    },
    {
      label: "ending",
      start: Math.max(0, verifiedSize - 4096),
      end: verifiedSize - 1,
    },
  ];
  const playbackEvidence = [];
  for (const window of playbackWindows) {
    const response = await page.request.get(playbackURL, {
      headers: { Range: `bytes=${window.start}-${window.end}` },
    });
    const headers = response.headers();
    const body = await response.body();
    const expectedLength = window.end - window.start + 1;
    if (
      response.status() !== 206 ||
      body.byteLength !== expectedLength ||
      headers["content-range"] !==
        `bytes ${window.start}-${window.end}/${verifiedSize}` ||
      headers["x-quipsly-verified-bytes"] !== String(verifiedSize) ||
      headers.etag !== `"sha256-${recording.checksum}"`
    ) {
      throw new Error(
        `Authenticated ${window.label} playback failed: ${JSON.stringify({
          status: response.status(),
          bodyBytes: body.byteLength,
          headers,
        })}`,
      );
    }
    playbackEvidence.push({
      label: window.label,
      status: response.status(),
      contentRange: headers["content-range"],
      byteLength: body.byteLength,
    });
  }

  let transcript = await prisma.transcriptJob.findUnique({
    where: { id: finalization.transcriptJobId },
    select: {
      id: true,
      status: true,
      provider: true,
      sourceGeneration: true,
      sourceSha256: true,
      errorMessage: true,
      _count: { select: { segments: true } },
    },
  });
  const transcriptDeadline = Date.now() + 90_000;
  while (
    transcript &&
    !["COMPLETED", "FAILED", "CANCELED"].includes(transcript.status) &&
    Date.now() < transcriptDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    transcript = await prisma.transcriptJob.findUnique({
      where: { id: finalization.transcriptJobId },
      select: {
        id: true,
        status: true,
        provider: true,
        sourceGeneration: true,
        sourceSha256: true,
        errorMessage: true,
        _count: { select: { segments: true } },
      },
    });
  }
  if (
    !transcript ||
    transcript.status !== "COMPLETED" ||
    transcript.sourceSha256 !== recording.checksum ||
    transcript._count.segments < 1
  ) {
    throw new Error(
      `Source-bound transcript did not complete: ${JSON.stringify(transcript)}`,
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
          durationSeconds: recording.durationSeconds,
          durationEvidence: manifest.durationEvidence ?? null,
          transcriptJobs: recording.transcriptJobs,
        },
        materialization: {
          uploadSessionId: finalization.uploadSessionId,
          startReceiptId: finalization.startReceiptId,
          sourceId: studioSource.id,
          mediaAssetId: studioAsset.id,
          projectAttachment: {
            projectId: projectAttachment.projectId,
            role: projectAttachment.role,
            source: projectAttachment.source,
          },
          playbackEvidence,
          transcript,
        },
        operated: {
          ordinaryLogin: true,
          devicePermission: true,
          selectedSetupPreview: true,
          liveCallConnected,
          localRecordingFallbackUsed,
          explicitConsentActionPerformed,
          currentConsentReadback: true,
          explicitRecordAndStop: true,
          opfsLocalRetention: true,
          resumableUploadAndVerification: true,
          canonicalReadback: true,
          automaticStudioMaterialization: true,
          authenticatedRangedPlayback: true,
          sourceBoundTranscription: true,
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
