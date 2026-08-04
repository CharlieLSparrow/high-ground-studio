#!/usr/bin/env node

import { createRequire } from "node:module";

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

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const COACHING_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const OUTSIDER_EMAIL = "quipsly-followup-outsider-retained-20260731@example.test";
const PROJECT_SLUG = "high-ground-odyssey";
const EPISODE_SLUG = "episode-4-part-2";
const ASSET_ID = "cmse192a8000e8jxldysq5b1u";
const SOURCE_ID = "cmse1929v000d8jxlwao4837y";
const JOB_ID = "audio_mastery_9cafe8cc6c684e90bcb07ca008bfd48c";
const ASSET_FILENAME = "quipsly-audio-mastery-dogfood.wav";
const TREATMENT_ASSET_ID = "cmsecf2px0007q7xlyooqnys0";
const TREATMENT_JOB_ID = "audio_treatment_3076f60ac63d4242b55b23338a3324c3";
const TREATMENT_ASSET_FILENAME = "quipsly-audio-treatment-ui-acceptance.wav";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkpoint(label) {
  process.stderr.write(`[retained audio processing] ${label}\n`);
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Audio processing operation refuses non-local PostgreSQL.");
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stable(child)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

async function processingSnapshot(prisma, { jobId, assetId, filename, type }) {
  const row = await prisma.studioAssetProcessingJob.findUnique({
    where: { id: jobId },
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
      project: {
        select: {
          slug: true,
          accessGrants: {
            where: { email: OPERATOR_EMAIL, status: "ACTIVE" },
            select: { role: true, status: true, note: true },
          },
        },
      },
      asset: { select: { filename: true, url: true, mimeType: true, sizeBytes: true, updatedAt: true } },
    },
  });
  assert(row?.status === "completed" && row.type === type, `Retained ${type} receipt is not completed.`);
  assert(row.project?.slug === PROJECT_SLUG && row.assetId === assetId, `Retained ${type} source boundary changed.`);
  assert(row.project.accessGrants.length === 1, "Retained media operator lost its explicit HGO project grant.");
  assert(row.asset.filename === filename, `Retained ${type} filename changed.`);
  return JSON.stringify(stable(row));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  let body = null;
  try { body = responseText ? JSON.parse(responseText) : null; } catch {}
  return { response, status: response.status, body, responseText };
}

function sessionCookie(setCookie) {
  return String(setCookie || "").split(";")[0].trim();
}

function reviewPayload(clientRequestId) {
  return {
    projectSlug: PROJECT_SLUG,
    assetId: ASSET_ID,
    sourceId: SOURCE_ID,
    jobId: JOB_ID,
    clientRequestId,
    decision: "approved",
    playbackEvidence: {
      schema: "quipsly-audio-mastery-playback-review-v1",
      sourceListenedSecondBins: [],
      masteredListenedSecondBins: [],
      monitorModes: [],
      completedAt: new Date().toISOString(),
    },
  };
}

async function proveSignedOutReviewDenial(baseURL) {
  const denied = await jsonRequest(`${baseURL}/api/media-vault/audio-mastery/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reviewPayload(`retained-signed-out-${Date.now()}`)),
  });
  assert([401, 403].includes(denied.status), `Signed-out mastery review returned HTTP ${denied.status}.`);
  assert(!denied.responseText.includes(ASSET_FILENAME), "Signed-out mastery review disclosed the protected filename.");
  return denied.status;
}

async function proveOutsiderReviewDenial(baseURL, password) {
  const auth = await jsonRequest(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: OUTSIDER_EMAIL, password, returnSecureToken: true }),
    },
  );
  assert(auth.status === 200 && auth.body?.idToken, "Retained outsider could not sign in to local Firebase.");
  const exchange = await jsonRequest(`${baseURL}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: auth.body.idToken }),
  });
  const cookie = sessionCookie(exchange.response.headers.get("set-cookie"));
  assert(exchange.status === 200 && cookie, "Retained outsider could not establish a Nest session.");
  try {
    const denied = await jsonRequest(`${baseURL}/api/media-vault/audio-mastery/review`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(reviewPayload(`retained-outsider-${Date.now()}`)),
    });
    assert([403, 404].includes(denied.status), `Outsider mastery review returned HTTP ${denied.status}.`);
    assert(!denied.responseText.includes(ASSET_FILENAME), "Outsider mastery review disclosed the protected filename.");
    return denied.status;
  } finally {
    await fetch(`${baseURL}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => {});
  }
}

async function operateRenderedDesk(baseURL, password) {
  const callbackPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const identity = { role: "retained-audio-processing-operator", email: OPERATOR_EMAIL };

  try {
    checkpoint("signing in");
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath });
    checkpoint("waiting for editor");
    try {
      await page.getByRole("heading", { name: /Episode Editor/i }).waitFor({ timeout: 20_000 });
    } catch {
      const renderedState = await page.locator("body").innerText().catch(() => "Rendered body unavailable.");
      throw new Error(`Episode editor did not become ready at ${new URL(page.url()).pathname}. Rendered state: ${renderedState.slice(0, 1_200)}`);
    }
    const assetName = page.getByText(ASSET_FILENAME, { exact: true }).first();
    await assetName.waitFor({ timeout: 20_000 });
    checkpoint("opening audition desk");
    const openDeskButtons = page.getByRole("button", { name: "Open full audition desk", exact: true });
    await openDeskButtons.first().waitFor({ timeout: 20_000 });
    let openDesk = null;
    for (let index = 0; index < await openDeskButtons.count(); index += 1) {
      const candidate = openDeskButtons.nth(index);
      const ownsFixture = await candidate.evaluate((element, filename) => element.closest(".shadow-sm")?.textContent?.includes(filename) === true, ASSET_FILENAME);
      if (ownsFixture) {
        openDesk = candidate;
        break;
      }
    }
    assert(openDesk, `No mastering audition desk belongs to ${ASSET_FILENAME}.`);
    await openDesk.click();

    const desk = page.getByRole("dialog", { name: "Source-to-master audition desk" });
    await desk.waitFor({ timeout: 20_000 });
    await desk.getByText("Processing change map", { exact: true }).waitFor();
    await desk.getByText(/not compressor gain reduction/i).waitFor();
    await desk.getByText(/Level delta includes overall level change/i).waitFor();
    checkpoint("operating processing map");

    const map = desk.getByRole("button", { name: /Processing change map from .* Select a position to move synchronized audition playback/i });
    const mapBounds = await map.boundingBox();
    assert(mapBounds?.width > 100, "Rendered processing map has no operable width.");
    await map.click({ position: { x: mapBounds.width * 0.68, y: mapBounds.height * 0.5 } });

    const playhead = desk.getByRole("slider", { name: "Audition playhead" });
    const selectedSeconds = Number(await playhead.inputValue());
    assert(selectedSeconds > 7 && selectedSeconds < 9.5, `Processing map did not seek the shared 12-second clock: ${selectedSeconds}.`);

    await desk.getByRole("button", { name: "15 sec", exact: true }).click();
    assert(await desk.getByRole("button", { name: "15 sec", exact: true }).getAttribute("aria-pressed") === "true", "Detail zoom did not become active.");

    const sourceAudio = desk.locator('audio[data-audition-version="source"]');
    const masteredAudio = desk.locator('audio[data-audition-version="mastered"]');
    checkpoint("waiting for protected audio metadata");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("audio[data-audition-version]")).every((element) => element.readyState >= 1), undefined, { timeout: 20_000 });
    const readyState = await Promise.all([
      sourceAudio.evaluate((element) => element.readyState),
      masteredAudio.evaluate((element) => element.readyState),
    ]);
    assert(readyState.every((value) => value >= 1), "Both protected audition feeds did not load metadata.");

    checkpoint("operating synchronized playback");
    await desk.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(800);
    const masteredAfterPlay = await masteredAudio.evaluate((element) => ({ currentTime: element.currentTime, paused: element.paused }));
    assert(masteredAfterPlay.currentTime > selectedSeconds, "Mastered preview did not advance from the map-selected source time.");

    await desk.getByRole("button", { name: "Immutable source", exact: true }).click();
    await page.waitForTimeout(450);
    const sourceAfterSwitch = await sourceAudio.evaluate((element) => ({ currentTime: element.currentTime, paused: element.paused }));
    assert(sourceAfterSwitch.currentTime >= masteredAfterPlay.currentTime - 0.2, "A/B switch lost the shared source playhead.");
    assert(!sourceAfterSwitch.paused, "A/B switch did not preserve active playback.");
    await desk.getByRole("button", { name: "Pause", exact: true }).click();

    const changeNavigator = desk.getByRole("region", { name: "Processing change map review navigator", exact: true });
    await changeNavigator.getByText("Change navigator", { exact: true }).waitFor();
    await changeNavigator.getByRole("button", { name: "Next change →", exact: true }).click();
    const navigatedSeconds = Number(await playhead.inputValue());
    assert(Number.isFinite(navigatedSeconds), "Mastering change navigator did not preserve a finite source-clock playhead.");
    assert(await desk.getByRole("button", { name: "15 sec", exact: true }).getAttribute("aria-pressed") === "true", "Mastering change navigator did not open the detail view.");

    checkpoint("proving playback-tracked review hold");
    const reviewRegion = desk.getByRole("region", { name: "Mastering decision review" });
    await reviewRegion.getByText("Playback-tracked decision", { exact: true }).waitFor();
    await reviewRegion.getByText(/cannot prove audibility or attention/i).waitFor();
    assert(await reviewRegion.getByRole("button", { name: /Approve as heard/i }).isDisabled(), "Approval became available without complete playback evidence.");
    const incomplete = await page.evaluate(async (payload) => {
      const response = await fetch("/api/media-vault/audio-mastery/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    }, reviewPayload(`retained-incomplete-${Date.now()}`));
    assert(incomplete.status === 409 && incomplete.body?.code === "AUDIO_MASTER_REVIEW_INCOMPLETE", `Incomplete listening evidence did not fail closed: HTTP ${incomplete.status}.`);

    await assertNoHorizontalOverflow(desk, "audio mastery audition dialog");
    await desk.getByRole("button", { name: "Close", exact: true }).click();

    checkpoint("operating retained treatment evidence");
    await page.getByText(TREATMENT_ASSET_FILENAME, { exact: true }).first().waitFor({ timeout: 20_000 });
    const treatmentDeskButtons = page.getByRole("button", { name: "Open full treatment desk", exact: true });
    await treatmentDeskButtons.first().waitFor({ timeout: 20_000 });
    let treatmentDeskButton = null;
    for (let index = 0; index < await treatmentDeskButtons.count(); index += 1) {
      const candidate = treatmentDeskButtons.nth(index);
      const ownsFixture = await candidate.evaluate((element, filename) => element.closest(".shadow-sm")?.textContent?.includes(filename) === true, TREATMENT_ASSET_FILENAME);
      if (ownsFixture) {
        treatmentDeskButton = candidate;
        break;
      }
    }
    assert(treatmentDeskButton, `No treatment evidence desk belongs to ${TREATMENT_ASSET_FILENAME}.`);
    await treatmentDeskButton.click();
    const treatmentDialog = page.getByRole("dialog", { name: "Source-to-treatment evidence desk" });
    await treatmentDialog.waitFor({ timeout: 20_000 });
    const treatmentRegion = treatmentDialog.getByRole("region", { name: "Audio treatment evidence audition" });
    assert(await treatmentRegion.getByText("Before/after complete-decode evidence", { exact: true }).textContent() === "Before/after complete-decode evidence", "Treatment complete-decode comparison did not render.");
    assert(await treatmentRegion.getByText("1 → 0", { exact: true }).textContent() === "1 → 0", "Treatment before/after signal flags did not render.");
    assert(await treatmentRegion.getByText("Treatment signal flag", { exact: true }).textContent() === "Treatment signal flag", "Treatment map did not expose its after-treatment observation lane.");
    assert((await treatmentRegion.getByText(/cannot measure phase or frequency response/i).textContent())?.includes("cannot measure phase or frequency response"), "Treatment map lost its phase and frequency-response boundary.");

    const treatmentMap = treatmentRegion.getByRole("button", { name: /Treatment loudness-change map from .* Select a position to move synchronized audition playback/i });
    const treatmentMapBounds = await treatmentMap.boundingBox();
    assert(treatmentMapBounds?.width > 100, "Rendered treatment map has no operable width.");
    await treatmentMap.click({ position: { x: treatmentMapBounds.width * 0.62, y: treatmentMapBounds.height * 0.5 } });
    const treatmentPlayhead = treatmentRegion.getByRole("slider", { name: "Treatment audition playhead" });
    const treatmentSelectedSeconds = Number(await treatmentPlayhead.inputValue());
    assert(treatmentSelectedSeconds > 4 && treatmentSelectedSeconds < 6, `Treatment map did not seek the shared 8-second clock: ${treatmentSelectedSeconds}.`);

    const treatmentSourceAudio = treatmentRegion.locator('audio[data-treatment-version="source"]');
    const treatmentOutputAudio = treatmentRegion.locator('audio[data-treatment-version="treated"]');
    await page.waitForFunction(() => Array.from(document.querySelectorAll("audio[data-treatment-version]")).every((element) => element.readyState >= 1), undefined, { timeout: 20_000 });
    const treatmentReadyState = await Promise.all([
      treatmentSourceAudio.evaluate((element) => element.readyState),
      treatmentOutputAudio.evaluate((element) => element.readyState),
    ]);
    assert(treatmentReadyState.every((value) => value >= 1), "Both protected treatment feeds did not load metadata.");
    await treatmentRegion.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(800);
    const treatmentAfterPlay = await treatmentOutputAudio.evaluate((element) => ({ currentTime: element.currentTime, paused: element.paused }));
    assert(treatmentAfterPlay.currentTime > treatmentSelectedSeconds, "Treatment experiment did not advance from the map-selected source time.");
    await treatmentRegion.getByRole("button", { name: "Immutable source", exact: true }).click();
    await page.waitForTimeout(450);
    const treatmentSourceAfterSwitch = await treatmentSourceAudio.evaluate((element) => ({ currentTime: element.currentTime, paused: element.paused }));
    assert(treatmentSourceAfterSwitch.currentTime >= treatmentAfterPlay.currentTime - 0.2, "Treatment A/B switch lost the shared source playhead.");
    assert(!treatmentSourceAfterSwitch.paused, "Treatment A/B switch did not preserve active playback.");
    await treatmentRegion.getByRole("button", { name: "Pause", exact: true }).click();
    const treatmentChangeNavigator = treatmentRegion.getByRole("region", { name: "Treatment loudness-change map review navigator", exact: true });
    await treatmentChangeNavigator.getByText("Change navigator", { exact: true }).waitFor();
    await treatmentChangeNavigator.getByRole("button", { name: "Next change →", exact: true }).click();
    const treatmentNavigatedSeconds = Number(await treatmentPlayhead.inputValue());
    assert(Number.isFinite(treatmentNavigatedSeconds), "Treatment change navigator did not preserve a finite source-clock playhead.");
    assert(await treatmentRegion.getByRole("button", { name: "15 sec", exact: true }).getAttribute("aria-pressed") === "true", "Treatment change navigator did not open the detail view.");
    await assertNoHorizontalOverflow(treatmentDialog, "audio treatment evidence dialog");

    assert(browserErrors.length === 0, `Audio processing desks raised browser exceptions: ${browserErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, identity.role);
    checkpoint("rendered operation passed");

    return {
      processingMapOperated: true,
      selectedSeconds,
      detailZoomOperated: true,
      changeNavigatorOperated: true,
      navigatedSeconds,
      sourceReadyState: readyState[0],
      masteredReadyState: readyState[1],
      synchronizedPlaybackAdvanced: true,
      switchPreservedPlayback: true,
      incompleteApprovalStatus: incomplete.status,
      incompleteApprovalCode: incomplete.body.code,
      approvalHeldWithoutListening: true,
      treatmentMapOperated: true,
      treatmentSelectedSeconds,
      treatmentChangeNavigatorOperated: true,
      treatmentNavigatedSeconds,
      treatmentSourceReadyState: treatmentReadyState[0],
      treatmentOutputReadyState: treatmentReadyState[1],
      treatmentSignalFlagsBefore: 1,
      treatmentSignalFlagsAfter: 0,
      treatmentSynchronizedPlaybackAdvanced: true,
      treatmentSwitchPreservedPlayback: true,
      browserExceptions: browserErrors.length,
      horizontalOverflow: false,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  const outsiderPassword = readRetainedQAPassword({ service: COACHING_KEYCHAIN_SERVICE, account: OUTSIDER_EMAIL });
  assert(password, "Retained media operator Keychain credential is unavailable.");
  assert(outsiderPassword, "Retained outsider Keychain credential is unavailable.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });

  try {
    checkpoint("reading immutable boundary before operation");
    const before = await Promise.all([
      processingSnapshot(prisma, { jobId: JOB_ID, assetId: ASSET_ID, filename: ASSET_FILENAME, type: "audio-mastery" }),
      processingSnapshot(prisma, { jobId: TREATMENT_JOB_ID, assetId: TREATMENT_ASSET_ID, filename: TREATMENT_ASSET_FILENAME, type: "audio-treatment" }),
    ]);
    const reviewCountBefore = await prisma.studioAudioMasterReviewReceipt.count({ where: { masteryJobId: JOB_ID } });
    const signedOutStatus = await proveSignedOutReviewDenial(baseURL);
    const outsiderStatus = await proveOutsiderReviewDenial(baseURL, outsiderPassword);
    const rendered = await operateRenderedDesk(baseURL, password);
    checkpoint("reading immutable boundary after operation");
    const after = await Promise.all([
      processingSnapshot(prisma, { jobId: JOB_ID, assetId: ASSET_ID, filename: ASSET_FILENAME, type: "audio-mastery" }),
      processingSnapshot(prisma, { jobId: TREATMENT_JOB_ID, assetId: TREATMENT_ASSET_ID, filename: TREATMENT_ASSET_FILENAME, type: "audio-treatment" }),
    ]);
    const reviewCountAfter = await prisma.studioAudioMasterReviewReceipt.count({ where: { masteryJobId: JOB_ID } });
    assert(after[0] === before[0] && after[1] === before[1], "Auditioning the evidence mutated an immutable asset or processing receipt.");
    assert(reviewCountAfter === reviewCountBefore, "A denied or incomplete mastery decision left database residue.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      assetId: ASSET_ID,
      masteryJobId: JOB_ID,
      treatmentAssetId: TREATMENT_ASSET_ID,
      treatmentJobId: TREATMENT_JOB_ID,
      deliveryAndShapeDeltaSeparated: true,
      sourceAndReceiptUnchanged: true,
      signedOutReviewStatus: signedOutStatus,
      outsiderReviewStatus: outsiderStatus,
      incompleteReviewLeftNoReceipt: true,
      credentialsPrinted: false,
      screenshotsCaptured: false,
      externalSideEffects: false,
      ...rendered,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
