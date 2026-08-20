#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_LOCAL_LIVE_ROOM_OPERATION === "1";
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Local live-room operation base URL",
);
const retainedRoomId = "retained-browser-live-room-20260804";
const retainedProviderRoomId = "quipsly-retained-browser-live-room-20260804";
const retainedKeychainService = "com.quipsly.qa.retained-coaching";
const retainedIdentities = [
  {
    role: "coach",
    uid: "quipsly-coach-retained-20260731",
    email: "quipsly-coach-retained-20260731@example.test",
    displayName: "Quipsly Retained Coach",
  },
  {
    role: "client",
    uid: "quipsly-client-retained-20260731",
    email: "quipsly-client-retained-20260731@example.test",
    displayName: "Quipsly Retained Client",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  enabled,
  "Set QUIPSLY_LOCAL_LIVE_ROOM_OPERATION=1 to authorize retained local call and chat artifacts.",
);

const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL });
const ROOM_ID = freshContext?.roomId || retainedRoomId;
let PROVIDER_ROOM_ID = retainedProviderRoomId;
const KEYCHAIN_SERVICE =
  freshContext?.keychainService || retainedKeychainService;
const identities = freshContext
  ? [freshContext.identities.coach, freshContext.identities.client]
  : retainedIdentities;
const testLane = freshContext?.testLane || "retained-regression";
const fixtureIdentifiersUsed = freshContext?.fixtureIdentifiersUsed ?? true;
const keepRoomOpenForInterop =
  Boolean(freshContext) ||
  process.env.QUIPSLY_LOCAL_LIVE_ROOM_KEEP_OPEN === "1";
const requestedRecordingMilliseconds = Number.parseInt(
  process.env.QUIPSLY_LOCAL_LIVE_ROOM_RECORDING_MS || "3000",
  10,
);
assert(
  Number.isInteger(requestedRecordingMilliseconds) &&
    requestedRecordingMilliseconds >= 3_000 &&
    requestedRecordingMilliseconds <= 120_000,
  "Local live-room recording duration must be between 3000 and 120000 milliseconds.",
);

async function loadSyntheticSpeechSources() {
  const serialized =
    process.env.QUIPSLY_LOCAL_LIVE_ROOM_AUDIO_FILES_JSON?.trim();
  if (!serialized) return null;
  assert(
    freshContext,
    "Participant speech files are reserved for a fresh coaching acceptance context.",
  );
  const configured = JSON.parse(serialized);
  assert(
    configured && typeof configured === "object" && !Array.isArray(configured),
    "Participant speech files must be a JSON object keyed by coach and client.",
  );
  const resolved = {};
  for (const identity of identities) {
    const candidate = configured[identity.role];
    assert(
      typeof candidate === "string" && candidate.trim(),
      `Synthetic ${identity.role} speech file is missing.`,
    );
    const audioPath = path.resolve(candidate);
    assert(
      path.isAbsolute(candidate),
      `Synthetic ${identity.role} speech file must use an absolute path.`,
    );
    const file = await stat(audioPath);
    assert(
      file.isFile() && file.size > 0,
      `Synthetic ${identity.role} speech file is not a non-empty regular file.`,
    );
    resolved[identity.role] = audioPath;
  }
  return resolved;
}

const syntheticSpeechSources = await loadSyntheticSpeechSources();

// Firebase emulator accounts are intentionally ephemeral. Restore the same
// reserved .test identities from macOS Keychain on every operated rehearsal so
// a clean emulator boot cannot masquerade as a product login or call failure.
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
  "Retained live-room operation requires loopback PostgreSQL and refuses remote databases.",
);
process.env.DATABASE_URL = databaseURL.toString();

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const users = await prisma.user.findMany({
  where: freshContext
    ? { id: { in: identities.map((identity) => identity.userId) } }
    : { firebaseUid: { in: identities.map((identity) => identity.uid) } },
  select: { id: true, firebaseUid: true },
});
const userByUid = new Map(users.map((user) => [user.firebaseUid, user.id]));
for (const identity of identities) {
  const databaseUserId = userByUid.get(identity.uid);
  assert(databaseUserId, `${identity.role} database identity is unavailable.`);
  if (freshContext) {
    assert(
      databaseUserId === identity.userId,
      `Fresh ${identity.role} database identity does not match its context.`,
    );
  }
}

if (freshContext) {
  const room = await prisma.callRoom.findUnique({
    where: { id: ROOM_ID },
    select: {
      bookingId: true,
      coachingEngagementId: true,
      purpose: true,
      provider: true,
      providerRoomId: true,
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: { userId: true },
      },
    },
  });
  assert(
    room?.bookingId === freshContext.bookingId,
    "Fresh room is not bound to the UI-created booking.",
  );
  assert(
    room?.coachingEngagementId === freshContext.engagementId,
    "Fresh room is not bound to the UI-created coaching relationship.",
  );
  assert(
    room?.purpose === "COACHING" && room?.provider === "livekit",
    "Fresh Session is not a LiveKit coaching room.",
  );
  assert(room?.providerRoomId, "Fresh Session has no provider room identity.");
  PROVIDER_ROOM_ID = room.providerRoomId;
  const activeUserIds = new Set(
    room.participants.map((participant) => participant.userId),
  );
  for (const identity of identities) {
    assert(
      activeUserIds.has(identity.userId),
      `Fresh ${identity.role} is not an active Session participant.`,
    );
  }
} else {
  const sourceRoom = await prisma.callRoom.findUnique({
    where: { id: "retained-coaching-follow-up-20260731" },
    select: { projectId: true, projectSlug: true, nestSlug: true },
  });
  assert(
    sourceRoom?.projectId,
    "The retained coaching Nest fixture is unavailable.",
  );
  await prisma.callRoom.upsert({
    where: { id: ROOM_ID },
    create: {
      id: ROOM_ID,
      projectId: sourceRoom.projectId,
      projectSlug: sourceRoom.projectSlug,
      nestSlug: sourceRoom.nestSlug,
      createdByUserId: userByUid.get(identities[0].uid),
      purpose: "COACHING",
      status: "OPEN",
      provider: "livekit",
      providerRoomId: PROVIDER_ROOM_ID,
      title: "Retained browser and iPhone live-room rehearsal",
      openedAt: new Date(),
      metadataJson: {
        source: "quipsly-local-live-room-operation",
        localOnly: true,
        retainedTestArtifact: true,
      },
    },
    update: {
      projectId: sourceRoom.projectId,
      projectSlug: sourceRoom.projectSlug,
      nestSlug: sourceRoom.nestSlug,
      status: "OPEN",
      provider: "livekit",
      providerRoomId: PROVIDER_ROOM_ID,
      openedAt: new Date(),
      endedAt: null,
    },
  });
  // Keep one durable participant identity per retained actor. Recreating these
  // rows would detach prior source ownership through the SetNull relation.
  for (const identity of identities) {
    const userId = userByUid.get(identity.uid);
    const existing = await prisma.callParticipant.findFirst({
      where: { roomId: ROOM_ID, userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const data = {
      userId,
      email: identity.email,
      displayName: identity.displayName,
      role: identity.role === "coach" ? "COACH" : "CLIENT",
      accessStatus: "ACTIVE",
      deviceLabel: `Retained ${identity.role} browser`,
    };
    if (existing) {
      await prisma.callParticipant.update({ where: { id: existing.id }, data });
    } else {
      await prisma.callParticipant.create({
        data: { roomId: ROOM_ID, ...data },
      });
    }
  }
}

const { chromium } = await loadPlaywright();
const browsers = [];
const sharedBrowser = syntheticSpeechSources
  ? null
  : await chromium.launch({
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
if (sharedBrowser) browsers.push(sharedBrowser);
const journeys = [];
try {
  for (const identity of identities) {
    const browser =
      sharedBrowser ||
      (await chromium.launch({
        headless: true,
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-audio-capture=${syntheticSpeechSources[identity.role]}`,
          "--autoplay-policy=no-user-gesture-required",
        ],
      }));
    if (!sharedBrowser) browsers.push(browser);
    const password = readRetainedQAPassword({
      service: KEYCHAIN_SERVICE,
      account: identity.email,
    });
    assert(
      password,
      `Retained ${identity.role} Keychain password is unavailable.`,
    );
    const context = await browser.newContext({
      viewport:
        identity.role === "coach"
          ? { width: 1440, height: 1000 }
          : { width: 390, height: 844 },
      permissions: ["microphone", "camera"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const callbackPath = `/sessions/${ROOM_ID}?mode=live`;
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath,
    });
    const allowMicrophone = page.getByRole("button", {
      name: "Allow microphone",
      exact: true,
    });
    await allowMicrophone.waitFor({ timeout: 20_000 });
    await allowMicrophone.click();
    const join = page.getByRole("button", {
      name: "Join live room",
      exact: true,
    });
    await join.waitFor({ state: "visible", timeout: 20_000 });
    for (
      let attempt = 0;
      attempt < 40 && !(await join.isEnabled());
      attempt += 1
    ) {
      await page.waitForTimeout(250);
    }
    const microphoneOptions = await page
      .getByRole("combobox", { name: "Microphone" })
      .locator("option")
      .allInnerTexts();
    assert(
      await join.isEnabled(),
      `${identity.role} live-room join did not become ready. Microphones: ${JSON.stringify(microphoneOptions)}`,
    );
    journeys.push({ identity, context, page, join });
  }

  // Finish both rendered lobbies before either endpoint joins. In local Next
  // development, the first request can compile and remount a page; allowing
  // that warm-up inside a measured call creates a development-server failure
  // that production users never cause by signing in on another device.
  for (const journey of journeys) {
    await journey.join.click();
    await journey.page
      .getByRole("button", { name: "Leave", exact: true })
      .waitFor({ timeout: 20_000 });
  }

  for (const journey of journeys) {
    await journey.page
      .waitForFunction(
        () =>
          document.body.innerText.toLowerCase().includes("in this room · 2"),
        null,
        { timeout: 20_000 },
      )
      .catch(async (error) => {
        const rosterLines = (await journey.page.locator("body").innerText())
          .split("\n")
          .filter((line) => line.toLowerCase().includes("in this room"));
        const statusLines = (
          await journey.page.locator('[role="status"]').allInnerTexts()
        )
          .map((line) => line.trim())
          .filter(Boolean);
        const visibleButtons = await journey.page
          .getByRole("button")
          .allInnerTexts();
        throw new Error(
          `${journey.identity.role} rendered roster did not reach two participants. ` +
            `Observed: ${JSON.stringify(rosterLines)}. ` +
            `Statuses: ${JSON.stringify(statusLines)}. ` +
            `Buttons: ${JSON.stringify(visibleButtons)}. ` +
            `URL: ${journey.page.url()}. ` +
            `${error instanceof Error ? error.message : ""}`,
        );
      });
  }

  const receiptText = `Retained local call rehearsal passed for two browser participants on ${new Date().toISOString()}.`;
  const coachComposer = journeys[0].page.getByPlaceholder(
    "Write to everyone in this Session…",
  );
  await coachComposer.fill(receiptText);
  await journeys[0].page
    .getByRole("button", { name: "Send collaboration message", exact: true })
    .click();
  await journeys[1].page
    .getByText(receiptText, { exact: true })
    .waitFor({ timeout: 20_000 });

  const saveRenderedConsent = async (journey) => {
    const [response] = await Promise.all([
      journey.page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" &&
          new URL(candidate.url()).pathname === "/api/mobile/capture/consent",
      ),
      journey.page
        .getByRole("button", { name: "Save my consent receipt", exact: true })
        .click(),
    ]);
    const packet = await response.json().catch(() => null);
    assert(
      response.ok() && packet?.ok === true,
      `${journey.identity.role} consent receipt was rejected.`,
    );
    return packet;
  };
  for (const journey of journeys) {
    const audibleConsent = journey.page.getByLabel(
      "Every audible participant was notified and agreed to the selected recording.",
      { exact: true },
    );
    await audibleConsent.waitFor({ timeout: 20_000 });
    if (!(await audibleConsent.isChecked())) await audibleConsent.check();
    const transcriptionConsent = journey.page.getByLabel(
      "I separately agree to transcription and transcript-derived notes/tasks.",
      { exact: true },
    );
    await transcriptionConsent.waitFor({ timeout: 20_000 });
    if (!(await transcriptionConsent.isChecked()))
      await transcriptionConsent.check();
    await saveRenderedConsent(journey);
  }
  // Refresh each actor's receipt after both independent choices exist so both
  // rendered recorders hold current all-party readiness, not inferred consent.
  for (const journey of journeys) {
    const packet = await saveRenderedConsent(journey);
    assert(
      packet?.session?.allRegisteredParticipantConsentGranted === true,
      `${journey.identity.role} did not receive current all-party audio consent.`,
    );
    assert(
      packet?.session?.allRegisteredParticipantTranscriptionConsentGranted ===
        true,
      `${journey.identity.role} did not receive current all-party transcription consent.`,
    );
    await journey.page
      .getByText(
        "All currently signed-in participants are ready for this source.",
        { exact: true },
      )
      .waitFor({ timeout: 20_000 });
    const headphones = journey.page.getByLabel(
      "I am monitoring through headphones, so the retained mic source will not capture speaker echo.",
      { exact: true },
    );
    if (!(await headphones.isChecked())) await headphones.check();
  }

  const recordButtons = journeys.map((journey) =>
    journey.page.getByRole("button", {
      name: "Record local source",
      exact: true,
    }),
  );
  for (const recordButton of recordButtons) {
    await recordButton.waitFor({ state: "visible", timeout: 20_000 });
    for (
      let attempt = 0;
      attempt < 40 && !(await recordButton.isEnabled());
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(
      await recordButton.isEnabled(),
      "A consented browser endpoint did not become ready to retain its source.",
    );
  }
  const recordingWindowStartedAt = new Date();
  await Promise.all(recordButtons.map((button) => button.click()));
  const stopButtons = journeys.map((journey) =>
    journey.page.getByRole("button", {
      name: "Stop local source",
      exact: true,
    }),
  );
  for (let index = 0; index < stopButtons.length; index += 1) {
    await stopButtons[index]
      .waitFor({ timeout: 20_000 })
      .catch(async (error) => {
        const recorder = journeys[index].page.locator(
          `[aria-labelledby="browser-source-${ROOM_ID}"]`,
        );
        const statusMessages = await recorder
          .getByRole("status")
          .allTextContents();
        throw new Error(
          `${journeys[index].identity.role} browser source did not start. ` +
            `Status: ${JSON.stringify(statusMessages)}. ${error instanceof Error ? error.message : ""}`,
        );
      });
  }
  await new Promise((resolve) =>
    setTimeout(resolve, requestedRecordingMilliseconds),
  );
  await Promise.all(stopButtons.map((button) => button.click()));
  await Promise.all(
    journeys.map((journey) =>
      journey.page
        .getByText(
          "Exact bytes verified. The local source remains protected and the editor evidence is ready.",
          { exact: true },
        )
        .waitFor({ timeout: 90_000 }),
    ),
  );

  const participantIds = await prisma.callParticipant.findMany({
    where: {
      roomId: ROOM_ID,
      userId: { in: identities.map((identity) => userByUid.get(identity.uid)) },
    },
    select: { id: true, userId: true },
  });
  const verifiedSources = await prisma.recordingAsset.findMany({
    where: {
      roomId: ROOM_ID,
      participantId: {
        in: participantIds.map((participant) => participant.id),
      },
      kind: "LOCAL_AUDIO",
      status: "VERIFIED",
      createdAt: { gte: recordingWindowStartedAt },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      participantId: true,
      byteSize: true,
      checksum: true,
      recordedStartedAt: true,
      recordedStoppedAt: true,
      verifiedAt: true,
    },
  });
  assert(
    verifiedSources.length === 2,
    `Expected two verified browser masters, observed ${verifiedSources.length}.`,
  );
  assert(
    new Set(verifiedSources.map((source) => source.participantId)).size === 2,
    "The verified browser masters did not belong to two independent participants.",
  );
  for (const source of verifiedSources) {
    assert(
      source.byteSize > 0n &&
        source.checksum &&
        source.recordedStartedAt &&
        source.recordedStoppedAt &&
        source.verifiedAt,
      `Verified browser source ${source.id} is missing immutable-byte or timing evidence.`,
    );
  }
  const overlapStartedAt = new Date(
    Math.max(
      ...verifiedSources.map((source) => source.recordedStartedAt.getTime()),
    ),
  );
  const overlapStoppedAt = new Date(
    Math.min(
      ...verifiedSources.map((source) => source.recordedStoppedAt.getTime()),
    ),
  );
  const overlapMilliseconds =
    overlapStoppedAt.getTime() - overlapStartedAt.getTime();
  assert(
    overlapMilliseconds >= 2_000,
    `Independent browser masters overlapped by only ${overlapMilliseconds} ms.`,
  );

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
        providerRoomId: PROVIDER_ROOM_ID,
        participantsConnected: journeys.length,
        retainedSourceStarted: true,
        providerRecordingStarted: false,
        chatRoundTrip: "passed",
        browserToBrowserLiveKit: "passed",
        independentBrowserSourcesVerified: 2,
        independentParticipantSourcesVerified: new Set(
          verifiedSources.map((source) => source.participantId),
        ).size,
        verifiedSourceIds: verifiedSources.map((source) => source.id),
        browserSourceOverlapMilliseconds: overlapMilliseconds,
        allPartyConsentReceipts: "passed",
        allPartyTranscriptionConsentReceipts: "passed",
        roomLeftOpenForInterop: keepRoomOpenForInterop,
        controlledAudibleSpeechUsed: Boolean(syntheticSpeechSources),
        controlledAudibleSpeechSources: syntheticSpeechSources
          ? Object.keys(syntheticSpeechSources)
          : [],
        recordingWindowRequestedMilliseconds: requestedRecordingMilliseconds,
        naturalHumanSpeechProven: false,
        secretsPrinted: false,
        freshContextMutatedOutsideProduct: false,
      },
      null,
      2,
    ),
  );
} finally {
  for (const journey of journeys) {
    await journey.page
      .getByRole("button", { name: "Leave", exact: true })
      .click()
      .catch(() => undefined);
    await clearRenderedSession(
      journey.page,
      baseURL,
      journey.identity.role,
    ).catch(() => undefined);
    await journey.context.close();
  }
  await Promise.all(
    browsers.map((browser) => browser.close().catch(() => undefined)),
  );
  if (!keepRoomOpenForInterop) {
    await prisma.callRoom
      .update({
        where: { id: ROOM_ID },
        data: { status: "ENDED", endedAt: new Date() },
      })
      .catch(() => undefined);
  }
  await prisma.$disconnect();
}
