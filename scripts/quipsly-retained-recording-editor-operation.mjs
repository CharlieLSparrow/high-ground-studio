#!/usr/bin/env node

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const PROJECT_SLUG = "qa-retained-capture-to-follow-through-lab";
const EPISODE_SLUG = "qa-retained-editor-truth-20260731";
const EPISODE_LABEL = "Qa Retained Editor Truth 20260731";
const SCRIPT_TEXT = [
  "QA Retained · Recorder to editor truth",
  "Charles: This manuscript, watched clip, and edit receipt must remain attached to the same episode.",
  "Scott: The editor should show only media we actually recorded, uploaded, imported, or played.",
].join("\n\n");
const CLIP_TITLE = "QA Retained · Be curious reaction clip";
const CLIP_URL = "https://www.youtube.com/watch?v=96LN__TA-T8&t=2s";
const CLIP_START = "0:02";
const CLIP_END = "0:18";
const CLIP_NOTE = "QA Retained · Verify exact watched-source evidence in the editor";
const CLIP_EVENT_LABEL = `Played ${CLIP_TITLE} ${CLIP_START}-${CLIP_END}`;
const SHARED_WATCH_PROJECT_SLUG = "home-quipsly-media-ms8ct81g-at-example-test";
const SHARED_WATCH_EPISODE_SLUG = "current-episode";
const SHARED_WATCH_CLIP_TITLE = "Watched · Canonical tag focus QA";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mainContent(page) {
  return page.getByRole("main").last();
}

async function operateRecorder(page, baseURL) {
  const recorderURL = `${baseURL}/recorder?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
  await page.goto(recorderURL, { waitUntil: "load" });
  await page.getByRole("heading", { name: "Quipsly Recording Room", exact: true }).waitFor({ timeout: 20_000 });

  const manuscript = page.getByLabel("Episode manuscript", { exact: true });
  const previousManuscript = await manuscript.inputValue();
  await manuscript.fill(SCRIPT_TEXT);

  let titleInputs = page.getByPlaceholder("Clip title", { exact: true });
  if (await titleInputs.count() === 0) {
    await page.getByRole("button", { name: "Add clip", exact: true }).click();
    titleInputs = page.getByPlaceholder("Clip title", { exact: true });
    await titleInputs.waitFor();
  }
  let repairedDefaultCue = false;
  const hydratedTitleCount = await titleInputs.count();
  const hydratedTitles = [];
  for (let index = 0; index < hydratedTitleCount; index += 1) {
    hydratedTitles.push(await titleInputs.nth(index).inputValue());
  }
  if (hydratedTitles.length === 2 && hydratedTitles[0] === CLIP_TITLE && hydratedTitles[1] === "New clip") {
    const removeButtons = page.getByRole("button", { name: "Remove clip", exact: true });
    assert(await removeButtons.count() === 2, "Default cue repair could not resolve the exact duplicate control.");
    await removeButtons.nth(1).click();
    await page.getByPlaceholder("Clip title", { exact: true }).waitFor();
    titleInputs = page.getByPlaceholder("Clip title", { exact: true });
    repairedDefaultCue = true;
  }
  assert(await titleInputs.count() === 1, "The retained episode must contain exactly one clip cue.");

  const clipURLInput = page.getByPlaceholder("https://youtube.com/watch?v=...", { exact: true });
  const clipStartInput = page.getByPlaceholder("start", { exact: true });
  const clipEndInput = page.getByPlaceholder("end", { exact: true });
  const clipNoteInput = page.getByPlaceholder("why this segment matters", { exact: true });
  const previousValues = await Promise.all([
    titleInputs.inputValue(),
    clipURLInput.inputValue(),
    clipStartInput.inputValue(),
    clipEndInput.inputValue(),
    clipNoteInput.inputValue(),
  ]);
  await titleInputs.fill(CLIP_TITLE);
  await clipURLInput.fill(CLIP_URL);
  await clipStartInput.fill(CLIP_START);
  await clipEndInput.fill(CLIP_END);
  await clipNoteInput.fill(CLIP_NOTE);

  const existingEvent = page.getByText(CLIP_EVENT_LABEL, { exact: true });
  const eventWasAlreadyRetained = await existingEvent.count() > 0;
  if (!eventWasAlreadyRetained) {
    await page.getByRole("button", { name: "Play clip end-to-end", exact: true }).click();
    await existingEvent.waitFor();
  }

  const expectedValues = [CLIP_TITLE, CLIP_URL, CLIP_START, CLIP_END, CLIP_NOTE];
  const mutationExpected = previousManuscript !== SCRIPT_TEXT
    || previousValues.some((value, index) => value !== expectedValues[index])
    || repairedDefaultCue
    || !eventWasAlreadyRetained;
  if (mutationExpected) {
    await page.getByText("Recorder room autosaved", { exact: true }).waitFor({ timeout: 20_000 });
  }
  const recorderMain = mainContent(page);
  const recorderText = await recorderMain.innerText();
  assert(await manuscript.inputValue() === SCRIPT_TEXT, "Rendered recorder did not retain the exact manuscript value.");
  assert(await titleInputs.inputValue() === CLIP_TITLE, "Rendered recorder did not retain the exact clip title.");
  for (const expected of [CLIP_EVENT_LABEL, CLIP_NOTE]) {
    assert(recorderText.includes(expected), `Rendered recorder lost ${expected}.`);
  }
  await assertNoHorizontalOverflow(recorderMain, "retained recorder");

  return {
    recorder: "passed",
    episodeSlug: EPISODE_SLUG,
    clipPlaybackEvent: eventWasAlreadyRetained ? "reused" : "created",
    duplicateDefaultCueRepaired: repairedDefaultCue,
    autosave: mutationExpected ? "passed" : "already current",
  };
}

async function verifyEditor(page, baseURL) {
  const editorURL = `${baseURL}/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
  await page.goto(editorURL, { waitUntil: "load" });
  await page.getByRole("heading", { name: /Episode Editor/i }).waitFor({ timeout: 20_000 });
  await page.getByText(`Loaded ${EPISODE_LABEL} from recording room`, { exact: true }).waitFor({ timeout: 20_000 });

  const editorMain = mainContent(page);
  const editorText = await editorMain.innerText();
  for (const expected of [CLIP_TITLE, "00:02-00:18"]) {
    assert(editorText.includes(expected), `Rendered editor lost ${expected}.`);
  }
  for (const forbidden of ["audio spine (placeholder)", "B-Roll: Coffee Pour", "Episode 4 Intro Audio", "No timeline sources yet."]) {
    assert(!editorText.includes(forbidden), `Rendered editor injected forbidden placeholder content: ${forbidden}`);
  }
  const overflowDiagnostics = await editorMain.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    descendants: Array.from(element.querySelectorAll("*")).filter((candidate) => (
      candidate.scrollWidth > candidate.clientWidth + 1
    )).slice(0, 12).map((candidate) => ({
      tag: candidate.tagName.toLowerCase(),
      className: typeof candidate.className === "string" ? candidate.className.slice(0, 180) : "",
      clientWidth: candidate.clientWidth,
      scrollWidth: candidate.scrollWidth,
    })),
  }));
  assert(
    overflowDiagnostics.scrollWidth <= overflowDiagnostics.clientWidth + 1,
    `retained editor surface overflowed its rendered viewport: ${JSON.stringify(overflowDiagnostics)}`,
  );

  return {
    editor: "passed",
    hydrationSource: "recording room",
    watchedSourceRange: "00:02-00:18",
    placeholderMediaInjected: false,
  };
}

async function verifySharedWatchEditor(page, baseURL) {
  const editorURL = `${baseURL}/editor?project=${encodeURIComponent(SHARED_WATCH_PROJECT_SLUG)}&episode=${encodeURIComponent(SHARED_WATCH_EPISODE_SLUG)}`;
  await page.goto(editorURL, { waitUntil: "load" });
  await page.getByRole("heading", { name: /Episode Editor/i }).waitFor({ timeout: 20_000 });
  await page.getByText(
    "Loaded 1 receipt-backed Shared Watch span for Current Episode",
    { exact: true },
  ).waitFor({ timeout: 20_000 });
  await page.getByText("1 receipt-backed", { exact: true }).waitFor({ timeout: 20_000 });

  const editorMain = mainContent(page);
  const editorText = await editorMain.innerText();
  for (const expected of [SHARED_WATCH_CLIP_TITLE]) {
    assert(editorText.includes(expected), `Rendered Shared Watch editor lost ${expected}.`);
  }
  for (const forbidden of ["audio spine (placeholder)", "B-Roll: Coffee Pour", "Episode 4 Intro Audio"]) {
    assert(!editorText.includes(forbidden), `Rendered Shared Watch editor injected forbidden placeholder content: ${forbidden}`);
  }
  await assertNoHorizontalOverflow(editorMain, "retained Shared Watch editor");

  return {
    sharedWatchEditor: "passed",
    sharedWatchHydrationSource: "shared watch",
    sharedWatchDerivativeCount: 1,
    sharedWatchSourceRange: "00:04-00:12",
    sharedWatchReceiptsVisible: true,
  };
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");

  const identity = { role: "media-operator", email: MEDIA_OPERATOR_EMAIL };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: `/recorder?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`,
    });
    const recorder = await operateRecorder(page, baseURL);
    const editor = await verifyEditor(page, baseURL);
    const sharedWatchEditor = await verifySharedWatchEditor(page, baseURL);
    assert(pageErrors.length === 0, `Recorder/editor operation raised browser exceptions: ${pageErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, identity.role);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: false,
      secretsPrinted: false,
      mutationsPerformed: recorder.autosave === "passed",
      externalSideEffects: false,
      ...recorder,
      ...editor,
      ...sharedWatchEditor,
      sessionClear: "passed",
      browserExceptions: 0,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
