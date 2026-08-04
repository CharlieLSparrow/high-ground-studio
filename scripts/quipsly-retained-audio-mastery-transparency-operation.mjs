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
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const PROJECT_SLUG = "high-ground-odyssey";
const EPISODE_SLUG = "episode-4-part-2";
const ASSET_ID = "cmse192a8000e8jxldysq5b1u";
const JOB_ID = "audio_mastery_9cafe8cc6c684e90bcb07ca008bfd48c";
const ASSET_FILENAME = "quipsly-audio-mastery-dogfood.wav";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkpoint(label) {
  process.stderr.write(`[retained audio mastery] ${label}\n`);
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Audio mastery operation refuses non-local PostgreSQL.");
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stable(child)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

async function masterySnapshot(prisma) {
  const row = await prisma.studioAssetProcessingJob.findUnique({
    where: { id: JOB_ID },
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
  assert(row?.status === "completed", "Retained audio mastery receipt is not completed.");
  assert(row.project?.slug === PROJECT_SLUG && row.assetId === ASSET_ID, "Retained audio mastery source boundary changed.");
  assert(row.project.accessGrants.length === 1, "Retained media operator lost its explicit HGO project grant.");
  assert(row.asset.filename === ASSET_FILENAME, "Retained audio mastery filename changed.");
  return JSON.stringify(stable(row));
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
  const identity = { role: "retained-audio-mastery-operator", email: OPERATOR_EMAIL };

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
    await desk.getByText(/Delivery delta includes overall level change/i).waitFor();
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

    await assertNoHorizontalOverflow(desk, "audio mastery audition dialog");
    assert(browserErrors.length === 0, `Audio mastery desk raised browser exceptions: ${browserErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, identity.role);
    checkpoint("rendered operation passed");

    return {
      processingMapOperated: true,
      selectedSeconds,
      detailZoomOperated: true,
      sourceReadyState: readyState[0],
      masteredReadyState: readyState[1],
      synchronizedPlaybackAdvanced: true,
      switchPreservedPlayback: true,
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
  assert(password, "Retained media operator Keychain credential is unavailable.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });

  try {
    checkpoint("reading immutable boundary before operation");
    const before = await masterySnapshot(prisma);
    const rendered = await operateRenderedDesk(baseURL, password);
    checkpoint("reading immutable boundary after operation");
    const after = await masterySnapshot(prisma);
    assert(after === before, "Auditioning the evidence mutated the immutable asset or mastery receipt.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      assetId: ASSET_ID,
      masteryJobId: JOB_ID,
      deliveryAndShapeDeltaSeparated: true,
      sourceAndReceiptUnchanged: true,
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
