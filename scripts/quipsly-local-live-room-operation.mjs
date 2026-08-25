#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { chmod, stat, writeFile } from "node:fs/promises";
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

function safeJson(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
const interruptCoachUpload =
  process.env.QUIPSLY_LOCAL_LIVE_ROOM_INTERRUPT_COACH_UPLOAD === "1";
const crashCoachRecorder =
  process.env.QUIPSLY_LOCAL_LIVE_ROOM_CRASH_COACH_RECORDER === "1";
const operateTwoPartyVideo =
  process.env.QUIPSLY_LOCAL_LIVE_ROOM_VIDEO === "1";
assert(
  !(interruptCoachUpload && crashCoachRecorder),
  "Choose either upload interruption or recorder crash recovery per operation.",
);
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

const canonicalRoom = await prisma.callRoom.findUnique({
  where: { id: ROOM_ID },
  select: { id: true, projectId: true },
});
assert(
  canonicalRoom?.projectId,
  "The operated Session must retain a canonical project binding.",
);

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
let audioFirstCameraDefaultObserved = true;
let twoPartyVideoStageProven = false;
let cameraTogglePreservedCall = false;

const saveRenderedConsent = async (journey) => {
  const consentAction = journey.page.getByRole("button", {
    name: /Allow recording|Update choices/,
  });
  if (!(await consentAction.isVisible())) {
    await journey.page
      .locator("summary")
      .filter({ hasText: /^Recording settings/ })
      .click();
  }
  const [response] = await Promise.all([
    journey.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/mobile/capture/consent",
    ),
    consentAction.click(),
  ]);
  const packet = await response.json().catch(() => null);
  assert(
    response.ok() && packet?.ok === true,
    `${journey.identity.role} consent receipt was rejected.`,
  );
  return packet;
};

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
    let interruptedUploadRequest = false;
    const localUploadPattern = "**/api/mobile/capture/uploads/local/**";
    const interruptLocalUpload = async (route) => {
      if (
        identity.role === "coach" &&
        interruptCoachUpload &&
        !interruptedUploadRequest &&
        route.request().method() === "PUT"
      ) {
        interruptedUploadRequest = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "Deliberate local upload interruption.",
          }),
        });
        return;
      }
      await route.continue();
    };
    if (identity.role === "coach" && interruptCoachUpload) {
      await page.route(localUploadPattern, interruptLocalUpload);
    }
    const callbackPath = `/sessions/${ROOM_ID}?mode=live`;
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath,
    });
    await page
      .locator('[data-session-entry-ready="true"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    const browserChoice = page.getByRole("button", {
      name: /Join call|Join in browser|Open call lobby|This browser/i,
    });
    await browserChoice.waitFor({ timeout: 20_000 });
    await browserChoice.click();
    const liveCallDock = page.locator('aside[aria-label$=" live call dock"]');
    await liveCallDock.waitFor({ state: "visible", timeout: 20_000 });
    const join = liveCallDock.getByRole("button", {
      name: "Join call",
      exact: true,
    });
    await join.waitFor({ state: "visible", timeout: 20_000 });
    await liveCallDock
      .getByRole("region", { name: "Ready to join", exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    const deviceSettings = liveCallDock.getByTestId("call-device-settings");
    await deviceSettings.waitFor({ state: "visible", timeout: 20_000 });
    assert(
      !(await deviceSettings.evaluate((element) =>
        element.hasAttribute("open"),
      )),
      `${identity.role} lobby opened device settings before the person asked for them.`,
    );
    const technicalDeviceDetails = liveCallDock.getByTestId(
      "call-technical-device-details",
    );
    assert(
      (await technicalDeviceDetails.count()) === 1 &&
        !(await technicalDeviceDetails.evaluate((element) =>
          element.hasAttribute("open"),
        )),
      `${identity.role} lobby exposed technical device evidence on the happy path.`,
    );
    assert(
      (await liveCallDock
        .getByText("Optional sound check", { exact: true })
        .count()) === 1,
      `${identity.role} lobby lost its optional sound-check escape hatch.`,
    );
    assert(
      (await page
        .getByRole("button", { name: /^Record(?: source)?$/ })
        .count()) === 0,
      `${identity.role} could see a recording action before joining.`,
    );
    const prejoinCamera = liveCallDock.getByRole("button", {
      name: "Camera off",
      exact: true,
    });
    audioFirstCameraDefaultObserved =
      audioFirstCameraDefaultObserved &&
      (await prejoinCamera.getAttribute("aria-pressed")) === "false";
    if (operateTwoPartyVideo) {
      await prejoinCamera.click();
      await liveCallDock
        .getByRole("button", { name: "Camera on", exact: true })
        .waitFor({ state: "visible", timeout: 10_000 });
    }
    // A returning browser can already hold system permission and remembered
    // device IDs while LiveKit finishes its asynchronous preflight. Give that
    // standard happy path a brief chance to settle before looking for a
    // permission-recovery action that correctly will not exist.
    for (
      let attempt = 0;
      attempt < 20 && !(await join.isEnabled());
      attempt += 1
    ) {
      await page.waitForTimeout(250);
    }
    if (!(await join.isEnabled())) {
      if (
        !(await deviceSettings.evaluate((element) => element.hasAttribute("open")))
      ) {
        await deviceSettings.locator(":scope > summary").click();
      }
      const allowMicrophone = liveCallDock.getByRole("button", {
        name: /^Allow microphone(?: and camera)?$/,
      });
      await allowMicrophone
        .waitFor({ timeout: 20_000 })
        .catch(async (error) => {
          const visibleButtons = await page.getByRole("button").allInnerTexts();
          const visibleHeadings = await page
            .getByRole("heading")
            .allInnerTexts();
          throw new Error(
            `${identity.role} device-permission action did not appear when Join needed setup. ` +
              `Buttons: ${JSON.stringify(visibleButtons)}. ` +
              `Headings: ${JSON.stringify(visibleHeadings)}. ` +
              `URL: ${page.url()}. ${error instanceof Error ? error.message : ""}`,
          );
        });
      await allowMicrophone.click();
    }
    for (
      let attempt = 0;
      attempt < 40 && !(await join.isEnabled());
      attempt += 1
    ) {
      await page.waitForTimeout(250);
    }
    const microphoneOptions = await liveCallDock
      .getByRole("combobox", { name: "Microphone" })
      .locator("option")
      .allInnerTexts();
    assert(
      await join.isEnabled(),
      `${identity.role} live-room join did not become ready. Microphones: ${JSON.stringify(microphoneOptions)}`,
    );
    journeys.push({
      identity,
      context,
      page,
      join,
      localUploadPattern,
      interruptLocalUpload,
      uploadWasInterrupted: () => interruptedUploadRequest,
    });
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
        () => document.body.innerText.toLowerCase().includes("2 in call"),
        null,
        { timeout: 20_000 },
      )
      .catch(async (error) => {
        const rosterLines = (await journey.page.locator("body").innerText())
          .split("\n")
          .filter((line) => line.toLowerCase().includes("in call"));
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

  if (operateTwoPartyVideo) {
    for (const journey of journeys) {
      const stage = journey.page.getByTestId("call-video-stage");
      await stage.waitFor({ state: "visible", timeout: 20_000 });
      await journey.page.waitForFunction(
        (element) =>
          element?.getAttribute("aria-label") ===
          "Call video stage with your preview",
        await stage.elementHandle(),
        { timeout: 20_000 },
      );
      const remoteVideos = journey.page
        .getByLabel("Remote participant media")
        .locator("video[data-livekit-track-sid]");
      assert(
        (await remoteVideos.count()) >= 1,
        `${journey.identity.role} did not attach a remote LiveKit video element.`,
      );
      assert(
        await journey.page.getByLabel("Your camera").evaluate((element) => {
          const video = element;
          return (
            video instanceof HTMLVideoElement &&
            video.srcObject instanceof MediaStream &&
            video.srcObject.getVideoTracks().length === 1 &&
            !video.classList.contains("invisible")
          );
        }),
        `${journey.identity.role} did not retain its local camera preview.`,
      );
      assert(
        (await stage.getAttribute("aria-label")) ===
          "Call video stage with your preview",
        `${journey.identity.role} did not promote remote video while retaining the local preview.`,
      );
    }
    twoPartyVideoStageProven = true;

    const clientJourney = journeys.find(
      (journey) => journey.identity.role === "client",
    );
    const coachJourney = journeys.find(
      (journey) => journey.identity.role === "coach",
    );
    assert(
      clientJourney && coachJourney,
      "Video toggle proof needs coach and client journeys.",
    );
    await clientJourney.page
      .getByRole("button", { name: "Stop camera", exact: true })
      .click();
    await clientJourney.page
      .getByRole("button", { name: "Start camera", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    const coachRemoteMedia = coachJourney.page.getByLabel(
      "Remote participant media",
    );
    await coachJourney.page.waitForFunction(
      (element) =>
        element?.querySelectorAll("video[data-livekit-track-sid]").length === 0,
      await coachRemoteMedia.elementHandle(),
      { timeout: 20_000 },
    );
    assert(
      await clientJourney.page
        .getByText("2 in call", { exact: true })
        .isVisible(),
      "Turning the client camera off disconnected the call.",
    );
    await clientJourney.page
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await coachJourney.page.waitForFunction(
      (element) =>
        (element?.querySelectorAll("video[data-livekit-track-sid]").length ?? 0) >= 1,
      await coachRemoteMedia.elementHandle(),
      { timeout: 20_000 },
    );
    cameraTogglePreservedCall = true;
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

  for (const journey of journeys) {
    const transcriptionConsent = journey.page.getByLabel(
      "Create a transcript and suggested notes/tasks",
      { exact: true },
    );
    if (!(await transcriptionConsent.isVisible())) {
      await journey.page
        .locator("summary")
        .filter({ hasText: /^Recording settings/ })
        .click();
    }
    await transcriptionConsent.waitFor({ timeout: 20_000 });
    if (!(await transcriptionConsent.isChecked()))
      await transcriptionConsent.check();
    await saveRenderedConsent(journey);
  }
  // Each participant agrees exactly once. The product must refresh all-party
  // readiness itself; the acceptance flight must not teach or depend on a
  // second consent click.
  for (const journey of journeys) {
    await journey.page
      .getByText("Everyone is ready to record.", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });
    const headphones = journey.page.getByLabel(
      "I’m using headphones (recommended).",
      { exact: true },
    );
    if (!(await headphones.isChecked())) await headphones.check();
  }

  const coachRecordButton = journeys[0].page.getByRole("button", {
    name: "Record",
    exact: true,
  });
  await coachRecordButton.waitFor({ state: "visible", timeout: 20_000 });
  for (
    let attempt = 0;
    attempt < 40 && !(await coachRecordButton.isEnabled());
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(
    await coachRecordButton.isEnabled(),
    "The consented coach endpoint did not become ready to coordinate recording.",
  );
  await journeys[1].page
    .getByText("Recording starts when the coach or host presses Record.", {
      exact: true,
    })
    .waitFor({ state: "visible", timeout: 20_000 });
  const recordingWindowStartedAt = new Date();
  await coachRecordButton.click();
  const stopButtons = [
    journeys[0].page.getByRole("button", {
      name: "Stop recording",
      exact: true,
    }),
    journeys[1].page.getByRole("button", {
      name: "Stop my recording",
      exact: true,
    }),
  ];
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
  await journeys[0].page
    .getByRole("region", { name: "Recording status" })
    .getByText("Everyone is recording", { exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await new Promise((resolve) =>
    setTimeout(resolve, requestedRecordingMilliseconds),
  );
  const coachJourney = journeys.find(
    (journey) => journey.identity.role === "coach",
  );
  assert(coachJourney, "The operated coach journey is unavailable.");
  if (crashCoachRecorder) {
    await coachJourney.page.close({ runBeforeUnload: false });
    await stopButtons[1].click();
    const recoveryPage = await coachJourney.context.newPage();
    coachJourney.page = recoveryPage;
    await recoveryPage.goto(`${baseURL}/sessions/${ROOM_ID}?mode=live`, {
      waitUntil: "domcontentloaded",
    });
    await recoveryPage
      .locator('[data-session-entry-ready="true"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    const recoveryDock = recoveryPage.locator(
      'aside[aria-label$=" live call dock"]',
    );
    const recoveryJoin = recoveryDock.getByRole("button", {
      name: "Join call",
      exact: true,
    });
    await recoveryJoin
      .waitFor({ state: "visible", timeout: 3_000 })
      .catch(async () => {
        await recoveryPage
          .getByRole("button", {
            name: /Join call|Join in browser|Open call lobby|This browser/i,
          })
          .first()
          .click();
        await recoveryDock.waitFor({ state: "visible", timeout: 20_000 });
        await recoveryJoin.waitFor({ state: "visible", timeout: 20_000 });
      });
    await recoveryJoin.click();
    await recoveryPage
      .getByRole("button", { name: "Leave", exact: true })
      .waitFor({ timeout: 20_000 });
  } else {
    await stopButtons[0].click();
  }
  if (interruptCoachUpload) {
    await coachJourney.page
      .getByText("Safe on this device", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 90_000 });
    await coachJourney.page
      .getByText("Durable byte upload failed (503).", { exact: true })
      .waitFor({ state: "attached", timeout: 20_000 });
    assert(
      coachJourney.uploadWasInterrupted(),
      "The coach source upload was not deliberately interrupted.",
    );
    await coachJourney.page.unroute(
      coachJourney.localUploadPattern,
      coachJourney.interruptLocalUpload,
    );
    await coachJourney.page.reload({ waitUntil: "domcontentloaded" });
    await coachJourney.page
      .locator('[data-session-entry-ready="true"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    const recoveryDock = coachJourney.page.locator(
      'aside[aria-label$=" live call dock"]',
    );
    const recoveryJoin = recoveryDock.getByRole("button", {
      name: "Join call",
      exact: true,
    });
    await recoveryJoin
      .waitFor({ state: "visible", timeout: 3_000 })
      .catch(async () => {
        await coachJourney.page
          .getByRole("button", {
            name: /Join call|Join in browser|Open call lobby|This browser/i,
          })
          .first()
          .click();
        await recoveryDock.waitFor({ state: "visible", timeout: 20_000 });
        await recoveryJoin.waitFor({ state: "visible", timeout: 20_000 });
      });
    await recoveryJoin.click();
    await coachJourney.page
      .getByRole("button", { name: "Leave", exact: true })
      .waitFor({ timeout: 20_000 });
  }
  await Promise.all(
    journeys.map(async (journey) => {
      try {
        await journey.page
          .getByText(
            /^(?:Recording saved and verified in Quipsly\.|Recording saved\. Quipsly is preparing it for reliable playback\.|Exact bytes verified\. The local source remains protected and the editor evidence is ready\.|Recovered bytes verified\. The interrupted ending is marked for repair before final editing\.)$/,
          )
          .waitFor({ timeout: 90_000 });
      } catch (error) {
        const recorder = journey.page.locator(
          `[aria-labelledby="browser-source-${ROOM_ID}"]`,
        );
        const statusMessages = await recorder
          .getByRole("status")
          .allTextContents()
          .catch(() => []);
        throw new Error(
          `${journey.identity.role} source did not reach protected server status. ` +
            `Recorder messages: ${JSON.stringify(statusMessages)}. ` +
            `${error instanceof Error ? error.message : ""}`,
        );
      }
    }),
  );
  if (crashCoachRecorder) {
    await coachJourney.page
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await coachJourney.page
      .getByRole("button", { name: "Record", exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  const participantIds = await prisma.callParticipant.findMany({
    where: {
      roomId: ROOM_ID,
      userId: { in: identities.map((identity) => userByUid.get(identity.uid)) },
    },
    select: { id: true, userId: true },
  });
  let directiveReceipts = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    directiveReceipts = await prisma.callRecordingEndpointReceipt.findMany({
      where: {
        roomId: ROOM_ID,
        participantId: {
          in: participantIds.map((participant) => participant.id),
        },
        state: { in: ["STARTED", "STOPPED"] },
        receivedAt: { gte: recordingWindowStartedAt },
      },
      select: { participantId: true, state: true, captureId: true },
    });
    if (
      participantIds.every((participant) => {
        const states = new Set(
          directiveReceipts
            .filter((receipt) => receipt.participantId === participant.id)
            .map((receipt) => receipt.state),
        );
        return states.has("STARTED") && states.has("STOPPED");
      })
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  for (const participant of participantIds) {
    const states = new Set(
      directiveReceipts
        .filter((receipt) => receipt.participantId === participant.id)
        .map((receipt) => receipt.state),
    );
    assert(
      states.has("STARTED") && states.has("STOPPED"),
      `Participant ${participant.id} did not acknowledge both coordinated boundaries.`,
    );
  }
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
      durationSeconds: true,
      verifiedAt: true,
      localManifestJson: true,
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
        source.durationSeconds &&
        source.durationSeconds > 0 &&
        source.verifiedAt,
      `Verified browser source ${source.id} is missing immutable-byte or timing evidence.`,
    );
  }
  const recoveredSources = verifiedSources.filter((source) => {
    const manifest =
      source.localManifestJson &&
      typeof source.localManifestJson === "object" &&
      !Array.isArray(source.localManifestJson)
        ? source.localManifestJson
        : {};
    const profile =
      manifest.reportedSourceProfile &&
      typeof manifest.reportedSourceProfile === "object" &&
      !Array.isArray(manifest.reportedSourceProfile)
        ? manifest.reportedSourceProfile
        : {};
    const recovery =
      profile.interruptionRecovery &&
      typeof profile.interruptionRecovery === "object" &&
      !Array.isArray(profile.interruptionRecovery)
        ? profile.interruptionRecovery
        : {};
    return (
      recovery.contractKind ===
        "quipsly-browser-source-interruption-recovery-v1" &&
      recovery.mediaTailMayBeIncomplete === true
    );
  });
  if (crashCoachRecorder) {
    const coachParticipantId = participantIds.find(
      (participant) =>
        participant.userId === userByUid.get(coachJourney.identity.uid),
    )?.id;
    assert(
      recoveredSources.length === 1 &&
        recoveredSources[0].participantId === coachParticipantId,
      "The crashed coach source did not retain its explicit interruption-recovery evidence.",
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

  const finalizations = await prisma.mobileCaptureFinalizationReceipt.findMany({
    where: {
      roomId: ROOM_ID,
      recordingAssetId: { in: verifiedSources.map((source) => source.id) },
    },
    select: {
      recordingAssetId: true,
      uploadSessionId: true,
      startReceiptId: true,
      processingDisposition: true,
      transcriptDisposition: true,
      sourceId: true,
      mediaAssetId: true,
      transcriptJobId: true,
    },
  });
  assert(
    finalizations.length === verifiedSources.length,
    `Expected ${verifiedSources.length} canonical finalizations, observed ${finalizations.length}.`,
  );
  const finalizationByRecordingId = new Map(
    finalizations.map((finalization) => [finalization.recordingAssetId, finalization]),
  );
  const twoEndpointMaterializationEvidence = [];
  for (const source of verifiedSources) {
    const finalization = finalizationByRecordingId.get(source.id);
    assert(
      finalization?.processingDisposition === "RELEASED" &&
        finalization.transcriptDisposition === "RELEASED" &&
        finalization.startReceiptId &&
        finalization.sourceId &&
        finalization.mediaAssetId &&
        finalization.transcriptJobId,
      `Recording ${source.id} did not retain a complete released finalization.`,
    );

    const [studioSource, studioAsset, studioAttachments] = await Promise.all([
      prisma.studioVideoSource.findUnique({
        where: { id: finalization.sourceId },
        select: { id: true, provider: true },
      }),
      prisma.studioMediaAsset.findUnique({
        where: { id: finalization.mediaAssetId },
        select: { id: true, rawAssetId: true, sizeBytes: true },
      }),
      prisma.studioAssetAttachment.findMany({
        where: { assetId: finalization.mediaAssetId },
        select: { projectId: true, role: true, source: true },
      }),
    ]);
    const projectAttachment = studioAttachments.find(
      (attachment) => attachment.projectId === canonicalRoom.projectId,
    );
    assert(
      studioSource?.provider === "capture-recording" &&
        studioAsset?.rawAssetId === studioSource.id &&
        studioAsset.sizeBytes === source.byteSize &&
        projectAttachment?.source === "mobile-capture-finalization",
      `Recording ${source.id} was not materialized into the operated Session project.`,
    );

    const verifiedSize = Number(source.byteSize);
    const playbackURL = `${baseURL}/api/sessions/${encodeURIComponent(ROOM_ID)}/recordings/${encodeURIComponent(source.id)}/media`;
    const playbackWindows = [
      { label: "beginning", start: 0, end: Math.min(verifiedSize - 1, 4095) },
      {
        label: "middle",
        start: Math.max(0, Math.floor(verifiedSize / 2) - 2048),
        end: Math.min(verifiedSize - 1, Math.floor(verifiedSize / 2) + 2047),
      },
      {
        label: "ending",
        start: Math.max(0, verifiedSize - 4096),
        end: verifiedSize - 1,
      },
    ];
    const playbackEvidence = [];
    for (const window of playbackWindows) {
      const response = await journeys[0].page.request.get(playbackURL, {
        headers: { Range: `bytes=${window.start}-${window.end}` },
      });
      const headers = response.headers();
      const body = await response.body();
      const expectedLength = window.end - window.start + 1;
      assert(
        response.status() === 206 &&
          body.byteLength === expectedLength &&
          headers["content-range"] ===
            `bytes ${window.start}-${window.end}/${verifiedSize}` &&
          headers["x-quipsly-verified-bytes"] === String(verifiedSize) &&
          headers.etag === `"sha256-${source.checksum}"`,
        `Authenticated ${window.label} playback failed for recording ${source.id}.`,
      );
      playbackEvidence.push({
        label: window.label,
        status: response.status(),
        contentRange: headers["content-range"],
        byteLength: body.byteLength,
      });
    }

    let transcript = await prisma.transcriptJob.findUnique({
      where: { id: finalization.transcriptJobId },
      select: {
        id: true,
        status: true,
        provider: true,
        sourceSha256: true,
        errorMessage: true,
        _count: { select: { segments: true } },
      },
    });
    const transcriptDeadline = Date.now() + 90_000;
    while (
      transcript &&
      !["COMPLETED", "FAILED", "CANCELED"].includes(transcript.status) &&
      Date.now() < transcriptDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      transcript = await prisma.transcriptJob.findUnique({
        where: { id: finalization.transcriptJobId },
        select: {
          id: true,
          status: true,
          provider: true,
          sourceSha256: true,
          errorMessage: true,
          _count: { select: { segments: true } },
        },
      });
    }
    assert(
      transcript?.status === "COMPLETED" &&
        transcript.sourceSha256 === source.checksum &&
        transcript._count.segments >= 1,
      `Recording ${source.id} did not produce a completed source-bound transcript: ${JSON.stringify(transcript)}.`,
    );

    twoEndpointMaterializationEvidence.push({
      recordingAssetId: source.id,
      participantId: source.participantId,
      durationSeconds: source.durationSeconds,
      durationEvidence: safeJson(source.localManifestJson).durationEvidence || null,
      uploadSessionId: finalization.uploadSessionId,
      sourceId: studioSource.id,
      mediaAssetId: studioAsset.id,
      projectAttachment,
      playbackEvidence,
      transcript,
    });
  }

  const suggestionResponse = await journeys[0].page.request.get(
    `${baseURL}/api/sessions/${encodeURIComponent(ROOM_ID)}/source-alignment`,
  );
  const suggestionPayload = await suggestionResponse.json().catch(() => null);
  const automaticAlignmentSuggestion = suggestionPayload?.suggestion;
  assert(
    suggestionResponse.ok() &&
      suggestionPayload?.ok === true &&
      automaticAlignmentSuggestion?.status === "ready" &&
      automaticAlignmentSuggestion.generatedAutomatically === true &&
      automaticAlignmentSuggestion.acousticAnalysisStarted === false &&
      verifiedSources.some(
        (source) =>
          source.id === automaticAlignmentSuggestion.spineRecordingAssetId,
      ) &&
      verifiedSources.some(
        (source) =>
          source.id === automaticAlignmentSuggestion.targetRecordingAssetId,
      ) &&
      automaticAlignmentSuggestion.spineRecordingAssetId !==
        automaticAlignmentSuggestion.targetRecordingAssetId &&
      Number.isFinite(automaticAlignmentSuggestion.initialOffsetSeconds) &&
      automaticAlignmentSuggestion.overlapEndSeconds >
        automaticAlignmentSuggestion.overlapStartSeconds,
    `Automatic two-source alignment suggestion failed: ${JSON.stringify(suggestionPayload)}.`,
  );

  for (const journey of journeys) {
    await journey.page.reload({ waitUntil: "domcontentloaded" });
    await journey.page
      .locator('[data-session-entry-ready="true"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    const reentryDock = journey.page.locator(
      'aside[aria-label$=" live call dock"]',
    );
    const reentryJoin = reentryDock.getByRole("button", {
      name: "Join call",
      exact: true,
    });
    await reentryJoin
      .waitFor({ state: "visible", timeout: 3_000 })
      .catch(async () => {
        await journey.page
          .getByRole("button", {
            name: /Join call|Join in browser|Open call lobby|This browser/i,
          })
          .first()
          .click();
        await reentryDock.waitFor({ state: "visible", timeout: 20_000 });
        await reentryJoin.waitFor({ state: "visible", timeout: 20_000 });
      });
    await reentryJoin.click();
    await journey.page
      .getByRole("button", { name: "Leave", exact: true })
      .waitFor({ timeout: 20_000 });
    await journey.page
      .getByText("Recording settings · Saved", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    assert(
      (await journey.page
        .getByRole("region", { name: "Recording consent needed" })
        .count()) === 0,
      `${journey.identity.role} was asked to repeat unchanged Session consent after re-entry.`,
    );
    await journey.page
      .getByRole("button", { name: "Leave", exact: true })
      .click();
    const recordingCloseStatus = journey.page.getByRole("region", {
      name: "Recording close status",
    });
    await recordingCloseStatus.waitFor({ state: "visible", timeout: 20_000 });
    await recordingCloseStatus
      .getByText("Safe to close", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    assert(
      await journey.page
        .locator(`[aria-labelledby="browser-source-${ROOM_ID}"]`)
        .isVisible(),
      `${journey.identity.role} recording recovery disappeared after leaving the call.`,
    );
  }

  const receiptPath = freshContext
    ? path.join(
        path.dirname(freshContext.contextPath),
        "browser-live-room-receipt.json",
      )
    : null;
  const receipt = {
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
    conventionalLobbyOperated: true,
    advancedDeviceSettingsCollapsedBeforeJoin: true,
    technicalDeviceDetailsCollapsedBeforeJoin: true,
    prejoinRecordingActionAbsent: true,
    audioFirstCameraDefaultObserved,
    browserVideoOperation: operateTwoPartyVideo ? "passed" : "not-requested",
    twoPartyVideoStageProven,
    cameraTogglePreservedCall,
    savedConsentRestoredAfterReentry: true,
    postCallRecordingRecoveryStayedMounted: true,
    verifiedRecordingSafeToCloseRendered: true,
    independentBrowserSourcesVerified: 2,
    independentParticipantSourcesVerified: new Set(
      verifiedSources.map((source) => source.participantId),
    ).size,
    interruptedCoachUploadRecoveredAfterReload: interruptCoachUpload,
    crashedCoachRecorderRecoveredAfterReload: crashCoachRecorder,
    interruptedSourceProfilesVerified: recoveredSources.length,
    coordinatedRecordingDirective: "passed",
    allExpectedParticipantsRecordingVisible: true,
    coordinatedEndpointBoundaries: directiveReceipts.length,
    verifiedSourceIds: verifiedSources.map((source) => source.id),
    twoEndpointMaterializationAndPlayback: "passed",
    twoEndpointMaterializationEvidence,
    automaticAlignmentSuggestion,
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
    receiptPath,
  };
  if (receiptPath) {
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(receiptPath, 0o600);
  }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  for (const journey of journeys) {
    const leave = journey.page.getByRole("button", {
      name: "Leave",
      exact: true,
    });
    if (await leave.isVisible().catch(() => false)) {
      await leave.click({ timeout: 2_000 }).catch(() => undefined);
    }
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
