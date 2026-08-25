#!/usr/bin/env node

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { assertNoHorizontalOverflow, clearRenderedSession, loadPlaywright, requireLoopbackOrigin, signInThroughRenderedLogin } from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION === "1";
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

async function completeRequiredPreviewReview(card, recipientLabel) {
  const progress = card.getByRole("progressbar", {
    name: "Private preview listening review",
  });
  await progress.waitFor({ state: "visible", timeout: 30_000 });
  const required = Number(await progress.getAttribute("aria-valuemax"));
  let observed = Number(await progress.getAttribute("aria-valuenow"));
  assert(
    Number.isInteger(required) && required > 0,
    `Private preview did not disclose required listening checkpoints (${required}).`,
  );
  while (observed < required) {
    const before = observed;
    await card
      .getByRole("button", { name: "Play next review point", exact: true })
      .click();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      observed = Number(await progress.getAttribute("aria-valuenow"));
      if (observed > before) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(
      observed > before,
      `Preview listening checkpoint did not advance beyond ${before}/${required}.`,
    );
  }
  await card
    .getByText("Listening review saved for this exact revision", { exact: false })
    .waitFor({ timeout: 30_000 });
  const release = card.getByRole("button", {
    name: `Share with ${recipientLabel}`,
    exact: true,
  });
  await release.waitFor({ state: "visible", timeout: 30_000 });
  assert(await release.isEnabled(), "Reviewed private preview remained held from release.");
  return { requiredCheckpointCount: required, observedCheckpointCount: observed };
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
    recordingAssets: {
      where: { kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] }, status: "VERIFIED" },
      orderBy: { createdAt: "desc" },
      take: 20,
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

const chronological = room.recordingAssets
  .filter((asset) => asset.recordedStartedAt)
  .sort((left, right) => left.recordedStartedAt.getTime() - right.recordedStartedAt.getTime());
const sourceClusters = [];
for (const asset of chronological) {
  const cluster = sourceClusters.at(-1);
  const previousStart = cluster?.at(-1)?.recordedStartedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (!cluster || asset.recordedStartedAt.getTime() - previousStart > 30_000) sourceClusters.push([asset]);
  else cluster.push(asset);
}
const latestSources = sourceClusters.at(-1) || [];
assert(latestSources.length >= 2 && new Set(latestSources.map((asset) => asset.participantId)).size >= 2, "The latest retained capture group needs at least two participant-owned verified sources.");
const originalHashes = new Map(latestSources.map((asset) => [asset.id, asset.checksum]));

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
    const [prepareResponse] = await Promise.all([
      coachPage.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/sessions/${ROOM_ID}/recording-share`),
      prepareButton.click(),
    ]);
    const preparePacket = await prepareResponse.json().catch(() => null);
    assert(prepareResponse.ok() && preparePacket?.ok === true, `Private preview request failed (${prepareResponse.status()}): ${JSON.stringify(preparePacket)}. Inputs: ${JSON.stringify(renderedRange)}. Available: ${JSON.stringify(preparationSnapshot?.available)}`);
  }
  await coachCard.getByText("VERIFIED", { exact: true }).waitFor({ timeout: 120_000 });
  results.coachPreview = await decodeAndAdvance(coachCard);
  assert(results.coachPreview.readyState >= 1 && results.coachPreview.currentTimeSeconds > 0, "Coach preview did not decode and advance.");
  results.playbackReview = await completeRequiredPreviewReview(
    coachCard,
    identities.client.displayName,
  );
  const output = await prisma.sessionOutput.findFirstOrThrow({ where: { roomId: ROOM_ID, kind: "RECORDING_SHARE", status: "DRAFT" }, orderBy: { updatedAt: "desc" }, select: { id: true, revision: true, contentSha256: true, bodyJson: true, sourceManifestJson: true } });
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
  await clientCard.getByText("Your coach released this reviewed copy to your private Session.", { exact: true }).waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(clientCard, "client recording share at phone width");
  results.clientPlayback = await decodeAndAdvance(clientCard);
  assert(results.clientPlayback.readyState >= 1 && results.clientPlayback.currentTimeSeconds > 0, "Recipient playback did not decode and advance.");
  results.clientMediaStatusBeforeRevoke = await clientPage.evaluate(async ({ roomId, outputId }) => (await fetch(`/api/sessions/${roomId}/recording-share/media/${outputId}`, { cache: "no-store" })).status, { roomId: ROOM_ID, outputId: output.id });
  assert(results.clientMediaStatusBeforeRevoke === 200, `Recipient media readback returned ${results.clientMediaStatusBeforeRevoke} before revoke.`);

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
assert(deliveryEvents.map((event) => event.kind).join(",") === "RELEASED_IN_APP,REVOKED", "Release and revoke did not create separate durable events.");

console.log(JSON.stringify({
  ok: true,
  localOnly: true,
  testLane,
  fixtureIdentifiersUsed,
  humanAcceptanceSatisfied: false,
  contextPath: freshContext?.contextPath || null,
  roomId: ROOM_ID,
  sourceAssetIds: [...originalHashes.keys()],
  sourceChecksumsUnchanged: true,
  outputId: results.output.id,
  outputContentSha256: results.output.contentSha256,
  derivedAssetId: results.derived.id,
  derivedSha256: results.derived.checksum,
  derivedSizeBytes: Number(results.derived.byteSize),
  coachPreviewDecoded: true,
  clientPlaybackDecoded: true,
  clientMediaStatusBeforeRevoke: results.clientMediaStatusBeforeRevoke,
  clientMediaStatusAfterRevoke: results.clientMediaStatusAfterRevoke,
  releaseRetryIdempotent: true,
  revokeRetryIdempotent: true,
  releaseAndRevokeEvents: deliveryEvents,
  boundaries: { originalSourcesMutated: false, clientDraftVisibility: false, releaseWasExplicit: true, revokeWasExplicit: true, externalMessageSent: false, publicLinkCreated: false, realSpeechAccuracyProven: false, humanListeningProven: false, freshNoviceJourneyProven: false, freshContextMutatedOutsideProduct: false },
}, null, 2));

await prisma.$disconnect();
