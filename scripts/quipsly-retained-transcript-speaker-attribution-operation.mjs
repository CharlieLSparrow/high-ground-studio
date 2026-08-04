#!/usr/bin/env node

import { createHash } from "node:crypto";
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

const PRODUCT_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const COACHING_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const OUTSIDER_EMAIL = "quipsly-followup-outsider-retained-20260731@example.test";
const ROOM_ID = "local-transcript-dogfood-episode-4";
const JOB_ID = "local-transcript-job-episode-4";
const PROVIDER_SPEAKER = "Speaker";
const PARTICIPANT_ID = "local-transcript-participant-episode-4-charlie";
const PARTICIPANT_LABEL = "Charlie";
const SESSION_TITLE = "Episode 4 transcript correction proof window (680–740s)";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(loopbackHost(url.hostname), "Speaker-attribution operation refuses non-local PostgreSQL.");
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function providerSegmentSnapshot(segments) {
  return sha256(JSON.stringify(segments.map((segment) => ({
    id: segment.id,
    speakerLabel: segment.speakerLabel,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
  }))));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  let body = null;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }
  return { response, status: response.status, body, responseText };
}

function sessionCookie(setCookie) {
  return String(setCookie || "").split(";")[0].trim();
}

async function outsiderDenial(baseURL, password, forbiddenText) {
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
    const denied = await jsonRequest(
      `${baseURL}/api/mobile/capture/transcripts/corrections?callRoomId=${encodeURIComponent(ROOM_ID)}`,
      { headers: { cookie } },
    );
    assert(denied.status === 404, `Outsider transcript request returned HTTP ${denied.status} instead of 404.`);
    for (const marker of [SESSION_TITLE, PARTICIPANT_LABEL, forbiddenText]) {
      assert(!denied.responseText.includes(marker), `Outsider response disclosed protected marker ${marker}.`);
    }
    return { status: denied.status, protectedMarkersDisclosed: false };
  } finally {
    await fetch(`${baseURL}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => {});
  }
}

async function renderedAttribution(baseURL, password) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const identity = { role: "retained-transcript-operator", email: OPERATOR_EMAIL };
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: `/sessions/${ROOM_ID}?mode=transcript`,
    });
    await page.getByRole("heading", { name: "Listen, correct, preserve the source", exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("heading", { name: "Identify a voice once", exact: true }).waitFor();
    const main = page.getByRole("main").last();
    await assertNoHorizontalOverflow(main, "retained transcript attribution desk");

    const audioEvidenceMap = main.getByLabel("Audio evidence map", { exact: true });
    await audioEvidenceMap.waitFor({ timeout: 20_000 });
    const audioEvidenceMapText = await audioEvidenceMap.innerText();
    assert(audioEvidenceMapText.includes("not a sample-level waveform"), "Rendered audio evidence map overclaimed its windowed measurements.");
    assert(audioEvidenceMapText.toLowerCase().includes("timed transcript word"), `Rendered audio evidence map did not expose its provider-timed transcript lane. Visible map contract: ${audioEvidenceMapText.slice(0, 1_000)}`);
    await audioEvidenceMap.getByText(/no cross-provider confidence threshold/i).waitFor();
    const detailZoom = audioEvidenceMap.getByRole("button", { name: "15 sec", exact: true });
    await detailZoom.click();
    assert(await detailZoom.getAttribute("aria-pressed") === "true", "Audio evidence detail zoom did not become active.");
    const mapButton = audioEvidenceMap.getByRole("button", { name: /Audio evidence map from .* Select a position to play/ });
    const mapBounds = await mapButton.boundingBox();
    assert(mapBounds && mapBounds.width > 100, "Audio evidence map had no usable rendered geometry.");
    const audio = page.getByLabel("Protected session recording");
    await audio.waitFor();
    await page.mouse.click(mapBounds.x + mapBounds.width * 0.72, mapBounds.y + mapBounds.height * 0.5);
    await page.waitForTimeout(250);
    const evidenceMapPlaybackPosition = await audio.evaluate((element) => element.currentTime);
    assert(Number.isFinite(evidenceMapPlaybackPosition) && evidenceMapPlaybackPosition > 0, "Audio evidence map did not seek protected playback to selected source evidence.");

    const readAPI = (path) => page.evaluate(async (requestPath) => {
      const response = await fetch(requestPath, { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, path);
    const deskPath = `/api/mobile/capture/transcripts/corrections?callRoomId=${encodeURIComponent(ROOM_ID)}`;
    const packetPath = `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(ROOM_ID)}`;
    const [deskBefore, packetBefore] = await Promise.all([readAPI(deskPath), readAPI(packetPath)]);
    assert(deskBefore.status === 200 && deskBefore.body?.ok, "Rendered operator could not read the correction desk API.");
    assert(packetBefore.status === 200 && packetBefore.body?.ok, "Rendered operator could not read the packet API.");

    const speakerCard = page.locator("article").filter({ hasText: `Provider ${PROVIDER_SPEAKER} ·` }).first();
    await speakerCard.waitFor();
    await speakerCard.getByRole("combobox", { name: "Participant" }).selectOption(PARTICIPANT_ID);
    const sample = speakerCard.getByRole("button", { name: new RegExp(`^Play ${PROVIDER_SPEAKER} sample from`) }).first();
    await sample.click();
    await page.waitForTimeout(150);
    const playbackPosition = await audio.evaluate((element) => element.currentTime);
    assert(Number.isFinite(playbackPosition) && playbackPosition > 0, "The rendered sample did not move protected playback to its source timestamp.");
    const selectedWordEvidence = audioEvidenceMap.getByLabel("Selected transcript word evidence", { exact: true });
    await selectedWordEvidence.waitFor({ timeout: 10_000 });
    const selectedWordText = await selectedWordEvidence.innerText();
    assert(selectedWordText.includes("unchecked provider word"), "Shared source playback did not project the unchecked transcript-word state onto the audio map.");
    assert(/confidence \d+%/i.test(selectedWordText), "The selected transcript word did not expose its provider-specific confidence evidence.");
    await speakerCard.getByRole("checkbox", { name: /I played the selected sample and recognize this voice/ }).check();

    const responsePromise = page.waitForResponse((response) => (
      response.url().endsWith("/api/mobile/capture/transcripts/corrections")
      && response.request().method() === "POST"
    ));
    await speakerCard.getByRole("button", { name: /Apply voice identity|Update voice identity/ }).click();
    const response = await responsePromise;
    const mutation = await response.json();
    assert(response.status() === 200 && mutation?.ok, `Rendered speaker attribution failed: ${mutation?.error || response.status()}`);
    const exactRequest = response.request().postDataJSON();
    const exactReplay = await page.evaluate(async ({ path, body }) => {
      const replayResponse = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: replayResponse.status, body: await replayResponse.json() };
    }, { path: "/api/mobile/capture/transcripts/corrections", body: exactRequest });
    assert(
      exactReplay.status === 200 && exactReplay.body?.ok,
      `Exact speaker-attribution replay failed: HTTP ${exactReplay.status} ${exactReplay.body?.error || "unknown error"}`,
    );
    assert(exactReplay.body.idempotentReplay === true, "Exact speaker-attribution replay did not report idempotent reuse.");
    assert(exactReplay.body.attribution?.id === mutation.attribution?.id, "Exact speaker-attribution replay changed canonical identity.");

    await page.getByText(`Identified as ${PARTICIPANT_LABEL}`, { exact: true }).first().waitFor({ timeout: 20_000 });
    await page.getByText("Voice identified from Session samples", { exact: true }).first().waitFor();
    await page.getByText(/does not claim the words in this turn were playback-reviewed/i).first().waitFor();
    const [deskAfter, packetAfter] = await Promise.all([readAPI(deskPath), readAPI(packetPath)]);
    assert(deskAfter.status === 200 && deskAfter.body?.ok, "Correction desk did not reload after attribution.");
    const group = deskAfter.body.speakerGroups?.find((entry) => entry.providerSpeakerLabel === PROVIDER_SPEAKER);
    assert(group?.attribution?.participantId === PARTICIPANT_ID, "Correction desk API lost the active participant mapping.");
    assert(group.attribution.attributedLabel === PARTICIPANT_LABEL, "Correction desk API lost the participant display snapshot.");
    assert(
      deskAfter.body.segments.every((segment) => segment.providerSpeakerLabel !== PROVIDER_SPEAKER || (
        segment.speakerLabel === PARTICIPANT_LABEL
        && segment.speakerAttribution?.id === group.attribution.id
      )),
      "One or more provider-cluster segments did not project the reviewed voice identity.",
    );
    assert(packetAfter.status === 200 && packetAfter.body?.ok, "Packet API failed after speaker attribution.");
    assert(
      packetAfter.body.packet?.status === "TRANSCRIPT_REVIEW_CHANGED",
      "Existing packet was not held after its speaker-identity source snapshot changed.",
    );
    assert(browserErrors.length === 0, `Rendered attribution raised browser errors: ${JSON.stringify(browserErrors)}`);
    await clearRenderedSession(page, baseURL, identity.role);
    return {
      mutationIdempotentReplay: mutation.idempotentReplay === true,
      audioEvidenceMapOperated: true,
      audioEvidenceMapPlaybackPosition: evidenceMapPlaybackPosition,
      transcriptWordLaneOperated: true,
      selectedTranscriptWordVisible: true,
      exactRequestReplay: true,
      playbackPosition,
      attributionId: group.attribution.id,
      transcriptSnapshotBefore: packetBefore.body.packet?.transcriptReview?.snapshotSha256 || null,
      transcriptSnapshotAfter: packetAfter.body.packet?.transcriptReview?.snapshotSha256 || null,
      packetStatusAfter: packetAfter.body.packet?.status,
      horizontalOverflow: false,
      browserExceptions: 0,
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
  const databaseURL = requireLocalDatabase(
    process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  const operatorPassword = readRetainedQAPassword({
    service: PRODUCT_KEYCHAIN_SERVICE,
    account: OPERATOR_EMAIL,
  });
  const outsiderPassword = readRetainedQAPassword({
    service: COACHING_KEYCHAIN_SERVICE,
    account: OUTSIDER_EMAIL,
  });
  assert(operatorPassword, "Retained media operator Keychain credential is unavailable.");
  assert(outsiderPassword, "Retained outsider Keychain credential is unavailable.");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
  try {
    const room = await prisma.callRoom.findUnique({
      where: { id: ROOM_ID },
      select: {
        id: true,
        title: true,
        project: { select: { accessGrants: { where: { email: OPERATOR_EMAIL, status: "ACTIVE" }, select: { id: true } } } },
        participants: { where: { id: PARTICIPANT_ID }, select: { id: true, displayName: true } },
        transcriptJobs: {
          where: { id: JOB_ID },
          select: {
            id: true,
            segments: { orderBy: [{ startSeconds: "asc" }, { id: "asc" }], select: { id: true, speakerLabel: true, startSeconds: true, endSeconds: true, text: true } },
          },
        },
      },
    });
    assert(room?.title === SESSION_TITLE, "Retained transcript Session fixture is unavailable.");
    assert(room.project?.accessGrants.length === 1, "Retained media operator lost Session project access.");
    assert(room.participants[0]?.displayName === PARTICIPANT_LABEL, "Retained Session participant fixture changed.");
    const segmentsBefore = room.transcriptJobs[0]?.segments || [];
    assert(segmentsBefore.length > 0, "Retained transcript fixture has no provider segments.");
    assert(segmentsBefore.every((segment) => segment.speakerLabel === PROVIDER_SPEAKER), "Retained provider cluster changed unexpectedly.");

    const before = await Promise.all([
      prisma.transcriptCorrection.count({ where: { roomId: ROOM_ID } }),
      prisma.transcriptSegmentVerification.count({ where: { roomId: ROOM_ID } }),
      prisma.transcriptSpeakerAttribution.count({ where: { transcriptJobId: JOB_ID, providerSpeakerLabel: PROVIDER_SPEAKER, status: "active" } }),
      prisma.coachingNote.count({ where: { roomId: ROOM_ID, kind: "SUMMARY" } }),
    ]);
    const providerHashBefore = providerSegmentSnapshot(segmentsBefore);
    const rendered = await renderedAttribution(baseURL, operatorPassword);

    const [segmentsAfter, correctionsAfter, verificationsAfter, active, packetCountAfter] = await Promise.all([
      prisma.transcriptSegment.findMany({ where: { transcriptJobId: JOB_ID }, orderBy: [{ startSeconds: "asc" }, { id: "asc" }], select: { id: true, speakerLabel: true, startSeconds: true, endSeconds: true, text: true } }),
      prisma.transcriptCorrection.count({ where: { roomId: ROOM_ID } }),
      prisma.transcriptSegmentVerification.count({ where: { roomId: ROOM_ID } }),
      prisma.transcriptSpeakerAttribution.findMany({ where: { transcriptJobId: JOB_ID, providerSpeakerLabel: PROVIDER_SPEAKER, status: "active" }, select: { id: true, participantId: true, participantDisplaySnapshot: true, providerSnapshotSha256: true } }),
      prisma.coachingNote.count({ where: { roomId: ROOM_ID, kind: "SUMMARY" } }),
    ]);
    assert(providerSegmentSnapshot(segmentsAfter) === providerHashBefore, "Rendered attribution mutated immutable provider segments.");
    assert(correctionsAfter === before[0], "Speaker attribution incorrectly created or changed a TranscriptCorrection row.");
    assert(verificationsAfter === before[1], "Speaker attribution incorrectly marked provider words playback-reviewed.");
    assert(active.length === 1, "Speaker cluster does not have exactly one active attribution.");
    assert(active[0].id === rendered.attributionId, "Rendered and PostgreSQL attribution identities disagree.");
    assert(active[0].participantId === PARTICIPANT_ID && active[0].participantDisplaySnapshot === PARTICIPANT_LABEL, "Active attribution lost canonical participant identity or its audit snapshot.");
    assert(packetCountAfter === before[3], "Speaker attribution unexpectedly created or replaced packet notes.");
    if (before[2] === 0) {
      assert(rendered.transcriptSnapshotBefore !== rendered.transcriptSnapshotAfter, "First attribution did not change the packet transcript snapshot.");
    }
    const outsider = await outsiderDenial(baseURL, outsiderPassword, segmentsBefore[0].text);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      roomId: ROOM_ID,
      transcriptJobId: JOB_ID,
      providerSpeakerLabel: PROVIDER_SPEAKER,
      participantLabel: PARTICIPANT_LABEL,
      audioEvidenceMapOperated: rendered.audioEvidenceMapOperated,
      audioEvidenceMapPlaybackPositionSeconds: rendered.audioEvidenceMapPlaybackPosition,
      transcriptWordLaneOperated: rendered.transcriptWordLaneOperated,
      selectedTranscriptWordVisible: rendered.selectedTranscriptWordVisible,
      playbackSampleOperated: true,
      playbackPositionSeconds: rendered.playbackPosition,
      exactRequestReplay: rendered.exactRequestReplay,
      activeAttributionCount: active.length,
      providerSegmentsImmutable: true,
      wordReviewCountUnchanged: true,
      correctionCountUnchanged: true,
      packetNotesUnchanged: true,
      packetStatusAfter: rendered.packetStatusAfter,
      packetSnapshotChangedOnFirstAttribution: before[2] === 0,
      outsiderDenial: outsider,
      browserExceptions: rendered.browserExceptions,
      horizontalOverflow: rendered.horizontalOverflow,
      credentialsPrinted: false,
      screenshotsCaptured: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
