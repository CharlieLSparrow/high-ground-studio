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
const EPISODE_SLUG = "qa-retained-speaker-camera-cut-20260803";
const EPISODE_TITLE = "QA Retained Speaker Camera Cut 20260803";
// A small CC0 WebM keeps the retained browser journey codec-portable. Clip
// identity, not URL uniqueness, is the camera-routing contract under test.
const CHARLIE_CAMERA = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm";
const SCOTT_CAMERA = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seedArtifact() {
  const savedAt = new Date().toISOString();
  return {
    payloadVersion: 4,
    projectSlug: PROJECT_SLUG,
    episodeSlug: EPISODE_SLUG,
    source: "quipsly-editor",
    timelineClips: [
      { id: "qa-charlie-camera", assetId: CHARLIE_CAMERA, kind: "video", trackId: "V1", startIn: 0, duration: 15, sourceStart: 0, sourceEnd: 15, name: "Charlie camera", color: "#7c3aed" },
      { id: "qa-scott-camera", assetId: SCOTT_CAMERA, kind: "video", trackId: "V2", startIn: 0, duration: 15, sourceStart: 0, sourceEnd: 15, name: "Scott camera", color: "#0284c7" },
    ],
    transcript: [
      { id: "qa-words-1", time: 0, duration: 4, text: "Welcome to the camera assembly review.", speaker: "Charlie", deleted: false, deactivated: false, alert: null },
      { id: "qa-words-2", time: 4, duration: 0.8, text: "Yep.", speaker: "Scott", deleted: false, deactivated: false, alert: null },
      { id: "qa-words-3", time: 5, duration: 3, text: "This short reply should hold the first shot.", speaker: "Charlie", deleted: false, deactivated: false, alert: null },
      { id: "qa-words-4", time: 8, duration: 4, text: "Then the stable response should switch cameras.", speaker: "Scott", deleted: false, deactivated: false, alert: null },
    ],
    deactivatedRanges: [],
    speakerCameraMappings: [],
    cameraSwitchDecisions: [],
    generatedFrom: "retained-speaker-camera-cut-seed",
    savedAt,
    generatedAt: savedAt,
  };
}

async function postEpisode(page, body) {
  return page.evaluate(async (requestBody) => {
    const response = await fetch("/api/episode-production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    return { status: response.status, body: await response.json() };
  }, body);
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: MEDIA_OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));

  try {
    const callbackPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "media-operator", email: MEDIA_OPERATOR_EMAIL }, password, callbackPath });

    const ensured = await postEpisode(page, { action: "ensure", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, title: EPISODE_TITLE, boundaryLabel: EPISODE_TITLE });
    assert(ensured.status === 200 && ensured.body?.mode === "database", `Episode ensure failed: ${JSON.stringify(ensured)}`);
    const seeded = await postEpisode(page, {
      action: "save-timeline",
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      timelineJson: seedArtifact(),
      transcriptJson: seedArtifact(),
    });
    assert(seeded.status === 200 && seeded.body?.mode === "database", `Timeline seed failed: ${JSON.stringify(seeded)}`);
    console.error("[speaker-camera-cut] canonical seed saved");

    await page.goto(`${baseURL}${callbackPath}`, { waitUntil: "load" });
    await page.getByText(/Loaded .* from saved timeline/, { exact: true }).waitFor({ timeout: 20_000 });
    const main = page.getByRole("main").last();
    const cameraCutHeading = main.getByRole("heading", { name: "Tell Quipsly which camera belongs to each voice", exact: true });
    await cameraCutHeading.waitFor();
    const cameraCutSection = cameraCutHeading.locator("xpath=ancestor::section");

    const charlieSelect = main.getByRole("combobox", { name: "Camera for Charlie", exact: true });
    const scottSelect = main.getByRole("combobox", { name: "Camera for Scott", exact: true });
    assert(await charlieSelect.count() === 1 && await scottSelect.count() === 1, "Expected one camera selector for each canonical speaker.");
    await charlieSelect.selectOption({ label: "V1 · Charlie camera" });
    await scottSelect.selectOption({ label: "V2 · Scott camera" });
    console.error("[speaker-camera-cut] rendered camera map completed");

    const analysisResponse = page.waitForResponse((response) => response.url().includes("/api/ai-edit") && response.request().method() === "POST");
    const bindEvidenceButton = main.getByRole("button", { name: "Bind current evidence", exact: true });
    await bindEvidenceButton.focus();
    await page.keyboard.press("Enter");
    const analysis = await analysisResponse;
    const analysisBody = await analysis.json().catch(() => ({}));
    assert(analysis.ok(), `Deterministic edit evidence failed (${analysis.status()}): ${JSON.stringify(analysisBody)}`);
    assert(analysisBody?.proposalSet?.proposalSetId, `Deterministic edit evidence returned no durable proposal set: ${JSON.stringify(analysisBody)}`);
    await main.getByText(/The current transcript and timeline match a durable edit-evidence set\./).waitFor({ timeout: 20_000 });
    console.error("[speaker-camera-cut] durable evidence bound");
    const assembleButton = main.getByRole("button", { name: "Assemble speaker cut", exact: true });
    assert(await assembleButton.isEnabled(), `Speaker cut remained disabled after evidence binding: ${await cameraCutSection.innerText()}`);
    const canonicalCameraSaveResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/api/episode-production") || response.request().method() !== "POST") return false;
      try {
        const body = response.request().postDataJSON();
        return body?.action === "save-timeline" && body?.timelineJson?.cameraSwitchDecisions?.length === 2;
      } catch {
        return false;
      }
    }, { timeout: 30_000 });
    await assembleButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_000);
    const assembledSectionText = await cameraCutSection.innerText();
    assert(assembledSectionText.includes("Assembled 2 receipt-backed camera ranges and deliberately held 1."), `Speaker cut did not assemble: ${assembledSectionText}`);
    console.error("[speaker-camera-cut] reversible draft assembled");
    const assembledText = await main.innerText();
    for (const expected of [
      "00:00–00:08 · Charlie",
      "00:08–00:12 · Scott",
      "rapid speaker turn",
      "speaker-cut draft selected this angle for Charlie",
    ]) {
      assert(assembledText.includes(expected), `Rendered speaker cut lost: ${expected}`);
    }

    // The editor's production autosave is part of the product contract. Wait
    // for the exact two-decision payload instead of racing it with a redundant click.
    const canonicalCameraSave = await canonicalCameraSaveResponse;
    assert(canonicalCameraSave.ok(), `Canonical camera autosave returned ${canonicalCameraSave.status()}.`);
    console.error("[speaker-camera-cut] canonical autosave completed");

    await page.reload({ waitUntil: "load" });
    await page.getByText(/Loaded .* from saved timeline/, { exact: true }).waitFor({ timeout: 20_000 });
    const reloadedMain = page.getByRole("main").last();
    const reloadedCameraCutSection = reloadedMain.getByRole("heading", { name: "Tell Quipsly which camera belongs to each voice", exact: true }).locator("xpath=ancestor::section");
    await reloadedCameraCutSection.waitFor();
    const reloadedText = await reloadedMain.innerText();
    const reloadedCameraText = await reloadedCameraCutSection.innerText();
    const reloadedTextLower = reloadedText.toLowerCase();
    for (const expected of ["draft camera ranges", "00:00–00:08 · charlie", "00:08–00:12 · scott", "speaker-cut draft selected this angle for charlie"]) {
      assert(reloadedTextLower.includes(expected), `Reloaded canonical camera cut lost: ${expected}. Camera desk: ${reloadedCameraText}`);
    }
    console.error("[speaker-camera-cut] canonical reload verified");

    const proofWatchResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/api/editor/edit-review") || response.request().method() !== "POST") return false;
      try {
        const body = response.request().postDataJSON();
        return body?.action === "PROOF_WATCHED" && body?.subjectKind === "camera-switch";
      } catch {
        return false;
      }
    }, { timeout: 30_000 }).catch((error) => {
      throw new Error([
        error instanceof Error ? error.message : String(error),
        `Camera desk before click: ${reloadedCameraText}`,
        `Page errors: ${pageErrors.join(" | ") || "none"}`,
        `Console errors: ${consoleErrors.join(" | ") || "none"}`,
        `Failed requests: ${failedRequests.join(" | ") || "none"}`,
      ].join("\n"));
    });
    const proofWatchButton = reloadedCameraCutSection.getByRole("button", { name: "Proof-watch cut", exact: true }).first();
    assert(await proofWatchButton.count() === 1, `Expected a proof-watch control for an assembled camera range: ${reloadedCameraText}`);
    await proofWatchButton.focus();
    await page.keyboard.press("Enter");
    const proofWatchReceipt = await proofWatchResponse;
    const proofWatchBody = await proofWatchReceipt.json().catch(() => ({}));
    assert(proofWatchReceipt.ok() && proofWatchBody?.receipt?.action === "PROOF_WATCHED", `Camera proof-watch receipt failed (${proofWatchReceipt.status()}): ${JSON.stringify(proofWatchBody)}`);
    await reloadedCameraCutSection.getByText("Proof watched", { exact: true }).first().waitFor({ timeout: 20_000 });
    await reloadedCameraCutSection.getByRole("button", { name: "Watch again", exact: true }).first().waitFor({ timeout: 20_000 });
    assert((await reloadedCameraCutSection.innerText()).includes("Review receipt saved."), "Camera proof-watch did not expose its durable receipt status.");
    console.error("[speaker-camera-cut] assembled cut proof-watched");

    await page.reload({ waitUntil: "load" });
    await page.getByText(/Loaded .* from saved timeline/, { exact: true }).waitFor({ timeout: 20_000 });
    const finalMain = page.getByRole("main").last();
    const finalCameraCutSection = finalMain.getByRole("heading", { name: "Tell Quipsly which camera belongs to each voice", exact: true }).locator("xpath=ancestor::section");
    await finalCameraCutSection.getByText("Proof watched", { exact: true }).first().waitFor({ timeout: 20_000 });
    assert(await finalCameraCutSection.getByRole("button", { name: "Watch again", exact: true }).count() >= 1, "Camera proof-watch state did not survive canonical reload.");
    console.error("[speaker-camera-cut] proof-watch receipt reload verified");
    await assertNoHorizontalOverflow(finalMain, "retained speaker-camera cut editor");
    assert(pageErrors.length === 0, `Rendered editor raised page errors: ${pageErrors.join(" | ")}`);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      canonicalSpeakers: ["Charlie", "Scott"],
      cameraMappings: 2,
      cameraSwitchDecisions: 2,
      deliberateHolds: 1,
      proofWatchedDecisions: 1,
      durableEvidence: true,
      canonicalReload: true,
      sourceMediaUnchanged: true,
    }, null, 2)}\n`);
  } finally {
    await clearRenderedSession(page, baseURL).catch(() => undefined);
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
