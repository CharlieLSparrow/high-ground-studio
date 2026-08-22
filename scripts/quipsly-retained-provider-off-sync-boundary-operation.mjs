#!/usr/bin/env node

import { createRequire } from "node:module";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const SESSION_TITLE = "QA Provider-Off Sync Boundary 2026-08-05";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localDatabase(value) {
  const url = new URL(value);
  assert(
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname),
    "Provider-off operation refuses a non-local database.",
  );
  return value;
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_PROVIDER_OFF_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_PROVIDER_OFF_BASE_URL",
  );
  const databaseURL = localDatabase(
    process.env.QUIPSLY_LOCAL_DATABASE_URL
      || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  process.env.GCLOUD_PROJECT ||= "quipsly-reef";
  process.env.GOOGLE_CLOUD_PROJECT ||= "quipsly-reef";
  const firebaseApp = initializeApp(
    { projectId: "quipsly-reef" },
    `provider-off-boundary-${Date.now()}`,
  );
  const firebaseAuth = getAuth(firebaseApp);
  try {
    const existing = await firebaseAuth.getUserByEmail(OPERATOR_EMAIL);
    await firebaseAuth.updateUser(existing.uid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await firebaseAuth.createUser({
      uid: "retained-provider-off-operator",
      email: OPERATOR_EMAIL,
      password,
      emailVerified: true,
      displayName: "Retained provider-off operator",
    });
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
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
    const room = await prisma.callRoom.findFirst({
      where: {
        title: SESSION_TITLE,
        createdByUser: { primaryEmail: OPERATOR_EMAIL },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        captureGroupId: true,
        provider: true,
        providerRecordingCommands: { select: { id: true } },
        recordingAssets: {
          where: { kind: "SERVER_MIX" },
          select: { id: true },
        },
      },
    });
    assert(room, `Retained Session ${SESSION_TITLE} was not found.`);
    const commandsBefore = room.providerRecordingCommands.length;
    const providerAssetsBefore = room.recordingAssets.length;

    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "provider-off-operator", email: OPERATOR_EMAIL },
      password,
      callbackPath: `/sessions/${room.id}?mode=live`,
    });
    await page.getByRole("heading", { name: SESSION_TITLE, exact: true }).first().waitFor();

    const open = page.getByRole("button", { name: /This browser/ });
    await open.click();
    const liveRegion = page.getByRole("complementary", {
      name: `${SESSION_TITLE} live call dock`,
      exact: true,
    });
    await liveRegion.waitFor();
    await liveRegion
      .getByText("More call and recording options", { exact: true })
      .click();
    await liveRegion
      .getByText("Backup recording details · Off", { exact: true })
      .click();
    await liveRegion.getByRole("heading", {
      name: "Cloud recording backup: Off",
      exact: true,
    }).waitFor();
    await page.getByText(
      "Provider safety copy is off. This does not affect capture-group timing or protected local-source alignment.",
      { exact: true },
    ).waitFor();
    const liveText = await liveRegion.innerText();
    const normalizedLiveText = liveText.toLowerCase();
    for (const expected of [
      "Cloud recording backup: Off",
      "Turning this copy off cannot change take synchronization",
      "shared capture group",
      "device clock and START receipts",
      "protected local masters",
      "waveform/drift review",
      "Provider safety copy is off. This does not affect capture-group timing or protected local-source alignment.",
    ]) {
      assert(
        normalizedLiveText.includes(expected.toLowerCase()),
        `Live Session lost provider-off boundary: ${expected}`,
      );
    }
    assert(
      await liveRegion.getByRole("button", { name: "Start backup recording", exact: true }).count() === 0,
      "Provider START remained reachable while the local provider was deliberately unavailable.",
    );

    await page.goto(`${baseURL}/coaching`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Session workspaces", exact: true }).waitFor();
    const captureRoomsPanel = page.getByRole("heading", { name: "Session workspaces", exact: true })
      .locator("xpath=../../..");
    const runwayRoom = captureRoomsPanel.locator("article")
      .filter({ hasText: SESSION_TITLE })
      .first();
    await runwayRoom.waitFor();
    await runwayRoom.getByRole("link", { name: "Open Session", exact: true }).waitFor();
    assert(
      await runwayRoom.getByText("optional provider safety copy", { exact: true }).count() === 0,
      "The ordinary Session workspace exposed provider implementation controls.",
    );
    assert(
      await runwayRoom.getByRole("button", { name: "Prepare slot", exact: true }).count() === 0,
      "Coaching runway still exposed legacy provider receipt-slot ceremony.",
    );

    const roomAfter = await prisma.callRoom.findUnique({
      where: { id: room.id },
      select: {
        providerRecordingCommands: { select: { id: true } },
        recordingAssets: {
          where: { kind: "SERVER_MIX" },
          select: { id: true },
        },
      },
    });
    assert(
      roomAfter?.providerRecordingCommands.length === commandsBefore,
      "Opening the Live Session created a provider command.",
    );
    assert(
      roomAfter?.recordingAssets.length === providerAssetsBefore,
      "Opening the Live Session created provider media evidence.",
    );
    assert(pageErrors.length === 0, "Provider-off Live Session raised a client exception.");

    await clearRenderedSession(page, baseURL, "provider-off-operator");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      sessionTitle: SESSION_TITLE,
      callRoomId: room.id,
      captureGroupId: room.captureGroupId,
      roomProvider: room.provider,
      providerRecording: "off",
      providerCommandsCreatedByView: 0,
      providerAssetsCreatedByView: 0,
      synchronizationBoundaryVisible: true,
      coachingHappyPathProviderAdminHidden: true,
      legacyPrepareSlotVisible: false,
      localProtectedCaptureUnaffected: true,
      browserExceptions: 0,
      secretsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await prisma.$disconnect();
    await deleteApp(firebaseApp);
  }
}

await main();
