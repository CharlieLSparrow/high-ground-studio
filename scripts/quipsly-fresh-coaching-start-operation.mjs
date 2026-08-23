#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { writeRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
} from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_FRESH_COACHING_START_OPERATION === "1";
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

if (!getApps().length) initializeApp({ projectId: "quipsly-reef" });
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
  try {
    await page.goto(expected.toString(), { waitUntil: "domcontentloaded" });
  } catch (error) {
    // Next's client router can finish the same navigation while Playwright's
    // explicit navigation is still pending. Chromium reports that harmless
    // race as ERR_ABORTED even though the requested route rendered. Recover
    // only when the browser proves it landed on the exact destination; every
    // other abort remains a real acceptance failure.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("net::ERR_ABORTED")) throw error;
    await page.waitForURL(
      (candidate) =>
        candidate.origin === expected.origin &&
        candidate.pathname === expected.pathname &&
        candidate.search === expected.search,
      { timeout: 10_000 },
    );
  }
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
  await appointment.getByLabel("Minutes", { exact: true }).fill("45");
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
      .getByRole("button", { name: "Schedule and send invite", exact: true })
      .click(),
  ]);
  const handoff = coachPage.locator(
    '[aria-labelledby="created-coaching-handoff-heading"]',
  );
  await handoff.waitFor({ timeout: 30_000 });
  await handoff
    .getByRole("heading", {
      name: `Invite ${identities.client.displayName}`,
      exact: true,
    })
    .waitFor();
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
    .getByRole("button", { name: "Copy client entry", exact: true })
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
    name: /Get the beta/i,
  });
  await captureInstallLink.waitFor({ timeout: 30_000 });
  assert.equal(
    await captureInstallLink.getAttribute("href"),
    "https://testflight.apple.com/join/XwRRcYUm",
    "Fresh client Session did not expose the verified Capture beta install path.",
  );
  assert.equal(
    await captureChoice.getAttribute("href"),
    `quipsly://session/${encodeURIComponent(evidence.roomId)}?mode=live`,
    "Fresh client Session did not hand the exact room to Capture.",
  );
  const continueInBrowser = clientPage.getByRole("button", {
    name: /Join call|Join in browser|Open call lobby/i,
  });
  await continueInBrowser.waitFor({ timeout: 30_000 });
  const browserChoiceResponse = clientPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/sessions/${encodeURIComponent(evidence.roomId)}/entry-choice`,
    { timeout: 20_000 },
  );
  await continueInBrowser.click();
  const recordedBrowserChoice = await browserChoiceResponse;
  assert(
    recordedBrowserChoice.status() === 200,
    "Fresh client browser choice was not recorded against the exact private Session.",
  );
  const liveCallDock = clientPage.locator(
    `aside[aria-label="${sessionTitle} live call dock"]`,
  );
  await liveCallDock.waitFor({ state: "visible", timeout: 30_000 });
  await liveCallDock
    .getByRole("button", { name: "Close live call", exact: true })
    .click();
  await liveCallDock.waitFor({ state: "detached", timeout: 20_000 });
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
  assert.equal(room.booking.timezone, "America/Denver");
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
      invitationTokenWrittenToArtifact: false,
    },
  };
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, {
    mode: 0o600,
  });
  evidence.contextPath = contextPath;
  evidence.sessionTitle = sessionTitle;

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
