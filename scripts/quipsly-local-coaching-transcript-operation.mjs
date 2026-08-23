#!/usr/bin/env node

import { createHash } from "node:crypto";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_LOCAL_COACHING_TRANSCRIPT_OPERATION === "1";
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Local coaching transcript operation base URL",
);
const retainedRoomId = "retained-browser-live-room-20260804";
const retainedKeychainService = "com.quipsly.qa.retained-coaching";
const retainedIdentity = {
  role: "coach",
  uid: "quipsly-coach-retained-20260731",
  email: "quipsly-coach-retained-20260731@example.test",
  displayName: "Quipsly Retained Coach",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function releasedForTranscription(asset) {
  const manifest = asset?.localManifestJson;
  return (
    manifest &&
    typeof manifest === "object" &&
    manifest.transcriptionDisposition === "RELEASED"
  );
}

async function waitForTranscript(prisma, recordingAssetId) {
  const deadline = Date.now() + 120_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await prisma.transcriptJob.findFirst({
      where: { assetId: recordingAssetId },
      orderBy: { createdAt: "desc" },
      include: {
        segments: { orderBy: [{ startSeconds: "asc" }, { id: "asc" }] },
      },
    });
    if (["COMPLETED", "FAILED", "HELD"].includes(latest?.status || ""))
      return latest;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Transcript worker did not reach a durable terminal state for ${recordingAssetId}. Last status: ${latest?.status || "not-created"}.`,
  );
}

assert(
  enabled,
  "Set QUIPSLY_LOCAL_COACHING_TRANSCRIPT_OPERATION=1 to authorize retained local transcript artifacts.",
);
const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL });
const ROOM_ID = freshContext?.roomId || retainedRoomId;
const KEYCHAIN_SERVICE =
  freshContext?.keychainService || retainedKeychainService;
const identity = freshContext?.identities.coach || retainedIdentity;
const testLane = freshContext?.testLane || "retained-regression";
const fixtureIdentifiersUsed = freshContext?.fixtureIdentifiersUsed ?? true;
const expectedTermsByRole = (() => {
  const serialized =
    process.env.QUIPSLY_LOCAL_TRANSCRIPT_EXPECTED_TERMS_JSON?.trim();
  if (!serialized) return null;
  assert(
    freshContext,
    "Controlled transcript terms require a fresh coaching acceptance context.",
  );
  const configured = JSON.parse(serialized);
  for (const role of ["coach", "client"]) {
    assert(
      Array.isArray(configured?.[role]) &&
        configured[role].length > 0 &&
        configured[role].every(
          (term) =>
            typeof term === "string" && /^[a-z0-9'-]{2,40}$/i.test(term),
        ),
      `Controlled ${role} transcript terms are missing or unsafe.`,
    );
  }
  return configured;
})();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!freshContext) {
  process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE = "keychain";
  const { main: restoreRetainedAuthIdentities } =
    await import("./quipsly-retained-coaching-auth-seed.mjs");
  await restoreRetainedAuthIdentities();
}

const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Retained coaching transcript operation requires loopback PostgreSQL and refuses remote databases.",
);
process.env.DATABASE_URL = databaseURL.toString();

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const room = await prisma.callRoom.findUnique({
  where: { id: ROOM_ID },
  include: {
    participants: {
      where: { accessStatus: "ACTIVE", role: { not: "OBSERVER" } },
      select: { id: true, userId: true },
    },
  },
});
assert(
  room,
  "Run pnpm quipsly:local:live-room before the transcript operation.",
);
if (freshContext) {
  assert(
    room.bookingId === freshContext.bookingId,
    "Fresh transcript room is not bound to the UI-created booking.",
  );
  assert(
    room.coachingEngagementId === freshContext.engagementId,
    "Fresh transcript room is not bound to the UI-created coaching relationship.",
  );
  assert(
    room.participants.some(
      (participant) => participant.userId === identity.userId,
    ),
    "Fresh coach is not an active transcript participant.",
  );
}

const participantIds = room.participants.map((participant) => participant.id);
const roleByParticipantId = new Map();
if (freshContext) {
  for (const participant of room.participants) {
    const role =
      participant.userId === freshContext.identities.coach.userId
        ? "coach"
        : participant.userId === freshContext.identities.client.userId
          ? "client"
          : null;
    if (role) roleByParticipantId.set(participant.id, role);
  }
}
const recentAssets = await prisma.recordingAsset.findMany({
  where: {
    roomId: ROOM_ID,
    participantId: { in: participantIds },
    status: "VERIFIED",
  },
  orderBy: { createdAt: "desc" },
  take: 12,
  include: {
    participant: { select: { displayName: true, email: true } },
  },
});
const sources = recentAssets
  .filter((asset) => releasedForTranscription(asset))
  .slice(0, 2)
  .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
const latestCaptureGroupId = sources[0]?.localManifestJson?.captureGroupId;
assert(
  sources.length === 2 &&
    new Set(sources.map((source) => source.participantId)).size === 2 &&
    sources.every(
      (source) =>
        source.localManifestJson?.captureGroupId === latestCaptureGroupId,
    ),
  `Expected the latest transcription-released capture group to contain two participant-owned sources; observed ${sources.length}.`,
);

const password = readRetainedQAPassword({
  service: KEYCHAIN_SERVICE,
  account: identity.email,
});
assert(password, `${testLane} coach Keychain password is unavailable.`);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
const results = [];

try {
  const firstPath = `/sessions/${ROOM_ID}?mode=transcript&source=${encodeURIComponent(sources[0].id)}`;
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password,
    callbackPath: firstPath,
  });

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const path = `/sessions/${ROOM_ID}?mode=transcript&source=${encodeURIComponent(source.id)}`;
    if (index > 0)
      await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
    const evidence = page.locator(
      'section[aria-label="Session evidence status"]',
    );
    await evidence.waitFor({ timeout: 20_000 });
    await evidence
      .getByText(`Focused RecordingAsset · ${source.id}`, { exact: true })
      .waitFor({ timeout: 20_000 });

    let transcript = await prisma.transcriptJob.findFirst({
      where: { assetId: source.id },
      orderBy: { createdAt: "desc" },
      include: { segments: true },
    });
    let renderedAutomaticCompletionObserved = false;
    if (transcript?.status !== "COMPLETED") {
      if (
        ["QUEUED", "RUNNING", "PROCESSING"].includes(transcript?.status || "")
      ) {
        await evidence
          .getByText("Completed", { exact: true })
          .waitFor({ timeout: 120_000 });
      } else {
        const action = evidence.getByRole("button", {
          name: /^(Start|Retry) transcription$/,
        });
        await action.waitFor({ timeout: 20_000 });
        const [response] = await Promise.all([
          page.waitForResponse(
            (candidate) =>
              candidate.request().method() === "POST" &&
              new URL(candidate.url()).pathname ===
                "/api/mobile/capture/transcripts/run",
          ),
          action.click(),
        ]);
        const packet = await response.json().catch(() => null);
        assert(
          response.ok() && packet?.ok === true,
          `Transcript start was rejected for ${source.id}.`,
        );
        await evidence
          .getByText("Completed", { exact: true })
          .waitFor({ timeout: 120_000 });
      }
      renderedAutomaticCompletionObserved = true;
      transcript = await waitForTranscript(prisma, source.id);
    }
    assert(
      transcript?.status === "COMPLETED",
      `Transcript ${transcript?.id || "unknown"} ended as ${transcript?.status || "missing"}.`,
    );
    const sourceRole = roleByParticipantId.get(source.participantId) || null;
    const providerText = (transcript.segments || [])
      .map((segment) => segment.text || "")
      .join(" ")
      .toLowerCase();
    const expectedTerms =
      sourceRole && expectedTermsByRole ? expectedTermsByRole[sourceRole] : [];
    const missingExpectedTerms = expectedTerms.filter(
      (term) => !providerText.includes(term.toLowerCase()),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    const refreshedEvidence = page.locator(
      'section[aria-label="Session evidence status"]',
    );
    await refreshedEvidence.waitFor({ timeout: 20_000 });
    await refreshedEvidence
      .getByText("Completed", { exact: true })
      .waitFor({ timeout: 20_000 });
    const sourceParticipantLabel =
      source.participant?.displayName || source.participant?.email || "";
    assert(
      sourceParticipantLabel,
      `Source ${source.id} has no participant label for rendered attribution.`,
    );
    const correctionDesk = page.locator("#transcript-correction-review");
    await correctionDesk.waitFor({ timeout: 20_000 });
    const routingDisclosure = correctionDesk.getByText(
      "Transcription details",
      { exact: true },
    );
    await routingDisclosure.click();
    await correctionDesk
      .getByText(sourceParticipantLabel, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    const preparePlayback = correctionDesk.getByRole("button", {
      name: "Prepare protected playback",
      exact: true,
    });
    if (await preparePlayback.count()) {
      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname ===
              "/api/mobile/capture/recordings/promote",
        ),
        preparePlayback.click(),
      ]);
      const body = await response.json().catch(() => null);
      assert(
        response.ok() && body?.ok === true,
        `Protected playback preparation failed for ${source.id}.`,
      );
    }
    const protectedMedia = correctionDesk.locator("audio, video").first();
    await protectedMedia.waitFor({ state: "visible", timeout: 20_000 });
    const playbackProbe = await protectedMedia.evaluate(async (element) => {
      const media = element;
      if (media.readyState < 1) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("protected-media-metadata-timeout")),
            20_000,
          );
          media.addEventListener(
            "loadedmetadata",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
          media.addEventListener(
            "error",
            () => {
              clearTimeout(timeout);
              reject(new Error("protected-media-decode-error"));
            },
            { once: true },
          );
          media.load();
        });
      }
      await media.play();
      const playbackDeadline = Date.now() + 5_000;
      while (
        media.currentTime <= 0 &&
        !media.ended &&
        Date.now() < playbackDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      media.pause();
      return {
        durationSeconds: Number.isFinite(media.duration)
          ? media.duration
          : null,
        currentTimeSeconds: media.currentTime,
        readyState: media.readyState,
        networkState: media.networkState,
        mediaErrorCode: media.error?.code ?? null,
        mediaErrorMessage: media.error?.message ?? null,
      };
    });
    assert(
      playbackProbe.readyState >= 1 && playbackProbe.currentTimeSeconds > 0,
      `Protected playback did not decode and advance for ${source.id}: ${JSON.stringify(playbackProbe)}.`,
    );

    await correctionDesk
      .getByRole("button", { name: "Share transcript", exact: true })
      .click();
    const downloadLink = correctionDesk.getByRole("link", {
      name: "Download prepared transcript",
      exact: true,
    });
    await downloadLink.waitFor({ state: "visible", timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const transcriptFile = Buffer.concat(chunks);
    const transcriptText = transcriptFile.toString("utf8");
    assert(
      transcriptText.includes(`Transcript job: ${transcript.id}`),
      `Prepared transcript omitted job identity for ${source.id}.`,
    );
    assert(
      transcriptText.includes(sourceParticipantLabel),
      `Prepared transcript omitted source-bound participant label for ${source.id}.`,
    );
    assert(
      transcriptText.includes(
        `Playback-reviewed turns: 0/${transcript.segments?.length || 0}`,
      ),
      `Prepared transcript did not disclose its unreviewed provider-only state for ${source.id}.`,
    );
    const packetReadback = await page.evaluate(
      async ({ roomId, recordingAssetId }) => {
        const params = new URLSearchParams({
          callRoomId: roomId,
          recordingAssetId,
        });
        const response = await fetch(
          `/api/mobile/capture/transcripts/packet?${params.toString()}`,
          { cache: "no-store" },
        );
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      },
      { roomId: ROOM_ID, recordingAssetId: source.id },
    );
    assert(
      packetReadback.status === 200 && packetReadback.body?.ok === true,
      `Rendered transcript packet readback failed for ${source.id}.`,
    );
    assert(
      packetReadback.body?.selectedRecordingAsset?.id === source.id,
      `Rendered transcript packet selected the wrong source for ${source.id}.`,
    );
    assert(
      packetReadback.body?.transcriptJob?.id === transcript.id,
      `Rendered transcript packet selected the wrong job for ${source.id}.`,
    );

    results.push({
      recordingAssetId: source.id,
      participantId: source.participantId,
      transcriptJobId: transcript.id,
      status: transcript.status,
      segmentCount: transcript.segments?.length || 0,
      sourceBoundSpeakerLabel: sourceParticipantLabel,
      sourceRole,
      transcribedWordCount: providerText.split(/\s+/).filter(Boolean).length,
      expectedTermsObserved:
        expectedTerms.length > 0 ? missingExpectedTerms.length === 0 : null,
      missingExpectedTerms,
      renderedCompletionStateObserved: true,
      renderedAutomaticCompletionObserved,
      renderedRoutingExplanationObserved: true,
      protectedPlaybackDecoded: true,
      protectedPlaybackDurationSeconds: playbackProbe.durationSeconds,
      transcriptFileDownloaded: true,
      transcriptFileByteSize: transcriptFile.length,
      transcriptFileSha256: createHash("sha256")
        .update(transcriptFile)
        .digest("hex"),
      humanPlaybackReviewRecorded: false,
    });
  }

  const controlledSpeechTermsObserved = expectedTermsByRole
    ? results.length === 2 &&
      results.every((result) => result.expectedTermsObserved === true)
    : false;
  if (expectedTermsByRole) {
    assert(
      controlledSpeechTermsObserved,
      `Controlled participant speech was not recovered distinctly: ${JSON.stringify(results.map((result) => ({ role: result.sourceRole, missingExpectedTerms: result.missingExpectedTerms, transcribedWordCount: result.transcribedWordCount })))}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        testLane,
        fixtureIdentifiersUsed,
        humanAcceptanceSatisfied: false,
        contextPath: freshContext?.contextPath || null,
        roomId: ROOM_ID,
        captureGroupId: latestCaptureGroupId,
        sourceCount: sources.length,
        participantSourceCount: new Set(
          sources.map((source) => source.participantId),
        ).size,
        renderedTranscriptRuns: results,
        controlledSpeechTermsObserved,
        realSpeechQualityProven: false,
        naturalHumanSpeechProven: false,
        humanPlaybackReviewProven: false,
        secretsPrinted: false,
      },
      null,
      2,
    ),
  );
} finally {
  await clearRenderedSession(page, baseURL, identity.role).catch(
    () => undefined,
  );
  await context.close();
  await browser.close();
  await prisma.$disconnect();
}
