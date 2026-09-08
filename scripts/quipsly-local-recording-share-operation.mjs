#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { assertNoHorizontalOverflow, clearRenderedSession, loadPlaywright, requireLoopbackOrigin, signInThroughRenderedLogin } from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION === "1";
const editRequested = process.env.QUIPSLY_LOCAL_RECORDING_SHARE_EDIT_OPERATION === "1";
const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012", "Local recording-share operation base URL");
const retainedRoomId = "retained-browser-live-room-20260804";
const retainedBookingId = "retained-browser-live-room-booking-20260819";
const retainedKeychainService = "com.quipsly.qa.retained-coaching";
const retainedIdentities = {
  coach: { role: "coach", uid: "quipsly-coach-retained-20260731", email: "quipsly-coach-retained-20260731@example.test", displayName: "Quipsly Retained Coach" },
  client: { role: "client", uid: "quipsly-client-retained-20260731", email: "quipsly-client-retained-20260731@example.test", displayName: "Quipsly Retained Client" },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function decodeAndAdvance(card) {
  const audio = card.locator("audio");
  await audio.waitFor({ state: "visible", timeout: 60_000 });
  return audio.evaluate(async (element) => {
    if (element.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("recording-share-metadata-timeout")), 20_000);
        element.addEventListener("loadedmetadata", () => { clearTimeout(timeout); resolve(); }, { once: true });
        element.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("recording-share-decode-error")); }, { once: true });
        element.load();
      });
    }
    await element.play();
    await new Promise((resolve) => setTimeout(resolve, 400));
    element.pause();
    return { readyState: element.readyState, durationSeconds: element.duration, currentTimeSeconds: element.currentTime };
  });
}

async function assertShareAvailableWithoutListeningCeremony(card, recipientLabel) {
  const release = card.getByRole("button", {
    name: `Share with ${recipientLabel}`,
    exact: true,
  });
  await release.waitFor({ state: "visible", timeout: 30_000 });
  assert(await release.isEnabled(), "A verified private preview was held behind a listening ceremony.");
  return { previewRemainsAvailable: true, listeningReceiptOptional: true, shareAvailableNow: true };
}

assert(enabled, "Set QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION=1 to authorize retained local recording-share artifacts.");
const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL });
const ROOM_ID = freshContext?.roomId || retainedRoomId;
const BOOKING_ID = freshContext?.bookingId || retainedBookingId;
const KEYCHAIN_SERVICE = freshContext?.keychainService || retainedKeychainService;
const identities = freshContext?.identities || retainedIdentities;
const testLane = freshContext?.testLane || "retained-regression";
const fixtureIdentifiersUsed = freshContext?.fixtureIdentifiersUsed ?? true;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!freshContext) {
  process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE = "keychain";
  const { main: restoreRetainedAuthIdentities } = await import("./quipsly-retained-coaching-auth-seed.mjs");
  await restoreRetainedAuthIdentities();
}

const databaseURL = new URL(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
assert(["postgres:", "postgresql:"].includes(databaseURL.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname), "Recording-share operation refuses non-loopback PostgreSQL.");
process.env.DATABASE_URL = databaseURL.toString();
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();

const users = await prisma.user.findMany({ where: freshContext ? { id: { in: Object.values(identities).map((identity) => identity.userId) } } : { firebaseUid: { in: Object.values(identities).map((identity) => identity.uid) } }, select: { id: true, firebaseUid: true } });
const userByUid = new Map(users.map((user) => [user.firebaseUid, user.id]));
const coachUserId = userByUid.get(identities.coach.uid);
const clientUserId = userByUid.get(identities.client.uid);
assert(coachUserId && clientUserId, "Retained coach and client database identities are required.");
const room = await prisma.callRoom.findUnique({
  where: { id: ROOM_ID },
  select: {
    id: true,
    bookingId: true,
    captureGroupId: true,
    recordingAssets: {
      where: { kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] }, status: "VERIFIED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, checksum: true, localManifestJson: true, participantId: true, createdAt: true, recordedStartedAt: true },
    },
  },
});
assert(room, "Run pnpm quipsly:local:live-room before the recording-share operation.");
if (freshContext) {
  assert(room.bookingId === freshContext.bookingId, "Fresh recording-share room is not bound to the UI-created booking.");
} else if (!room.bookingId) {
  await prisma.coachingBooking.upsert({
    where: { id: BOOKING_ID },
    create: { id: BOOKING_ID, clientUserId, coachUserId, status: "CONFIRMED", scheduledStart: new Date(Date.now() - 60 * 60_000), scheduledEnd: new Date(Date.now() + 60 * 60_000), timezone: "America/Denver", metadataJson: { retainedTestArtifact: true, testLane: "retained-regression" } },
    update: { clientUserId, coachUserId },
  });
  await prisma.callRoom.update({ where: { id: ROOM_ID }, data: { bookingId: BOOKING_ID } });
}

const currentSources = room.recordingAssets.filter((asset) => {
  const manifest = asset.localManifestJson && typeof asset.localManifestJson === "object"
    ? asset.localManifestJson
    : {};
  const recordingSync = manifest.recordingSync && typeof manifest.recordingSync === "object"
    ? manifest.recordingSync
    : {};
  return (manifest.captureGroupId || recordingSync.captureGroupId) === room.captureGroupId;
});
assert(
  currentSources.length >= 2 &&
    new Set(currentSources.map((asset) => asset.participantId)).size >= 2,
  `The current recording session ${room.captureGroupId} needs at least two participant-owned verified sources. Run pnpm quipsly:local:live-room first.`,
);
const originalHashes = new Map(currentSources.map((asset) => [asset.id, asset.checksum]));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const coachContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", acceptDownloads: true });
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const results = {};

try {
  for (const [role, page] of [["coach", coachPage], ["client", clientPage]]) {
    const identity = identities[role];
    const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: identity.email });
    assert(password, `Retained ${role} Keychain password is unavailable.`);
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: `/sessions/${ROOM_ID}?mode=outputs` });
  }
  let coachCard = coachPage.locator("#recording-share");
  await coachCard.waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(coachCard, "coach recording share");
  const previousRelease = coachCard.getByRole("button", { name: "Revoke client access", exact: true });
  if (await previousRelease.count()) {
    await previousRelease.click();
    await coachCard.getByText("Access revoked", { exact: false }).waitFor({ timeout: 30_000 });
    await coachPage.reload({ waitUntil: "domcontentloaded" });
    coachCard = coachPage.locator("#recording-share");
  }
  const prepareButton = coachCard.getByRole("button", { name: "Create private preview", exact: true });
  if (editRequested) {
    const editButton = coachCard.getByRole("button", { name: /^(Edit private preview|Create new private edit|Review trim and try again)$/ });
    await Promise.race([prepareButton.waitFor(), editButton.waitFor()]);
    if (await editButton.isVisible()) await editButton.click();
    await prepareButton.waitFor();
  }
  await Promise.race([
    prepareButton.waitFor({ state: "visible", timeout: 30_000 }),
    coachCard.getByText("VERIFIED", { exact: true }).waitFor({ timeout: 30_000 }),
  ]);
  if (await prepareButton.isVisible().catch(() => false)) {
    const sourceCheckboxes = coachCard.locator('fieldset input[type="checkbox"]');
    assert(await sourceCheckboxes.count() >= 2, "Rendered preparation did not offer separately attributed participant masters.");
    const checkedCount = await sourceCheckboxes.evaluateAll((boxes) => boxes.filter((box) => box.checked).length);
    assert(checkedCount >= 2, "Rendered preparation did not default to one master per participant.");
    const renderedRange = await coachCard.locator('input[type="number"]').evaluateAll((inputs) => inputs.map((input) => input.value));
    const preparationSnapshot = await coachPage.evaluate(async (roomId) => {
      const response = await fetch(`/api/sessions/${roomId}/recording-share`, { cache: "no-store" });
      return response.json();
    }, ROOM_ID);
    const expectedSourceIds = [...originalHashes.keys()].sort();
    const availableSourceIds = (preparationSnapshot?.available?.sources || [])
      .map((source) => source.id)
      .sort();
    assert(
      JSON.stringify(availableSourceIds) === JSON.stringify(expectedSourceIds),
      `Rendered editor crossed recording-session boundaries. Expected ${expectedSourceIds.length} sources in ${room.captureGroupId}; received ${availableSourceIds.length}.`,
    );
    if (editRequested) {
      const duration = preparationSnapshot.available.programDurationSeconds;
      assert(duration > 5, "The editing journey needs a recording longer than five seconds.");
      const startSeconds = 0.5;
      const endSeconds = Math.floor((duration - 0.5) * 10) / 10;
      const passage = preparationSnapshot.available.transcriptSegments.find((segment) => (
        segment.cutSafety === "safe" && segment.cutStartSeconds >= startSeconds && segment.cutEndSeconds <= endSeconds
        && segment.cutEndSeconds > segment.cutStartSeconds && segment.cutEndSeconds - segment.cutStartSeconds < (endSeconds - startSeconds) / 2
      ));
      assert(passage, "No source-timed passage is available for a real text-based cut.");
      const timing = coachCard.locator("details").filter({ hasText: "Precise timing" });
      if (!(await timing.evaluate((element) => element.open))) await timing.locator("summary").click();
      await timing.getByRole("spinbutton", { name: "Start (seconds)", exact: true }).fill(String(startSeconds));
      await timing.getByRole("spinbutton", { name: "End (seconds)", exact: true }).fill(String(endSeconds));
      const restoreAll = coachCard.getByRole("button", { name: "Restore all", exact: true });
      if (await restoreAll.isVisible()) await restoreAll.click();
      const keep = coachCard.getByRole("checkbox", { name: `Keep in recording: ${passage.text}`, exact: true });
      await keep.uncheck();
      await coachCard.getByRole("checkbox", { name: `Restore to recording: ${passage.text}`, exact: true }).waitFor();
      results.edit = { startSeconds, endSeconds, segmentId: passage.segmentId,
        expectedDurationSeconds: endSeconds - startSeconds - (passage.cutEndSeconds - passage.cutStartSeconds) };
      const [refresh] = await Promise.all([
        coachPage.waitForResponse((candidate) => candidate.request().method() === "GET" && new URL(candidate.url()).pathname === `/api/sessions/${ROOM_ID}/recording-share`),
        coachCard.getByRole("button", { name: "Refresh", exact: true }).click(),
      ]);
      assert(refresh.ok(), "Recording availability refresh failed.");
      await coachCard.getByRole("group", { name: "Recording edit", exact: true }).waitFor();
      assert(Number(await timing.getByRole("spinbutton", { name: "Start (seconds)", exact: true }).inputValue()) === startSeconds, "Refresh replaced the unfinished start trim.");
      assert(Number(await timing.getByRole("spinbutton", { name: "End (seconds)", exact: true }).inputValue()) === endSeconds, "Refresh replaced the unfinished end trim.");
      assert(!await coachCard.getByRole("checkbox", { name: `Restore to recording: ${passage.text}`, exact: true }).isChecked(), "Refresh removed the unfinished transcript cut.");
    }
    const [prepareResponse] = await Promise.all([
      coachPage.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${ROOM_ID}/recording-share`),
      prepareButton.click(),
    ]);
    const preparePacket = await prepareResponse.json().catch(() => null);
    assert(
      prepareResponse.ok() && preparePacket?.ok === true,
      `Private preview request failed (${prepareResponse.status()}): ${JSON.stringify(preparePacket)}. Range: ${JSON.stringify(renderedRange)}. Capture group: ${room.captureGroupId}. Sources: ${availableSourceIds.length}.`,
    );
    if (preparePacket.output) await coachCard.getByText(`Revision ${preparePacket.output.revision} · Private coach draft`, { exact: true }).waitFor({ timeout: 30_000 });
  }
  await coachCard.getByText("VERIFIED", { exact: true }).waitFor({ timeout: 120_000 });
  results.coachPreview = await decodeAndAdvance(coachCard);
  assert(results.coachPreview.readyState >= 1 && results.coachPreview.currentTimeSeconds > 0, "Coach preview did not decode and advance.");
  results.playbackReview = await assertShareAvailableWithoutListeningCeremony(
    coachCard,
    identities.client.displayName,
  );
  const output = await prisma.sessionOutput.findFirstOrThrow({ where: { roomId: ROOM_ID, kind: "RECORDING_SHARE", status: "DRAFT" }, orderBy: { updatedAt: "desc" }, select: { id: true, revision: true, contentSha256: true, bodyJson: true, sourceManifestJson: true } });
  if (editRequested) {
    assert(output.bodyJson.edit.startSeconds === results.edit.startSeconds && output.bodyJson.edit.endSeconds === results.edit.endSeconds, "The saved edit lost its exact trim.");
    assert(output.bodyJson.edit.transcriptExclusions.length === 1 && output.bodyJson.edit.transcriptExclusions[0].segmentId === results.edit.segmentId, "The saved edit lost or substituted its transcript cut.");
    assert(Math.abs(Number(output.bodyJson.render.durationSeconds) - results.edit.expectedDurationSeconds) < 0.2, "The rendered duration did not match the trim and source-timed text cut.");
  }
  const previousDeliveryCount = await prisma.deliveryEvent.count({ where: { outputId: output.id } });
  results.previousDeliveryCount = previousDeliveryCount;
  const derived = await prisma.recordingAsset.findUniqueOrThrow({ where: { id: output.bodyJson.render.recordingAssetId }, select: { id: true, checksum: true, byteSize: true, storageBucket: true, storageObjectPath: true, localManifestJson: true } });
  assert(derived.localManifestJson?.sessionRecordingShare?.outputId === output.id, "Derived recording omitted exact output lineage.");
  const [releaseRequest] = await Promise.all([
    coachPage.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/sessions/${ROOM_ID}/recording-share` && request.postDataJSON()?.action === "RELEASE"),
    coachCard.getByRole("button", { name: `Share with ${identities.client.displayName}`, exact: true }).click(),
  ]);
  const releaseBody = releaseRequest.postDataJSON();
  await coachCard.getByText(`Visible to ${identities.client.displayName}`, { exact: false }).waitFor({ timeout: 30_000 });
  const releaseReplay = await coachPage.evaluate(async ({ roomId, body }) => {
    const response = await fetch(`/api/sessions/${roomId}/recording-share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, packet: await response.json() };
  }, { roomId: ROOM_ID, body: releaseBody });
  assert(releaseReplay.status === 200 && releaseReplay.packet?.idempotentReplay === true, `Release retry was not idempotent: ${JSON.stringify(releaseReplay)}`);

  await clientPage.reload({ waitUntil: "domcontentloaded" });
  const clientCard = clientPage.locator("#recording-share");
  await clientCard.getByText("Your coach shared this private recording in your Session.", { exact: true }).waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(clientCard, "client recording share at phone width");
  results.clientPlayback = await decodeAndAdvance(clientCard);
  assert(results.clientPlayback.readyState >= 1 && results.clientPlayback.currentTimeSeconds > 0, "Recipient playback did not decode and advance.");
  results.clientMediaStatusBeforeRevoke = await clientPage.evaluate(async ({ roomId, outputId }) => (await fetch(`/api/sessions/${roomId}/recording-share/media/${outputId}`, { cache: "no-store" })).status, { roomId: ROOM_ID, outputId: output.id });
  assert(results.clientMediaStatusBeforeRevoke === 200, `Recipient media readback returned ${results.clientMediaStatusBeforeRevoke} before revoke.`);
  const [download] = await Promise.all([
    clientPage.waitForEvent("download"),
    clientCard.getByRole("link", { name: "Download private copy", exact: true }).click(),
  ]);
  assert(!await download.failure(), "The recipient's recording download failed.");
  assert(/^[a-z0-9-]+$/i.test(output.id), "Unexpected recording output filename.");
  const downloadDirectory = freshContext ? path.dirname(freshContext.contextPath) : await mkdtemp(path.join(os.tmpdir(), "quipsly-recording-download-"));
  const downloadPath = path.join(downloadDirectory, `${output.id}.m4a`);
  await download.saveAs(downloadPath);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(downloadPath)) hash.update(chunk);
  assert(hash.digest("hex") === derived.checksum, "The downloaded bytes do not match the verified recording.");
  assert((await stat(downloadPath)).size === Number(derived.byteSize), "The downloaded recording is truncated.");
  const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", downloadPath], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const decoded = JSON.parse(stdout);
  assert(decoded.streams.some((stream) => stream.codec_type === "audio"), "The downloaded recording has no audio stream.");
  const downloadedDurationSeconds = Number(decoded.format?.duration);
  const expectedDurationSeconds = results.edit?.expectedDurationSeconds ?? Number(output.bodyJson.render.durationSeconds);
  assert(Number.isFinite(downloadedDurationSeconds) && Math.abs(downloadedDurationSeconds - expectedDurationSeconds) < 0.25, "The downloaded media duration does not match the edit.");
  results.download = { path: downloadPath, sha256MatchesVerifiedAsset: true, durationSeconds: downloadedDurationSeconds, byteSize: Number(derived.byteSize) };

  const [revokeRequest] = await Promise.all([
    coachPage.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/sessions/${ROOM_ID}/recording-share` && request.postDataJSON()?.action === "REVOKE"),
    coachCard.getByRole("button", { name: "Revoke client access", exact: true }).click(),
  ]);
  const revokeBody = revokeRequest.postDataJSON();
  await coachCard.getByText("Access revoked", { exact: false }).waitFor({ timeout: 30_000 });
  const revokeReplay = await coachPage.evaluate(async ({ roomId, body }) => {
    const response = await fetch(`/api/sessions/${roomId}/recording-share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, packet: await response.json() };
  }, { roomId: ROOM_ID, body: revokeBody });
  assert(revokeReplay.status === 200 && revokeReplay.packet?.idempotentReplay === true, `Revoke retry was not idempotent: ${JSON.stringify(revokeReplay)}`);
  results.clientMediaStatusAfterRevoke = await clientPage.evaluate(async ({ roomId, outputId }) => (await fetch(`/api/sessions/${roomId}/recording-share/media/${outputId}`, { cache: "no-store" })).status, { roomId: ROOM_ID, outputId: output.id });
  assert(results.clientMediaStatusAfterRevoke === 404, `Recipient media remained readable after revoke (${results.clientMediaStatusAfterRevoke}).`);
  results.output = output;
  results.derived = derived;
  await clearRenderedSession(coachPage, baseURL, "coach");
  await clearRenderedSession(clientPage, baseURL, "client");
} finally {
  await coachContext.close();
  await clientContext.close();
  await browser.close();
}

const sourceReadback = await prisma.recordingAsset.findMany({ where: { id: { in: [...originalHashes.keys()] } }, select: { id: true, checksum: true } });
assert(sourceReadback.every((asset) => originalHashes.get(asset.id) === asset.checksum), "A source master checksum changed during non-destructive share preparation.");
const deliveryEvents = await prisma.deliveryEvent.findMany({ where: { outputId: results.output.id }, orderBy: { occurredAt: "asc" }, select: { kind: true, status: true, recipientUserId: true, contentSha256: true } });
assert(deliveryEvents.slice(results.previousDeliveryCount).map((event) => event.kind).join(",") === "RELEASED_IN_APP,REVOKED", "Release and revoke did not create separate durable events.");

console.log(JSON.stringify({
  ok: true,
  localOnly: true,
  testLane,
  fixtureIdentifiersUsed,
  humanAcceptanceSatisfied: false,
  contextPath: freshContext?.contextPath || null,
  roomId: ROOM_ID,
  captureGroupId: room.captureGroupId,
  sourceAssetIds: [...originalHashes.keys()],
  sourceChecksumsUnchanged: true,
  editedThroughRenderedUi: editRequested,
  edit: results.edit || null,
  outputId: results.output.id,
  outputContentSha256: results.output.contentSha256,
  derivedAssetId: results.derived.id,
  derivedSha256: results.derived.checksum,
  derivedSizeBytes: Number(results.derived.byteSize),
  coachPreviewDecoded: true,
  shareAvailableWithoutListeningCeremony: results.playbackReview.shareAvailableNow,
  clientPlaybackDecoded: true,
  recipientDownload: results.download,
  clientMediaStatusBeforeRevoke: results.clientMediaStatusBeforeRevoke,
  clientMediaStatusAfterRevoke: results.clientMediaStatusAfterRevoke,
  releaseRetryIdempotent: true,
  revokeRetryIdempotent: true,
  releaseAndRevokeEvents: deliveryEvents,
  boundaries: { originalSourcesMutated: false, clientDraftVisibility: false, releaseWasExplicit: true, revokeWasExplicit: true, listeningReceiptOptional: true, externalMessageSent: false, publicLinkCreated: false, realSpeechAccuracyProven: false, humanListeningProven: false, freshNoviceJourneyProven: false, freshContextMutatedOutsideProduct: false },
}, null, 2));

await prisma.$disconnect();
