#!/usr/bin/env node

import { createRequire } from "node:module";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { deleteApp, initializeApp } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTANCE_ROOT = path.join(REPO_ROOT, "artifacts", "coaching-acceptance");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForVisibleState(states, timeoutMs, failureMessage) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const state of states) {
      if (await state.locator.isVisible().catch(() => false)) return state.name;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(failureMessage);
}

function checkpoint(message) {
  process.stderr.write(`[fresh Session audio polish] ${message}\n`);
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname),
    "Fresh Session audio polish refuses a non-local PostgreSQL database.",
  );
  return url.toString();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function contextArgument() {
  const index = process.argv.indexOf("--context");
  if (index < 0) return null;
  const value = process.argv[index + 1];
  assert(value && !value.startsWith("--"), "--context requires a JSON path.");
  return path.resolve(value);
}

async function latestFreshContext() {
  const candidates = [];
  for (const entry of await readdir(ACCEPTANCE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(ACCEPTANCE_ROOT, entry.name, "fresh-start-context.json");
    try {
      const info = await stat(candidate);
      candidates.push({ candidate, modifiedAt: info.mtimeMs });
    } catch {}
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  assert(candidates.length > 0, "No fresh coaching context is available. Run pnpm quipsly:fresh:coaching-flight first.");
  return candidates[0].candidate;
}

async function loadContext() {
  const contextPath = contextArgument()
    || text(process.env.QUIPSLY_COACHING_ACCEPTANCE_CONTEXT)
    || await latestFreshContext();
  const resolved = path.resolve(contextPath);
  assert(
    resolved.startsWith(`${ACCEPTANCE_ROOT}${path.sep}`),
    "Fresh Session audio polish only accepts a context below artifacts/coaching-acceptance.",
  );
  const context = JSON.parse(await readFile(resolved, "utf8"));
  assert(context?.schema === "quipsly-fresh-coaching-acceptance-context-v1", "Fresh coaching context schema is invalid.");
  assert(typeof context.roomId === "string" && context.roomId, "Fresh coaching context has no Session room.");
  assert(typeof context.keychainService === "string" && context.keychainService, "Fresh coaching context has no credential service.");
  assert(context.identities?.coach?.email?.endsWith(".test"), "Fresh coaching context has no reserved coach identity.");
  return { context, contextPath: resolved };
}

async function restoreFreshCoachAuth(context, password) {
  const host = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099");
  const emulator = new URL(`http://${host}`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(emulator.hostname) && Boolean(emulator.port),
    "Fresh Session audio polish requires the loopback Firebase Auth emulator.",
  );
  process.env.FIREBASE_AUTH_EMULATOR_HOST = emulator.host;
  const identity = context.identities.coach;
  const firebaseProject = text(process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT)
    || text(process.env.FIREBASE_PROJECT_ID)
    || "quipsly-reef";
  assert(/^[a-z][a-z0-9-]{4,60}$/.test(firebaseProject), "Fresh Session audio polish Firebase project is invalid.");
  const app = initializeApp({ projectId: firebaseProject }, `fresh-session-audio-polish-${Date.now()}`);
  try {
    const auth = getAuth(app);
    const fields = {
      email: identity.email,
      password,
      displayName: identity.displayName,
      emailVerified: true,
      disabled: false,
    };
    const current = await auth.getUser(identity.firebaseUid).catch((error) => {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    });
    if (current) {
      await auth.updateUser(identity.firebaseUid, fields);
      return;
    }
    const conflict = await auth.getUserByEmail(identity.email).catch((error) => {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    });
    if (conflict && conflict.uid !== identity.firebaseUid) await auth.deleteUser(conflict.uid);
    await auth.createUser({ uid: identity.firebaseUid, ...fields });
  } finally {
    await deleteApp(app);
  }
}

function sourceCoordinates(recording) {
  const promotion = object(object(recording.localManifestJson).promotion);
  const projectId = text(promotion.projectId);
  const projectSlug = text(promotion.nestSlug);
  const mediaAssetId = text(promotion.mediaAssetId);
  const sourceId = text(promotion.sourceId);
  const playbackUrl = text(promotion.playbackUrl);
  if (!projectId || !projectSlug || !mediaAssetId || !sourceId || playbackUrl !== `/api/ingest/media/${sourceId}`) return null;
  return { projectId, projectSlug, mediaAssetId, sourceId, playbackUrl };
}

async function sourceSnapshot(prisma, roomId) {
  const recordings = await prisma.recordingAsset.findMany({
    where: { roomId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      roomId: true,
      kind: true,
      status: true,
      fileName: true,
      contentType: true,
      byteSize: true,
      durationSeconds: true,
      storageBucket: true,
      storageObjectPath: true,
      checksum: true,
      verifiedAt: true,
      recordedStartedAt: true,
      recordedStoppedAt: true,
      localManifestJson: true,
    },
  });
  const promoted = recordings
    .map((recording) => ({ recording, coordinates: sourceCoordinates(recording) }))
    .filter((entry) => entry.coordinates);
  assert(promoted.length > 0, "The fresh Session has no canonical audio-polish source coordinates.");
  const assets = await prisma.studioMediaAsset.findMany({
    where: { id: { in: promoted.map((entry) => entry.coordinates.mediaAssetId) } },
    select: {
      id: true,
      filename: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      duration: true,
      resolution: true,
      fps: true,
      cloudProvider: true,
      isProxy: true,
      rawAssetId: true,
    },
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return promoted.map(({ recording, coordinates }) => {
    const asset = assetById.get(coordinates.mediaAssetId);
    assert(asset, `Canonical media asset ${coordinates.mediaAssetId} is missing.`);
    return stable({ recording, coordinates, asset });
  });
}

async function masteryJobs(prisma, projectId, assetId) {
  return stable(await prisma.studioAssetProcessingJob.findMany({
    where: { projectId, assetId, type: "audio-mastery" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      projectId: true,
      assetId: true,
      type: true,
      status: true,
      inputJson: true,
      resultJson: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  }));
}

async function operateRenderedSession({ baseURL, context, password }) {
  const callbackPath = `/sessions/${encodeURIComponent(context.roomId)}?mode=recordings`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const browserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await browserContext.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    checkpoint("signing in as the fresh coach");
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "fresh-coach", email: context.identities.coach.email },
      password,
      callbackPath,
    });
    await page.getByRole("heading", { name: "Your recordings are safe and ready" }).waitFor({ timeout: 30_000 });
    const recordingSummary = page.locator(
      'section[aria-labelledby="session-finishing-cockpit-heading"]',
    );
    const recordingHeadline = recordingSummary.locator(
      "#session-finishing-cockpit-heading",
    );
    await recordingHeadline.waitFor({ timeout: 30_000 });
    const recordingHeadlineText = await recordingHeadline.innerText();
    checkpoint(`observed recording summary: ${recordingHeadlineText}`);
    const projectedSourceDetail = await recordingSummary
      .getByTestId("session-source-journey")
      .textContent()
      .catch(() => null);
    assert(
      recordingHeadlineText === "Recording protected",
      `Completed participant recordings did not resolve to a calm protected state: ${recordingHeadlineText}. Projection: ${String(projectedSourceDetail || "unavailable").replace(/\s+/g, " ").slice(0, 1600)}`,
    );
    await recordingSummary.getByText(/\d+ of \d+ participant-owned sources are verified, decoded, and ready/i).waitFor();
    const recordingReadiness = recordingSummary.locator(
      'dl[aria-label="Recording readiness"]',
    );
    await recordingReadiness.getByText("Sources", { exact: true }).waitFor();
    await recordingReadiness.getByText("Transcript", { exact: true }).waitFor();
    await recordingReadiness.getByText("Edit & share", { exact: true }).waitFor();
    const recordingDetails = recordingSummary.locator("details").first();
    assert(
      (await recordingDetails.getAttribute("open")) === null,
      "Production evidence expanded before the coach requested recording details.",
    );
    assert(
      !(await recordingSummary
        .getByRole("heading", { name: "What happened to each planned master" })
        .isVisible()
        .catch(() => false)),
      "Expert source-plan evidence was visible in the ordinary recording summary.",
    );
    await recordingSummary.getByText("Recording details", { exact: true }).click();
    await recordingSummary
      .getByRole("heading", { name: "What happened to each planned master" })
      .waitFor();
    const sourceRegion = page.locator('section[aria-labelledby="source-evidence-heading"]');
    try {
      await assertNoHorizontalOverflow(sourceRegion, "Session recording quality");
    } catch (error) {
      const overflow = await sourceRegion.evaluate((element) => Array.from(element.querySelectorAll("*")).flatMap((child) => {
        const node = child;
        if (node.scrollWidth <= node.clientWidth + 1) return [];
        return [{
          tag: node.tagName,
          className: String(node.className || "").slice(0, 240),
          text: String(node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240),
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }];
      }).slice(0, 12));
      throw new Error(`${error instanceof Error ? error.message : String(error)} Offenders: ${JSON.stringify(overflow)}`);
    }

    const polishCards = page.getByRole("region", { name: "Audio improvement" });
    const cardCount = await polishCards.count();
    assert(cardCount > 0, "No verified Session recording exposed the ordinary audio-quality check.");
    const card = polishCards.first();
    await card.getByText("Audio quality", { exact: true }).waitFor();
    await card.getByText(/original stays untouched/i).waitFor();
    await assertNoHorizontalOverflow(card, "Session audio quality");

    const improve = card.getByRole("button", { name: /^(Check audio now|Try again)$/ });
    const improving = card.getByRole("button", { name: "Improving audio…" });
    const readyComparison = card.getByText(/Ready to compare\. Quipsly has not replaced or published either version\./i);
    const auditionReady = card.getByText(/Your improved copy is ready\. Hear the same moment in both versions/i);
    const alreadyBalanced = card.getByText(/already meets Quipsly's spoken-word loudness target/i);
    await waitForVisibleState([
      { name: "action-required", locator: improve },
      { name: "automatic-processing", locator: improving },
      { name: "comparison", locator: readyComparison },
      { name: "audition", locator: auditionReady },
      { name: "balanced", locator: alreadyBalanced },
    ], 60_000, "Audio quality did not expose a truthful starting or completed state.");
    const canImprove = await improve.isVisible().catch(() => false);
    let initialState = "completed";
    if (canImprove) {
      initialState = "action-required";
      checkpoint("requesting one-step audio polish");
      await improve.click();
      await improve.waitFor({ state: "hidden", timeout: 15_000 });
    } else if (await improving.isVisible().catch(() => false)) {
      initialState = "automatic-processing";
      checkpoint("resuming an in-progress audio polish result");
    } else {
      checkpoint("rechecking an already-completed audio polish result");
    }

    const retry = card.getByRole("button", { name: "Try again" });
    const terminal = await waitForVisibleState([
      { name: "comparison", locator: readyComparison },
      { name: "audition", locator: auditionReady },
      { name: "balanced", locator: alreadyBalanced },
      { name: "failed", locator: retry },
    ], 120_000, "Audio polish never reached a visible completed or retry state.");
    if (terminal === "failed") {
      const reason = await card.getByText(/audio-mastery-|could not|did not finish/i).last().textContent().catch(() => null);
      throw new Error(`Audio polish reached a visible retry state instead of hiding the failure. ${reason || "No failure reason was rendered."}`);
    }
    const auditionAvailable = await auditionReady.isVisible().catch(() => false);
    const comparisonReady = auditionAvailable
      || (await readyComparison.count() > 0 && await readyComparison.isVisible().catch(() => false));
    const balanced = await alreadyBalanced.count() > 0 && await alreadyBalanced.isVisible().catch(() => false);
    assert(comparisonReady || balanced, "Audio polish never reached a calm terminal state.");

    let originalReadyState = null;
    let improvedReadyState = null;
    if (comparisonReady) {
      let media = card.locator("audio, video");
      let auditionDialog = null;
      if (auditionAvailable) {
        await card.getByRole("button", { name: "Compare original and improved", exact: true }).click();
        auditionDialog = page.getByRole("dialog", { name: "Original and improved" });
        await auditionDialog.waitFor({ state: "visible", timeout: 15_000 });
        media = auditionDialog.locator("audio");
      }
      assert(await media.count() === 2, "Completed Session audio polish did not expose original and improved playback together.");
      await media.nth(0).waitFor({ state: "attached", timeout: 30_000 });
      await media.nth(1).waitFor({ state: "attached", timeout: 30_000 });
      const mediaReadyDeadline = Date.now() + 30_000;
      while (Date.now() < mediaReadyDeadline) {
        const states = await Promise.all([
          media.nth(0).evaluate((element) => element.readyState),
          media.nth(1).evaluate((element) => element.readyState),
        ]);
        if (states.every((state) => state >= 1)) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      originalReadyState = await media.nth(0).evaluate((element) => element.readyState);
      improvedReadyState = await media.nth(1).evaluate((element) => element.readyState);
      assert(originalReadyState >= 1 && improvedReadyState >= 1, "Original and improved audio metadata did not load in the comparison.");
      if (auditionDialog) await auditionDialog.getByRole("button", { name: "Close", exact: true }).click();
    }

    checkpoint("operating transcript-first review and inline recording edits");
    await page.goto(
      `${baseURL}/sessions/${encodeURIComponent(context.roomId)}?mode=transcript`,
      { waitUntil: "domcontentloaded" },
    );
    const transcriptDesk = page.locator("#transcript-correction-review");
    const packetReview = page.locator("#review-material");
    await transcriptDesk
      .getByRole("heading", { name: "Edit the transcript", exact: true })
      .waitFor({ timeout: 30_000 });
    await packetReview.waitFor({ timeout: 30_000 });
    const transcriptBox = await transcriptDesk.boundingBox();
    const packetBox = await packetReview.boundingBox();
    assert(
      transcriptBox && packetBox && transcriptBox.y < packetBox.y,
      "Packet administration appeared before the ordinary transcript review surface.",
    );
    const editRecording = transcriptDesk.getByRole("button", {
      name: "Trim or cut recording",
      exact: true,
    });
    await editRecording.waitFor({ timeout: 30_000 });
    await editRecording.click();
    const inlineEditor = transcriptDesk.locator("#inline-recording-editor");
    await inlineEditor
      .getByRole("heading", { name: "Trim and share", exact: true })
      .waitFor({ timeout: 30_000 });
    assert(
      new URL(page.url()).searchParams.get("mode") === "transcript",
      "Opening the basic recording editor navigated away from the transcript workflow.",
    );
    await assertNoHorizontalOverflow(transcriptDesk, "Transcript-first Session review");

    const transcriptOnlyView = transcriptDesk.getByRole("button", {
      name: "Transcript",
      exact: true,
    });
    const recordingTranscriptView = transcriptDesk.getByRole("button", {
      name: "Recording + transcript",
      exact: true,
    });
    assert(
      await transcriptOnlyView.getAttribute("aria-pressed") === "true",
      "The ordinary transcript did not open in the familiar linear view.",
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await recordingTranscriptView.click();
    assert(
      await recordingTranscriptView.getAttribute("aria-pressed") === "true",
      "The recording-plus-transcript workspace did not become active.",
    );
    const recordingBox = await transcriptDesk
      .getByLabel("Protected session recording")
      .boundingBox();
    const firstPassageBox = await transcriptDesk
      .locator('[id^="transcript-segment-"]')
      .first()
      .boundingBox();
    assert(
      recordingBox && firstPassageBox && recordingBox.x < firstPassageBox.x,
      "The wide recording-plus-transcript workspace did not render side by side.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(transcriptDesk, "Responsive recording-plus-transcript review");

    const firstPassage = transcriptDesk
      .locator('[id^="transcript-segment-"]')
      .first();
    await firstPassage
      .getByRole("button", { name: "Edit transcript", exact: true })
      .click();
    await firstPassage
      .getByText(/Save directly, or play the passage first when the audio will help/i)
      .waitFor({ timeout: 15_000 });
    assert(
      await firstPassage.getByRole("checkbox", { name: /listened/i }).count() === 0,
      "Transcript correction still required a repeated manual playback attestation.",
    );
    await firstPassage
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    assert(browserErrors.length === 0, `Session audio polish raised browser exceptions: ${browserErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, "fresh-coach");
    return {
      cardCount,
      ordinaryOneStepActionRendered: true,
      initialState,
      actionOperated: canImprove,
      automaticProcessingResumed: initialState === "automatic-processing",
      completedStateRecognizedAtEntry: initialState === "completed",
      outcome: comparisonReady ? "improved-listening-copy" : "already-balanced",
      originalAndImprovedPlaybackRendered: comparisonReady,
      originalReadyState,
      improvedReadyState,
      originalUntouchedMessageRendered: true,
      automaticPublicationAbsentMessageRendered: comparisonReady,
      mobileViewportOperated: true,
      horizontalOverflow: false,
      browserExceptions: browserErrors.length,
      calmRecordingSummaryRendered: true,
      expertRecordingDetailsCollapsedByDefault: true,
      transcriptAppearedBeforePacketAdministration: true,
      recordingEditorOpenedInline: true,
      transcriptViewModesOperated: true,
      recordingAndTranscriptRenderedSideBySide: true,
      correctionAvailableWithoutPlaybackGate: true,
      repeatedPlaybackAttestationAbsent: true,
    };
  } finally {
    await browserContext.close();
    await browser.close();
  }
}

async function main() {
  assert(
    process.env.QUIPSLY_FRESH_SESSION_AUDIO_POLISH === "1",
    "Set QUIPSLY_FRESH_SESSION_AUDIO_POLISH=1 to operate the local fresh Session.",
  );
  const { context, contextPath } = await loadContext();
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_FRESH_SESSION_AUDIO_POLISH_BASE_URL || context.baseURL || "http://127.0.0.1:3012",
    "QUIPSLY_FRESH_SESSION_AUDIO_POLISH_BASE_URL",
  );
  const databaseURL = requireLocalDatabase(
    process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  const password = readRetainedQAPassword({
    service: context.keychainService,
    account: context.identities.coach.email,
  });
  assert(password, "The fresh coach Keychain credential is unavailable.");
  await restoreFreshCoachAuth(context, password);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });

  try {
    checkpoint("binding the exact original sources");
    const sourcesBefore = await sourceSnapshot(prisma, context.roomId);
    const operatedSource = sourcesBefore[0];
    const jobsBefore = await masteryJobs(
      prisma,
      operatedSource.coordinates.projectId,
      operatedSource.coordinates.mediaAssetId,
    );
    const rendered = await operateRenderedSession({ baseURL, context, password });
    checkpoint("proving the original source is unchanged");
    const sourcesAfter = await sourceSnapshot(prisma, context.roomId);
    assert(
      JSON.stringify(sourcesAfter) === JSON.stringify(sourcesBefore),
      "One-step audio polish changed an original RecordingAsset, Capture manifest, or canonical source asset.",
    );
    const jobsAfter = await masteryJobs(
      prisma,
      operatedSource.coordinates.projectId,
      operatedSource.coordinates.mediaAssetId,
    );
    const completed = jobsAfter.find((job) => job.status === "completed");
    assert(completed, "One-step audio polish has no completed processing receipt.");
    assert(jobsAfter.length >= jobsBefore.length, "Audio polish removed retained processing history.");

    const receiptPath = path.join(path.dirname(contextPath), "session-audio-polish-receipt.json");
    const receipt = {
      schema: "quipsly-fresh-session-audio-polish-receipt-v1",
      ok: true,
      createdAt: new Date().toISOString(),
      localOnly: true,
      contextPath,
      roomId: context.roomId,
      operatedRecordingAssetId: operatedSource.recording.id,
      operatedMediaAssetId: operatedSource.coordinates.mediaAssetId,
      completedMasteryJobId: completed.id,
      originalSourceChecksum: operatedSource.recording.checksum,
      originalSourceAndCaptureManifestUnchanged: true,
      processingHistoryRetained: true,
      credentialsPrinted: false,
      freshCoachAuthRestoredToEphemeralEmulator: true,
      screenshotsCaptured: false,
      externalSideEffects: false,
      humanAcceptanceSatisfied: false,
      physicalDeviceProven: false,
      humanListeningProven: false,
      ...rendered,
    };
    await mkdir(path.dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(receiptPath, 0o600);
    console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
