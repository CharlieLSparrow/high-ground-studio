#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { captureAppDeepLink } from "../apps/quipsly/src/lib/capture-universal-link.ts";
import { SESSION_ENTRY_CHOICE_EVENT_NAMES } from "../apps/quipsly/src/lib/session-entry-choice.ts";
import { writeRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { createFreshCoachingCredentialIPCPacket } from "./lib/fresh-coaching-credential-ipc.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
} from "./lib/retained-qa-browser.mjs";

// firebase-admin belongs to the Nest app, not the workspace root. Resolve it
// from that package explicitly so this acceptance operation works with pnpm's
// strict dependency layout in a clean collaborator checkout.
const requireFromNest = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { getApps, initializeApp } = requireFromNest("firebase-admin/app");
const { getAuth } = requireFromNest("firebase-admin/auth");

const enabled = process.env.QUIPSLY_FRESH_COACHING_START_OPERATION === "1";
const seriesMode = process.env.QUIPSLY_FRESH_COACHING_SERIES_OPERATION === "1";
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching acceptance base URL",
);
const keychainService = "com.quipsly.qa.fresh-coaching";
const repoRoot = process.cwd();
const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);

assert(
  enabled,
  "Set QUIPSLY_FRESH_COACHING_START_OPERATION=1 to authorize fresh disposable local accounts and retained acceptance artifacts.",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching acceptance requires loopback PostgreSQL and refuses remote databases.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const firebaseProjectId =
  process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "quipsly-reef";

if (!getApps().length) initializeApp({ projectId: firebaseProjectId });
const auth = getAuth();
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();

const suffix = randomBytes(4).toString("hex");
const sessionTitle = `Fresh coaching acceptance ${suffix}`;
const identities = {
  coach: {
    role: "coach",
    email: `acceptance-coach-${suffix}@dev.test`,
    displayName: `Fresh Coach ${suffix.slice(0, 4).toUpperCase()}`,
    password: `Qp-${randomBytes(18).toString("base64url")}!26`,
  },
  client: {
    role: "client",
    email: `acceptance-client-${suffix}@dev.test`,
    displayName: `Fresh Client ${suffix.slice(0, 4).toUpperCase()}`,
    password: `Qp-${randomBytes(18).toString("base64url")}!26`,
  },
};
for (const identity of Object.values(identities)) {
  writeRetainedQAPassword({
    service: keychainService,
    account: identity.email,
    password: identity.password,
  });
}

async function createVerifyAndSignIn(page, identity, callbackPath) {
  const callbackURL = new URL(callbackPath, baseURL);
  await page.goto(
    `${baseURL}/login?callbackUrl=${encodeURIComponent(callbackPath)}`,
    { waitUntil: "domcontentloaded" },
  );
  const form = page.locator("form");
  const readySignIn = form.getByRole("button", {
    name: "Sign in with email",
    exact: true,
  });
  await readySignIn.waitFor({ timeout: 20_000 });
  assert.equal(
    await readySignIn.isEnabled(),
    true,
    `${identity.role} public authentication form did not hydrate.`,
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Create your account", exact: true })
    .waitFor({ timeout: 20_000 });
  await form.getByLabel("Email", { exact: true }).fill(identity.email);
  await form.getByLabel("Password", { exact: true }).fill(identity.password);
  await form
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const status = page.getByTestId("quipsly-login-status");
  await status
    .getByText(/Check your inbox|account was created/i)
    .waitFor({ timeout: 20_000 });

  const firebaseUser = await auth.getUserByEmail(identity.email);
  assert.equal(
    firebaseUser.emailVerified,
    false,
    `${identity.role} disposable mailbox unexpectedly bypassed verification.`,
  );
  await auth.updateUser(firebaseUser.uid, {
    emailVerified: true,
    displayName: identity.displayName,
  });

  await form.getByLabel("Email", { exact: true }).fill(identity.email);
  await form.getByLabel("Password", { exact: true }).fill(identity.password);
  await form
    .getByRole("button", { name: "Sign in with email", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.pathname === callbackURL.pathname &&
      url.search === callbackURL.search,
    { timeout: 30_000 },
  );
  return {
    firebaseUid: firebaseUser.uid,
    localMailboxVerificationAdapterUsed: true,
  };
}

async function gotoRenderedRoute(page, destination) {
  const expected = new URL(destination, baseURL);
  let lastAbort = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(expected.toString(), { waitUntil: "domcontentloaded" });
    } catch (error) {
      // Closing the persistent call dock can finish one final Next navigation
      // while Playwright starts the next explicit route. Chromium reports that
      // bounded race as ERR_ABORTED. Retry the exact requested URL, but never
      // accept a different rendered destination as equivalent evidence.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("net::ERR_ABORTED")) throw error;
      lastAbort = error;
    }
    const current = new URL(page.url());
    if (
      current.origin === expected.origin &&
      current.pathname === expected.pathname &&
      current.search === expected.search
    ) return;
    await page.waitForTimeout(250);
  }
  throw lastAbort || new Error(`Could not render exact route ${expected.pathname}${expected.search}.`);
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const coachContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write", "microphone", "camera"],
  reducedMotion: "reduce",
});
const clientContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["microphone", "camera"],
  reducedMotion: "reduce",
});
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const evidence = {
  testLane: "fresh-ui-automation",
  fixtureIdentifiersUsed: false,
  humanAcceptanceSatisfied: false,
  localMailboxVerificationAdapterUsed: true,
};

try {
  evidence.coachAuth = await createVerifyAndSignIn(
    coachPage,
    identities.coach,
    "/coaching",
  );
  await coachPage
    .getByRole("heading", {
      name: "Schedule your first coaching session",
      exact: true,
    })
    .waitFor({ timeout: 30_000 });
  await coachPage
    .getByRole("link", { name: "Schedule a session", exact: true })
    .waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(
    coachPage.locator("main").last(),
    "fresh coach scheduling at phone width",
  );
  const coachProfile = coachPage.locator("#coach-setup");
  await coachProfile.waitFor({ state: "visible", timeout: 30_000 });
  await coachProfile
    .getByText("automatic", { exact: true })
    .waitFor({ timeout: 30_000 });
  assert.equal(
    await coachProfile.getAttribute("open"),
    null,
    "Optional coaching preferences opened before the scheduling path.",
  );
  evidence.automaticCoachDefaultsRendered = true;
  evidence.mandatoryCoachConfigurationRequired = false;

  const appointment = coachPage.locator("#create-appointment");
  await appointment.waitFor({ state: "visible", timeout: 30_000 });
  await appointment
    .getByLabel("Client email", { exact: true })
    .fill(identities.client.email);
  await appointment.getByText("More options", { exact: true }).click();
  await appointment
    .getByLabel("Client name", { exact: true })
    .fill(identities.client.displayName);
  await appointment
    .getByLabel("Session name", { exact: true })
    .fill(sessionTitle);
  await appointment
    .getByLabel("Duration", { exact: true })
    .selectOption("45");
  if (seriesMode) {
    await appointment
      .locator("label")
      .filter({ hasText: /^\s*Repeat\s*/ })
      .locator("select")
      .selectOption("WEEKLY");
    await appointment
      .locator("label")
      .filter({ hasText: /^\s*Number of Sessions\s*/ })
      .locator("select")
      .selectOption("4");
    evidence.recurringSeriesSelectedThroughRenderedForm = true;
  }
  const [invitationResponse] = await Promise.all([
    coachPage.waitForResponse(
      (candidate) => {
        const pathname = new URL(candidate.url()).pathname;
        return (
          candidate.request().method() === "POST" &&
          /^\/api\/sessions\/[^/]+\/invitations$/.test(pathname)
        );
      },
      { timeout: 20_000 },
    ).catch(() => null),
    appointment
      .getByRole("button", {
        name: seriesMode ? "Schedule 4 Sessions" : "Schedule and send invite",
        exact: true,
      })
      .click(),
  ]);
  const handoff = coachPage.locator(
    '[aria-labelledby="created-coaching-handoff-heading"]',
  );
  await handoff.waitFor({ timeout: 30_000 });
  await handoff
    .getByRole("heading", {
      name: identities.client.displayName,
      exact: true,
    })
    .waitFor();
  if (seriesMode) {
    await handoff
      .getByText("4-Session series scheduled", { exact: true })
      .waitFor();
  }
  await assertNoHorizontalOverflow(
    handoff,
    "fresh client handoff at phone width",
  );

  assert(invitationResponse, "Scheduling emitted no invitation delivery response.");
  const invitationPacket = await invitationResponse.json().catch(() => null);
  assert.equal(invitationResponse.status(), 201);
  assert.equal(invitationPacket?.ok, true);
  assert.match(
    invitationPacket?.invitePath || "",
    /^\/sessions\/join\?token=qsinv_/,
    "Rendered invitation action did not create an expiring one-time client entry.",
  );
  assert.equal(
    invitationPacket?.delivery?.status,
    "FAILED",
    "Reserved local invitation unexpectedly claimed external delivery.",
  );
  assert.equal(
    invitationPacket?.delivery?.errorCode,
    "LOCAL_TEST_RECIPIENT",
    "Reserved local invitation did not use the fail-closed local delivery boundary.",
  );
  await handoff
    .getByText(/kept this local test invitation on this device/i)
    .waitFor({ timeout: 20_000 });
  evidence.primaryInvitationActionAttempted = true;
  evidence.localInvitationDeliveryReceiptRecorded = true;
  evidence.externalInvitationMessageSent = false;

  await handoff
    .getByText("Invitation options", { exact: true })
    .click();
  await handoff
    .getByRole("button", { name: "Copy invite link", exact: true })
    .click();
  await handoff.getByText(/copied/i).waitFor({ timeout: 20_000 });
  const copiedClientEntry = await coachPage.evaluate(() =>
    navigator.clipboard.readText(),
  );
  const clientEntryURL = new URL(copiedClientEntry, baseURL);
  assert.equal(
    clientEntryURL.origin,
    baseURL,
    "Rendered client entry escaped the local Quipsly origin.",
  );
  assert.match(
    clientEntryURL.pathname,
    /^\/sessions\/[^/]+$/,
    "Rendered client entry did not target one private Session.",
  );
  evidence.clientEntryPath = `${clientEntryURL.pathname}${clientEntryURL.search}`;
  evidence.roomId = decodeURIComponent(
    clientEntryURL.pathname.split("/").at(-1),
  );

  const invitationEntryURL = new URL(invitationPacket.invitePath, baseURL);
  assert.equal(invitationEntryURL.origin, baseURL);
  assert.equal(invitationEntryURL.pathname, "/sessions/join");

  await clientPage.goto(invitationEntryURL.toString(), {
    waitUntil: "domcontentloaded",
  });
  const clientSignInGate = clientPage.getByRole("link", {
    name: "Continue",
    exact: true,
  });
  await clientSignInGate.waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(
    clientPage.locator("main").last(),
    "fresh signed-out invitation entry at phone width",
  );
  await clientSignInGate.click();
  const invitationEntryPath = `${invitationEntryURL.pathname}${invitationEntryURL.search}`;
  await clientPage.waitForURL(
    (url) =>
      url.pathname === "/login" &&
      url.searchParams.get("callbackUrl") === invitationEntryPath,
    { timeout: 20_000 },
  );
  evidence.clientAuth = await createVerifyAndSignIn(
    clientPage,
    identities.client,
    invitationEntryPath,
  );
  const acceptInvitation = clientPage.getByRole("button", {
    name: "Continue to Session",
    exact: true,
  });
  await acceptInvitation.waitFor({ timeout: 20_000 });
  await acceptInvitation.click();
  await clientPage.waitForURL(
    (url) =>
      url.pathname === clientEntryURL.pathname &&
      url.searchParams.get("mode") === "live" &&
      url.searchParams.get("joined") === "1",
    { timeout: 30_000 },
  );
  evidence.clientAcceptedOneTimeInvitation = true;
  await clientPage
    .getByText(sessionTitle, { exact: false })
    .first()
    .waitFor({ timeout: 30_000 });
  const captureChoice = clientPage.getByRole("link", {
    name: /Use Quipsly Capture on iPhone|Open Quipsly Capture/i,
  });
  await captureChoice.waitFor({ timeout: 30_000 });
  const captureInstallLink = clientPage.getByRole("link", {
    name: /Get Quipsly Capture for iPhone/i,
  });
  await captureInstallLink.waitFor({ timeout: 30_000 });
  assert.doesNotMatch(
    (await captureInstallLink.textContent()) ?? "",
    /beta/i,
    "Fresh client install choice regressed to beta-era product language.",
  );
  assert.equal(
    await captureInstallLink.getAttribute("href"),
    "https://testflight.apple.com/join/XwRRcYUm",
    "Fresh client Session did not expose the verified current Capture install path.",
  );
  assert.equal(
    await captureChoice.getAttribute("href"),
    captureAppDeepLink(evidence.roomId),
    "Fresh client Session did not expose the canonical installed-app handoff.",
  );
  const continueInBrowser = clientPage.getByRole("button", {
    name: /Continue in this browser|Join call|Join in browser|Open call lobby/i,
  });
  await continueInBrowser.waitFor({ timeout: 30_000 });
  const browserChoiceRequest = clientPage.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        `/api/sessions/${encodeURIComponent(evidence.roomId)}/entry-choice`,
    { timeout: 20_000 },
  );
  await continueInBrowser.click();
  await browserChoiceRequest;
  const liveCallDock = clientPage.locator(
    `aside[aria-label="${sessionTitle} live call dock"]`,
  );
  await liveCallDock.waitFor({ state: "visible", timeout: 30_000 });
  // The fresh-start flight only enters the ordinary device lobby; it does not
  // join media. Preserve the product's defining persistent-call behavior by
  // minimizing this workspace before continuing through Coaching instead of
  // manufacturing a leave ceremony for a call that never started.
  const minimizeLiveCall = liveCallDock.getByRole("button", {
    name: "Minimize live call",
    exact: true,
  });
  const minimizeLiveCallHandle = await minimizeLiveCall.elementHandle();
  assert.ok(
    minimizeLiveCallHandle,
    "The rendered live-call minimize action disappeared before hydration.",
  );
  await clientPage.waitForFunction(
    (button) =>
      Object.getOwnPropertyNames(button).some((key) =>
        key.startsWith("__reactProps$"),
      ),
    minimizeLiveCallHandle,
    { timeout: 30_000 },
  );
  await minimizeLiveCall.click();
  const liveCallDockHandle = await liveCallDock.elementHandle();
  assert.ok(
    liveCallDockHandle,
    "The live-call workspace disappeared without exposing its minimized control.",
  );
  await clientPage.waitForFunction(
    (dock) => dock.getAttribute("aria-hidden") === "true",
    liveCallDockHandle,
    { timeout: 20_000 },
  );
  await clientPage
    .getByLabel("Minimized live call", { exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  evidence.clientBrowserChoiceOpenedDeviceSetup = true;
  await assertNoHorizontalOverflow(
    clientPage.locator("main").last(),
    "fresh client Session at phone width",
  );
  await gotoRenderedRoute(clientPage, "/coaching");
  const clientNextSession = clientPage.getByRole("link", {
    name: "Open my session",
    exact: true,
  });
  await clientNextSession.waitFor({ timeout: 30_000 });
  const clientNextSessionURL = new URL(
    (await clientNextSession.getAttribute("href")) || "",
    baseURL,
  );
  assert.equal(
    clientNextSessionURL.pathname,
    clientEntryURL.pathname,
    "Client-only coaching home did not return to the exact private Session.",
  );
  assert.equal(
    await clientPage
      .getByRole("heading", { name: "Coaching preferences" })
      .count(),
    0,
    "Client-only coaching home exposed coach setup.",
  );
  assert.equal(
    await clientPage
      .getByRole("heading", { name: "Schedule a Session" })
      .count(),
    0,
    "Client-only coaching home exposed coach scheduling controls.",
  );
  await assertNoHorizontalOverflow(
    clientPage.locator("main").last(),
    "fresh client coaching home at phone width",
  );
  evidence.clientOnlyHomeOpenedExactSession = true;
  evidence.clientOnlyHomeExcludedCoachControls = true;
  evidence.captureInstallAndExactRoomHandoffVisible = true;

  const room = await prisma.callRoom.findUniqueOrThrow({
    where: { id: evidence.roomId },
    select: {
      id: true,
      purpose: true,
      booking: {
        select: {
          id: true,
          engagementId: true,
          coachUserId: true,
          clientUserId: true,
          timezone: true,
          seriesId: true,
          seriesSequence: true,
        },
      },
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: { userId: true, role: true },
      },
    },
  });
  const users = await prisma.user.findMany({
    where: {
      id: { in: [room.booking.coachUserId, room.booking.clientUserId] },
    },
    select: {
      id: true,
      primaryEmail: true,
      roles: { select: { role: true } },
      emailVerified: true,
    },
  });
  const invitationReadback = await prisma.callRoomInvitation.findFirstOrThrow({
    where: { roomId: room.id, email: identities.client.email },
    select: {
      status: true,
      acceptedByUserId: true,
      tokenHash: true,
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, errorCode: true, recipientEmail: true },
      },
    },
  });
  const coachUser = users.find((user) => user.id === room.booking.coachUserId);
  const clientUser = users.find(
    (user) => user.id === room.booking.clientUserId,
  );
  const browserChoiceEvent = await prisma.userEvent.findFirst({
    where: {
      userId: room.booking.clientUserId,
      eventName: SESSION_ENTRY_CHOICE_EVENT_NAMES.BROWSER,
      payloadJson: { path: ["roomId"], equals: room.id },
    },
    select: { id: true },
  });
  assert.equal(coachUser?.primaryEmail, identities.coach.email);
  assert.equal(clientUser?.primaryEmail, identities.client.email);
  assert.equal(
    coachUser?.roles.some(({ role }) => role === "COACH"),
    true,
  );
  assert.equal(
    clientUser?.roles.some(({ role }) =>
      ["OWNER", "ADMIN", "COACH", "TEAM_SCHEDULER"].includes(role),
    ),
    false,
  );
  assert(
    browserChoiceEvent,
    "Fresh client browser choice was not retained against the exact private Session.",
  );
  assert.equal(room.booking.timezone, "America/Denver");
  if (seriesMode) {
    assert(room.booking.seriesId, "Rendered recurring scheduling did not bind the first Session to a series.");
    assert.equal(room.booking.seriesSequence, 1);
    const series = await prisma.coachingBookingSeries.findUniqueOrThrow({
      where: { id: room.booking.seriesId },
      select: {
        frequency: true,
        intervalCount: true,
        occurrenceCount: true,
        timezone: true,
        bookings: {
          orderBy: { seriesSequence: "asc" },
          select: { id: true, seriesSequence: true, callRoom: { select: { id: true } } },
        },
      },
    });
    assert.deepEqual(
      {
        frequency: series.frequency,
        intervalCount: series.intervalCount,
        occurrenceCount: series.occurrenceCount,
        timezone: series.timezone,
        sequences: series.bookings.map((booking) => booking.seriesSequence),
        roomCount: series.bookings.filter((booking) => booking.callRoom).length,
      },
      {
        frequency: "WEEKLY",
        intervalCount: 1,
        occurrenceCount: 4,
        timezone: "America/Denver",
        sequences: [1, 2, 3, 4],
        roomCount: 4,
      },
    );
    evidence.recurringSeriesPersistedAtomically = true;
    evidence.recurringSeriesId = room.booking.seriesId;
    evidence.recurringSeriesOccurrenceCount = 4;
  }
  assert.equal(invitationReadback.status, "ACCEPTED");
  assert.equal(invitationReadback.acceptedByUserId, clientUser?.id);
  assert.equal(invitationReadback.tokenHash, null);
  assert.deepEqual(invitationReadback.deliveries[0], {
    status: "FAILED",
    errorCode: "LOCAL_TEST_RECIPIENT",
    recipientEmail: identities.client.email,
  });
  assert(
    room.booking.engagementId,
    "Rendered appointment did not create the private coaching relationship.",
  );

  evidence.bookingId = room.booking.id;
  evidence.engagementId = room.booking.engagementId;
  evidence.coachUserId = coachUser.id;
  evidence.clientUserId = clientUser.id;
  evidence.clientHasNoStaffAuthority = true;
  evidence.coachIdentityCreatedOnFirstSession = true;
  evidence.appointmentCreatedThroughRenderedProduct = true;
  evidence.clientEntryCopiedFromRenderedProduct = true;
  evidence.clientInvitationAcceptedThroughRenderedProduct = true;
  evidence.privateClientEntryRequiredRenderedSignInGate = true;
  evidence.clientCreatedAccountFromExactEntry = true;
  evidence.phoneWidthOverflow = false;
  evidence.readyForContinuation = true;

  const artifactDirectory = path.join(
    repoRoot,
    "artifacts",
    "coaching-acceptance",
    suffix,
  );
  await mkdir(artifactDirectory, { recursive: true });
  const contextPath = path.join(artifactDirectory, "fresh-start-context.json");
  const context = {
    schema: "quipsly-fresh-coaching-acceptance-context-v1",
    createdAt: new Date().toISOString(),
    baseURL,
    keychainService,
    testLane: evidence.testLane,
    humanAcceptanceSatisfied: false,
    sessionTitle,
    roomId: evidence.roomId,
    bookingId: evidence.bookingId,
    engagementId: evidence.engagementId,
    recurringSeriesId: evidence.recurringSeriesId || null,
    recurringSeriesOccurrenceCount: evidence.recurringSeriesOccurrenceCount || 1,
    clientEntryPath: evidence.clientEntryPath,
    identities: {
      coach: {
        role: "coach",
        email: identities.coach.email,
        displayName: identities.coach.displayName,
        firebaseUid: evidence.coachAuth.firebaseUid,
        userId: evidence.coachUserId,
      },
      client: {
        role: "client",
        email: identities.client.email,
        displayName: identities.client.displayName,
        firebaseUid: evidence.clientAuth.firebaseUid,
        userId: evidence.clientUserId,
      },
    },
    boundaries: {
      passwordsStoredInMacOSKeychain: true,
      passwordsWrittenToArtifact: false,
      databaseMutatedOutsideProduct: false,
      localMailboxVerificationAdapterUsed: true,
      localInvitationDeliveryBoundaryUsed: true,
      externalInvitationMessageSent: false,
      recurringSeriesMode: seriesMode,
      invitationTokenWrittenToArtifact: false,
    },
  };
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, {
    mode: 0o600,
  });
  evidence.contextPath = contextPath;
  evidence.sessionTitle = sessionTitle;

  if (typeof process.send === "function") {
    await new Promise((resolve, reject) => {
      process.send(
        createFreshCoachingCredentialIPCPacket(identities),
        (error) => (error ? reject(error) : resolve()),
      );
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        ...evidence,
        coachEmail: identities.coach.email,
        clientEmail: identities.client.email,
        passwordsPrinted: false,
        artifactsRetained: true,
        boundaries: {
          noKnownRoomOrUserIdentifierUsedToStart: true,
          noDatabaseMutationAfterJourneyStarted: true,
          publicSignupFormsUsed: true,
          exactRenderedClientEntryUsed: true,
          primaryInvitationActionAttempted: true,
          oneTimeInvitationAccepted: true,
          localMailboxVerificationAdapterUsed: true,
          realMailboxDeliveryProven: false,
          humanNoviceAcceptanceProven: false,
          callCaptureTranscriptShareProven: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await clearRenderedSession(coachPage, baseURL, "fresh coach").catch(
    () => undefined,
  );
  await clearRenderedSession(clientPage, baseURL, "fresh client").catch(
    () => undefined,
  );
  await coachContext.close();
  await clientContext.close();
  await browser.close();
  await prisma.$disconnect();
}
