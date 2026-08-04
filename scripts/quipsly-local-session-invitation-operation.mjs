#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const enabled = process.env.QUIPSLY_LOCAL_SESSION_INVITATION_OPERATION === "1";
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Local Session invitation operation base URL",
);
const ROOM_ID = "retained-session-invitation-20260804";
const PROVIDER_ROOM_ID = "quipsly-retained-session-invitation-20260804";
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const host = {
  role: "host",
  uid: "quipsly-coach-retained-20260731",
  email: "quipsly-coach-retained-20260731@example.test",
  displayName: "Quipsly Retained Coach",
};
const guest = {
  role: "guest",
  uid: "quipsly-client-retained-20260731",
  email: "quipsly-client-retained-20260731@example.test",
  displayName: "Quipsly Retained Client",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(enabled, "Set QUIPSLY_LOCAL_SESSION_INVITATION_OPERATION=1 to authorize the retained local invitation artifact.");
const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Retained Session invitation operation requires loopback PostgreSQL and refuses remote databases.",
);
process.env.DATABASE_URL = databaseURL.toString();

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const sourceRoom = await prisma.callRoom.findUnique({
  where: { id: "retained-coaching-follow-up-20260731" },
  select: { projectId: true, projectSlug: true, nestSlug: true },
});
assert(sourceRoom?.projectId, "The retained coaching Nest fixture is unavailable.");
const users = await prisma.user.findMany({
  where: { firebaseUid: { in: [host.uid, guest.uid] } },
  select: { id: true, firebaseUid: true },
});
const userByUid = new Map(users.map((user) => [user.firebaseUid, user.id]));
assert(userByUid.has(host.uid) && userByUid.has(guest.uid), "Retained host and guest identities are unavailable.");

await prisma.callRoom.upsert({
  where: { id: ROOM_ID },
  create: {
    id: ROOM_ID,
    projectId: sourceRoom.projectId,
    projectSlug: sourceRoom.projectSlug,
    nestSlug: sourceRoom.nestSlug,
    createdByUserId: userByUid.get(host.uid),
    purpose: "COACHING",
    status: "OPEN",
    provider: "livekit",
    providerRoomId: PROVIDER_ROOM_ID,
    title: "Retained email-bound Session invitation rehearsal",
    openedAt: new Date(),
    metadataJson: { source: "quipsly-local-session-invitation-operation", localOnly: true, retainedTestArtifact: true },
  },
  update: {
    createdByUserId: userByUid.get(host.uid),
    projectId: sourceRoom.projectId,
    projectSlug: sourceRoom.projectSlug,
    nestSlug: sourceRoom.nestSlug,
    purpose: "COACHING",
    status: "OPEN",
    provider: "livekit",
    providerRoomId: PROVIDER_ROOM_ID,
    openedAt: new Date(),
    endedAt: null,
  },
});
await prisma.callRoomInvitation.deleteMany({ where: { roomId: ROOM_ID } });
await prisma.callParticipant.deleteMany({ where: { roomId: ROOM_ID } });
await prisma.callParticipant.create({
  data: {
    roomId: ROOM_ID,
    userId: userByUid.get(host.uid),
    email: host.email,
    displayName: host.displayName,
    role: "HOST",
    deviceLabel: "Retained host browser",
  },
});

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const journeys = [];
try {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ["microphone", "camera"], reducedMotion: "reduce" });
  const hostPage = await hostContext.newPage();
  const hostPassword = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: host.email });
  assert(hostPassword, "Retained host Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: hostPage,
    baseURL,
    identity: host,
    password: hostPassword,
    callbackPath: `/sessions/${ROOM_ID}?mode=live`,
  });
  journeys.push({ identity: host, context: hostContext, page: hostPage });

  await hostPage.getByText("Invite someone to this Session", { exact: true }).click();
  await hostPage.getByLabel("Email", { exact: true }).fill(guest.email);
  await hostPage.getByLabel("Name, optional", { exact: true }).fill(guest.displayName);
  const invitationForm = hostPage.locator("form").filter({ hasText: "Expiring, email-bound invitation" });
  await invitationForm.locator("select").first().selectOption("CLIENT");
  const createdResponse = hostPage.waitForResponse((response) => (
    response.url().includes(`/api/sessions/${ROOM_ID}/invitations`)
      && response.request().method() === "POST"
  ));
  await hostPage.getByRole("button", { name: "Create private link", exact: true }).click();
  const invitationPacket = await (await createdResponse).json();
  assert(invitationPacket?.ok === true && invitationPacket?.invitePath, "Rendered host invitation did not return a private link.");
  assert(invitationPacket?.boundaries?.emailSent === false, "Invitation operation unexpectedly claimed external email delivery.");
  const inviteURL = new URL(invitationPacket.invitePath, baseURL);
  assert(inviteURL.pathname === "/sessions/join", "Invitation link did not target the canonical Session lobby.");
  assert(inviteURL.searchParams.get("token")?.startsWith("qsinv_"), "Invitation link omitted opaque Session token material.");
  const operatedInviteURL = inviteURL;
  await hostPage.getByText(/Quipsly has not emailed or messaged anyone/i).waitFor({ timeout: 20_000 });

  const wrongAccountPage = await hostContext.newPage();
  await wrongAccountPage.goto(operatedInviteURL.toString(), { waitUntil: "domcontentloaded" });
  await wrongAccountPage.getByRole("link", { name: "Switch account", exact: true }).waitFor({ timeout: 20_000 });
  assert(await wrongAccountPage.getByRole("button", { name: "Accept and open lobby", exact: true }).count() === 0, "Wrong account was offered invitation acceptance.");
  const stillPending = await prisma.callRoomInvitation.findFirst({ where: { roomId: ROOM_ID, email: guest.email } });
  assert(stillPending?.status === "PENDING" && Boolean(stillPending.tokenHash), "Wrong-account inspection changed the invitation ledger.");
  await wrongAccountPage.close();

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone", "camera"], reducedMotion: "reduce" });
  const guestPage = await guestContext.newPage();
  const guestPassword = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: guest.email });
  assert(guestPassword, "Retained guest Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: guestPage,
    baseURL,
    identity: guest,
    password: guestPassword,
    callbackPath: `${operatedInviteURL.pathname}${operatedInviteURL.search}`,
  });
  journeys.push({ identity: guest, context: guestContext, page: guestPage });
  await guestPage.getByRole("heading", { name: "Retained email-bound Session invitation rehearsal", exact: true }).waitFor({ timeout: 20_000 });
  await guestPage.getByText(`Signed in as ${guest.email}`, { exact: true }).waitFor();
  await guestPage.getByRole("button", { name: "Accept and open lobby", exact: true }).click();
  await guestPage.waitForURL(new RegExp(`/sessions/${ROOM_ID}\\?mode=live&joined=1$`), { timeout: 20_000 });
  const replayPage = await guestContext.newPage();
  await replayPage.goto(operatedInviteURL.toString(), { waitUntil: "domcontentloaded" });
  await replayPage.getByRole("heading", { name: "This link cannot open a Session.", exact: true }).waitFor({ timeout: 20_000 });
  assert(await replayPage.getByRole("button", { name: "Accept and open lobby", exact: true }).count() === 0, "Consumed invitation was offered a second acceptance.");
  await replayPage.close();

  for (const journey of journeys) {
    const allowMicrophone = journey.page.getByRole("button", { name: "Allow microphone", exact: true });
    await allowMicrophone.waitFor({ timeout: 20_000 });
    await allowMicrophone.click();
    const join = journey.page.getByRole("button", { name: "Join live room", exact: true });
    await join.waitFor({ state: "visible", timeout: 20_000 });
    for (let attempt = 0; attempt < 40 && !(await join.isEnabled()); attempt += 1) await journey.page.waitForTimeout(250);
    assert(await join.isEnabled(), `${journey.identity.role} device setup did not become join-ready.`);
    await join.click();
    await journey.page.getByRole("button", { name: "Leave", exact: true }).waitFor({ timeout: 20_000 });
  }
  for (const journey of journeys) {
    await journey.page.getByText("In this room · 2", { exact: true }).waitFor({ timeout: 20_000 });
  }

  const receiptText = `Accepted invitation guest joined the retained Session on ${new Date().toISOString()}.`;
  await guestPage.getByPlaceholder("Write to everyone in this Session…").fill(receiptText);
  await guestPage.getByRole("button", { name: "Send Session message", exact: true }).click();
  await hostPage.getByText(receiptText, { exact: true }).waitFor({ timeout: 20_000 });

  const [invitation, participant] = await Promise.all([
    prisma.callRoomInvitation.findFirst({ where: { roomId: ROOM_ID, email: guest.email } }),
    prisma.callParticipant.findFirst({ where: { roomId: ROOM_ID, userId: userByUid.get(guest.uid) } }),
  ]);
  assert(invitation?.status === "ACCEPTED" && !invitation.tokenHash, "Invitation ledger did not become accepted and tokenless.");
  assert(participant?.role === "CLIENT" && participant.id === invitation.participantId, "Accepted invitation did not bind the intended participant role and identity.");

  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    roomId: ROOM_ID,
    inviteScope: "SESSION_ONLY",
    emailBoundAcceptance: "passed",
    wrongAccountDenial: "passed",
    oneTimeTokenRemoved: true,
    consumedLinkReplayDenial: "passed",
    participantRole: participant.role,
    browserToBrowserLiveKit: "passed",
    sessionChatRoundTrip: "passed",
    externalInvitationSent: false,
    retainedSourceStarted: false,
    providerRecordingStarted: false,
    secretsPrinted: false,
  }, null, 2));
} finally {
  for (const journey of journeys) {
    await journey.page.getByRole("button", { name: "Leave", exact: true }).click().catch(() => undefined);
    await clearRenderedSession(journey.page, baseURL, journey.identity.role).catch(() => undefined);
    await journey.context.close();
  }
  await browser.close();
  await prisma.callRoom.update({ where: { id: ROOM_ID }, data: { status: "ENDED", endedAt: new Date() } }).catch(() => undefined);
  await prisma.$disconnect();
}
