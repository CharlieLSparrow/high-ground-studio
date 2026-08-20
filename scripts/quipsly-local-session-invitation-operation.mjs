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
const WORKSPACE_SLUG = "qa-retained-session-access";
const PROJECT_SLUG = "qa-retained-session-access";
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

assert(
  enabled,
  "Set QUIPSLY_LOCAL_SESSION_INVITATION_OPERATION=1 to authorize the retained local invitation artifact.",
);
const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Retained Session invitation operation requires loopback PostgreSQL and refuses remote databases.",
);
process.env.DATABASE_URL = databaseURL.toString();

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const users = await prisma.user.findMany({
  where: { firebaseUid: { in: [host.uid, guest.uid] } },
  select: { id: true, firebaseUid: true },
});
const userByUid = new Map(users.map((user) => [user.firebaseUid, user.id]));
assert(
  userByUid.has(host.uid) && userByUid.has(guest.uid),
  "Retained host and guest identities are unavailable.",
);

const operationWorkspace = await prisma.studioWorkspace.upsert({
  where: { slug: WORKSPACE_SLUG },
  update: {
    name: "QA Retained · Session access",
    ownerLabel: host.email,
    isPrivate: true,
  },
  create: {
    id: "qa-retained-session-access-workspace",
    slug: WORKSPACE_SLUG,
    name: "QA Retained · Session access",
    description:
      "Private local-only participant removal and restoration acceptance evidence.",
    ownerLabel: host.email,
    isPrivate: true,
  },
});
const operationProject = await prisma.studioProject.upsert({
  where: {
    workspaceId_slug: {
      workspaceId: operationWorkspace.id,
      slug: PROJECT_SLUG,
    },
  },
  update: { name: "QA Retained · Session access", isPrivate: true },
  create: {
    id: "qa-retained-session-access-project",
    workspaceId: operationWorkspace.id,
    slug: PROJECT_SLUG,
    name: "QA Retained · Session access",
    description:
      "A Session-only guest boundary with no surrounding Nest grant.",
    sourceLabel: "quipsly-local-session-invitation-operation",
    isPrivate: true,
  },
});
await prisma.studioProjectAccessGrant.upsert({
  where: {
    projectId_email: { projectId: operationProject.id, email: host.email },
  },
  update: {
    role: "OWNER",
    status: "ACTIVE",
    createdByUserId: userByUid.get(host.uid),
    createdByEmail: host.email,
  },
  create: {
    projectId: operationProject.id,
    email: host.email,
    role: "OWNER",
    status: "ACTIVE",
    createdByUserId: userByUid.get(host.uid),
    createdByEmail: host.email,
  },
});
await prisma.studioProjectAccessGrant.deleteMany({
  where: { projectId: operationProject.id, email: guest.email },
});

await prisma.callRoom.upsert({
  where: { id: ROOM_ID },
  create: {
    id: ROOM_ID,
    projectId: operationProject.id,
    projectSlug: operationProject.slug,
    nestSlug: operationProject.slug,
    createdByUserId: userByUid.get(host.uid),
    purpose: "COACHING",
    status: "OPEN",
    provider: "livekit",
    providerRoomId: PROVIDER_ROOM_ID,
    title: "Retained email-bound Session invitation rehearsal",
    openedAt: new Date(),
    metadataJson: {
      source: "quipsly-local-session-invitation-operation",
      localOnly: true,
      retainedTestArtifact: true,
    },
  },
  update: {
    createdByUserId: userByUid.get(host.uid),
    projectId: operationProject.id,
    projectSlug: operationProject.slug,
    nestSlug: operationProject.slug,
    purpose: "COACHING",
    status: "OPEN",
    provider: "livekit",
    providerRoomId: PROVIDER_ROOM_ID,
    openedAt: new Date(),
    endedAt: null,
  },
});
await prisma.callParticipantAccessReceipt.deleteMany({
  where: { roomId: ROOM_ID },
});
await prisma.callParticipantProviderGrantReceipt.deleteMany({
  where: { roomId: ROOM_ID },
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
  const hostContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ["microphone", "camera"],
    reducedMotion: "reduce",
  });
  const hostPage = await hostContext.newPage();
  const hostPassword = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: host.email,
  });
  assert(hostPassword, "Retained host Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: hostPage,
    baseURL,
    identity: host,
    password: hostPassword,
    callbackPath: `/sessions/${ROOM_ID}?mode=prepare`,
  });
  journeys.push({ identity: host, context: hostContext, page: hostPage });

  await hostPage
    .getByText("Invite someone to this Session", { exact: true })
    .click();
  await hostPage.getByLabel("Email", { exact: true }).fill(guest.email);
  await hostPage
    .getByLabel("Name, optional", { exact: true })
    .fill(guest.displayName);
  const invitationForm = hostPage
    .locator("form")
    .filter({ hasText: "Expiring, email-bound invitation" });
  await invitationForm.locator("select").first().selectOption("CLIENT");
  const invitationRequests = [];
  hostPage.on("request", (request) => {
    if (request.url().includes(`/api/sessions/${ROOM_ID}/invitations`)) {
      invitationRequests.push({ method: request.method(), url: request.url() });
    }
  });
  const createdResponse = hostPage
    .waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${ROOM_ID}/invitations`) &&
        response.request().method() === "POST",
    )
    .then((response) => ({ response, error: null }))
    .catch((error) => ({ response: null, error }));
  await hostPage
    .getByRole("button", { name: "Create private link", exact: true })
    .click();
  let invitationResponse;
  try {
    const result = await createdResponse;
    if (result.error || !result.response) throw result.error;
    invitationResponse = result.response;
  } catch (error) {
    const button = hostPage.getByRole("button", {
      name: "Create private link",
      exact: true,
    });
    const deliveryStatus = await hostPage
      .getByText("Delivery and status", { exact: true })
      .locator("..")
      .innerText()
      .catch(() => "unavailable");
    throw new Error(
      `Rendered invitation did not issue its POST. Requests: ${JSON.stringify(invitationRequests)}. Button disabled: ${await button.isDisabled().catch(() => "unknown")}. Delivery surface: ${deliveryStatus.slice(0, 600)}`,
      { cause: error },
    );
  }
  const invitationPacket = await invitationResponse.json();
  assert(
    invitationPacket?.ok === true && invitationPacket?.invitePath,
    "Rendered host invitation did not return a private link.",
  );
  assert(
    invitationPacket?.boundaries?.emailSent === false,
    "Invitation operation unexpectedly claimed external email delivery.",
  );
  const inviteURL = new URL(invitationPacket.invitePath, baseURL);
  assert(
    inviteURL.pathname === "/sessions/join",
    "Invitation link did not target the canonical Session lobby.",
  );
  assert(
    inviteURL.searchParams.get("token")?.startsWith("qsinv_"),
    "Invitation link omitted opaque Session token material.",
  );
  const operatedInviteURL = inviteURL;
  await hostPage
    .getByText(/Quipsly has not emailed or messaged anyone/i)
    .waitFor({ timeout: 20_000 });

  const wrongAccountPage = await hostContext.newPage();
  await wrongAccountPage.goto(operatedInviteURL.toString(), {
    waitUntil: "domcontentloaded",
  });
  await wrongAccountPage
    .getByRole("link", { name: "Switch account", exact: true })
    .waitFor({ timeout: 20_000 });
  assert(
    (await wrongAccountPage
      .getByRole("button", { name: "Accept and open lobby", exact: true })
      .count()) === 0,
    "Wrong account was offered invitation acceptance.",
  );
  const stillPending = await prisma.callRoomInvitation.findFirst({
    where: { roomId: ROOM_ID, email: guest.email },
  });
  assert(
    stillPending?.status === "PENDING" && Boolean(stillPending.tokenHash),
    "Wrong-account inspection changed the invitation ledger.",
  );
  await wrongAccountPage.close();

  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["microphone", "camera"],
    reducedMotion: "reduce",
  });
  const guestPage = await guestContext.newPage();
  const guestPassword = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: guest.email,
  });
  assert(guestPassword, "Retained guest Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: guestPage,
    baseURL,
    identity: guest,
    password: guestPassword,
    callbackPath: `${operatedInviteURL.pathname}${operatedInviteURL.search}`,
  });
  journeys.push({ identity: guest, context: guestContext, page: guestPage });
  await guestPage
    .getByRole("heading", {
      name: "Retained email-bound Session invitation rehearsal",
      exact: true,
    })
    .waitFor({ timeout: 20_000 });
  await guestPage
    .getByText(`Signed in as ${guest.email}`, { exact: true })
    .waitFor();
  await guestPage
    .getByRole("button", { name: "Accept and open lobby", exact: true })
    .click();
  await guestPage.waitForURL(
    new RegExp(`/sessions/${ROOM_ID}\\?mode=live&joined=1$`),
    { timeout: 20_000 },
  );
  const replayPage = await guestContext.newPage();
  await replayPage.goto(operatedInviteURL.toString(), {
    waitUntil: "domcontentloaded",
  });
  await replayPage
    .getByRole("heading", {
      name: "This link cannot open a Session.",
      exact: true,
    })
    .waitFor({ timeout: 20_000 });
  assert(
    (await replayPage
      .getByRole("button", { name: "Accept and open lobby", exact: true })
      .count()) === 0,
    "Consumed invitation was offered a second acceptance.",
  );
  await replayPage.close();

  await hostPage.goto(`${baseURL}/sessions/${ROOM_ID}?mode=live`, {
    waitUntil: "domcontentloaded",
  });

  for (const journey of journeys) {
    const allowMicrophone = journey.page.getByRole("button", {
      name: "Allow microphone",
      exact: true,
    });
    await allowMicrophone.waitFor({ timeout: 20_000 });
    await allowMicrophone.click();
    const join = journey.page.getByRole("button", {
      name: "Join live room",
      exact: true,
    });
    await join.waitFor({ state: "visible", timeout: 20_000 });
    for (
      let attempt = 0;
      attempt < 40 && !(await join.isEnabled());
      attempt += 1
    )
      await journey.page.waitForTimeout(250);
    assert(
      await join.isEnabled(),
      `${journey.identity.role} device setup did not become join-ready.`,
    );
    await join.click();
    await journey.page
      .getByRole("button", { name: "Leave", exact: true })
      .waitFor({ timeout: 20_000 });
  }
  for (const journey of journeys) {
    await journey.page
      .getByText("In this room · 2", { exact: true })
      .waitFor({ timeout: 20_000 });
  }

  const receiptText = `Accepted invitation guest joined the retained Session on ${new Date().toISOString()}.`;
  await guestPage
    .getByPlaceholder("Write to everyone in this Session…")
    .fill(receiptText);
  await guestPage
    .getByRole("button", { name: "Send collaboration message", exact: true })
    .click();
  await hostPage
    .getByText(receiptText, { exact: true })
    .waitFor({ timeout: 20_000 });

  const [invitation, participant] = await Promise.all([
    prisma.callRoomInvitation.findFirst({
      where: { roomId: ROOM_ID, email: guest.email },
    }),
    prisma.callParticipant.findFirst({
      where: { roomId: ROOM_ID, userId: userByUid.get(guest.uid) },
    }),
  ]);
  assert(
    invitation?.status === "ACCEPTED" && !invitation.tokenHash,
    "Invitation ledger did not become accepted and tokenless.",
  );
  assert(
    participant?.role === "CLIENT" &&
      participant.id === invitation.participantId,
    "Accepted invitation did not bind the intended participant role and identity.",
  );

  const hostManagerPage = await hostContext.newPage();
  const invitationLedgerLoaded = hostManagerPage.waitForResponse(
    (response) =>
      response.url().includes(`/api/sessions/${ROOM_ID}/invitations`) &&
      response.request().method() === "GET",
  );
  await hostManagerPage.goto(`${baseURL}/sessions/${ROOM_ID}?mode=prepare`, {
    waitUntil: "domcontentloaded",
  });
  await hostManagerPage
    .getByRole("heading", {
      name: "Retained email-bound Session invitation rehearsal",
      exact: true,
    })
    .waitFor({ timeout: 20_000 });
  await invitationLedgerLoaded;
  const invitationManager = hostManagerPage.getByText(
    "Invite someone to this Session",
    { exact: true },
  );
  const connectedPresenceResponse = hostManagerPage.waitForResponse(
    (response) =>
      response.url().includes(`/api/sessions/${ROOM_ID}/presence`) &&
      response.request().method() === "GET",
  );
  await invitationManager.click();
  const connectedPresencePacket = await (
    await connectedPresenceResponse
  ).json();
  const connectedPresenceSummary = {
    status: connectedPresencePacket?.presence?.status || null,
    connectedDeviceCount:
      connectedPresencePacket?.presence?.connectedDeviceCount ?? null,
    connectedParticipantCount:
      connectedPresencePacket?.presence?.connectedParticipantCount ?? null,
    unknownDeviceCount:
      connectedPresencePacket?.presence?.unknownDeviceCount ?? null,
    attentionCount: connectedPresencePacket?.presence?.attentionCount ?? null,
  };
  assert(
    connectedPresencePacket?.ok === true &&
      connectedPresencePacket?.presence?.status === "LIVE" &&
      connectedPresencePacket.presence.connectedDeviceCount === 2 &&
      connectedPresencePacket.presence.connectedParticipantCount === 2,
    `Authoritative provider presence did not read back two connected devices and people: ${JSON.stringify(connectedPresenceSummary)}`,
  );
  assert(
    connectedPresencePacket.presence.devices.every(
      (device) =>
        device.matchedToCanonicalParticipant === true &&
        device.canonicalAccessStatus === "ACTIVE" &&
        device.audio?.published === true,
    ),
    "Connected provider devices were not matched to active canonical participants with audio publication.",
  );
  const serializedConnectedPresence = JSON.stringify(
    connectedPresencePacket.presence,
  );
  for (const forbiddenField of [
    "providerIdentity",
    "tokenJti",
    "participantToken",
    "apiKey",
    "apiSecret",
  ]) {
    assert(
      !serializedConnectedPresence.includes(forbiddenField),
      `Live presence exposed forbidden field ${forbiddenField}.`,
    );
  }
  await hostManagerPage
    .getByText("Live provider readback", { exact: true })
    .waitFor({ timeout: 20_000 });
  await hostManagerPage
    .getByText(/Refreshes every 10 seconds only while this manager is open/i)
    .waitFor({ timeout: 20_000 });
  const guestInvitation = hostManagerPage
    .locator("article")
    .filter({ hasText: guest.email });
  await guestInvitation
    .getByRole("button", { name: "Remove Session access", exact: true })
    .waitFor({ timeout: 20_000 });
  await guestInvitation
    .getByRole("button", { name: "Remove Session access", exact: true })
    .click();
  const removalResponse = hostManagerPage.waitForResponse(
    (response) =>
      response
        .url()
        .includes(
          `/api/sessions/${ROOM_ID}/participants/${participant.id}/access`,
        ) && response.request().method() === "POST",
  );
  const removedPresenceResponse = hostManagerPage.waitForResponse(
    (response) =>
      response.url().includes(`/api/sessions/${ROOM_ID}/presence`) &&
      response.request().method() === "GET",
  );
  await guestInvitation
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  const removalPacket = await (await removalResponse).json();
  const removedPresencePacket = await (await removedPresenceResponse).json();
  assert(
    removalPacket?.ok === true,
    `Participant removal failed: ${removalPacket?.error || "unknown response"}`,
  );
  assert(
    removalPacket?.boundaries?.canonicalAccessRemoved === true,
    "Participant removal did not confirm the canonical authorization boundary.",
  );
  assert(
    removalPacket?.boundaries?.recordingChanged === false,
    "Participant removal unexpectedly changed recording state.",
  );
  assert(
    removalPacket?.provider?.status === "CONVERGED",
    `LiveKit removal did not converge: ${removalPacket?.provider?.status || "missing"}`,
  );
  assert(
    removedPresencePacket?.ok === true &&
      removedPresencePacket?.presence?.status === "LIVE" &&
      removedPresencePacket.presence.connectedDeviceCount === 1 &&
      removedPresencePacket.presence.connectedParticipantCount === 1 &&
      removedPresencePacket.presence.devices.every(
        (device) => device.participantId !== participant.id,
      ),
    "Provider presence did not read back the host-only room after guest removal.",
  );
  const guestDisconnectSignalObserved = await guestPage
    .getByText(
      "The live conversation ended. Joining never started a recording.",
      { exact: true },
    )
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  const guestJoinDenial = await guestPage.evaluate(
    async ({ callRoomId }) => {
      const response = await fetch("/api/mobile/capture/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId,
          clientInstanceId: "removed-browser-device",
          clientKind: "web",
        }),
      });
      return {
        status: response.status,
        packet: await response.json().catch(() => ({})),
      };
    },
    { callRoomId: ROOM_ID },
  );
  assert(
    guestJoinDenial.status === 404 && guestJoinDenial.packet?.canJoin !== true,
    "Removed guest was still able to mint a live-room token.",
  );

  const guestChatDenial = await guestPage.evaluate(
    async ({ projectSlug, callRoomId }) => {
      const url = new URL("/api/nest-chat", window.location.origin);
      url.searchParams.set("projectSlug", projectSlug);
      url.searchParams.set("threadKey", `session:${callRoomId}`);
      const response = await fetch(url);
      return {
        status: response.status,
        packet: await response.json().catch(() => ({})),
      };
    },
    { projectSlug: operationProject.slug, callRoomId: ROOM_ID },
  );
  assert(
    guestChatDenial.status === 404 && guestChatDenial.packet?.ok !== true,
    "Removed guest could still read the Session conversation thread.",
  );

  const removedSessionResponse = await guestPage.reload({
    waitUntil: "domcontentloaded",
  });
  assert(
    removedSessionResponse?.status() === 404,
    "Removed guest could still render the canonical Session workspace.",
  );

  const [removedParticipant, removalReceipts, providerGrantReceipts] =
    await Promise.all([
      prisma.callParticipant.findUnique({ where: { id: participant.id } }),
      prisma.callParticipantAccessReceipt.findMany({
        where: { participantId: participant.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.callParticipantProviderGrantReceipt.findMany({
        where: { participantId: participant.id },
        orderBy: { issuedAt: "asc" },
      }),
    ]);
  assert(
    removedParticipant?.accessStatus === "REMOVED",
    "Canonical participant access was not retained as removed.",
  );
  assert(
    removedParticipant?.providerAccessStatus === "CONVERGED",
    "Provider reconciliation state was not retained as converged.",
  );
  assert(
    removalReceipts.some((receipt) => receipt.action === "REMOVE"),
    "Append-only removal receipt is missing.",
  );
  assert(
    removalReceipts.some(
      (receipt) =>
        receipt.action === "PROVIDER_RECONCILE" &&
        receipt.providerStatus === "CONVERGED",
    ),
    "Append-only provider reconciliation receipt is missing.",
  );
  assert(
    providerGrantReceipts.length >= 1,
    "Provider grant issuance receipts are missing for the removed participant.",
  );

  await guestInvitation
    .getByRole("button", { name: "Restore Session access", exact: true })
    .waitFor({ timeout: 20_000 });
  const restoreResponse = hostManagerPage.waitForResponse(
    (response) =>
      response
        .url()
        .includes(
          `/api/sessions/${ROOM_ID}/participants/${participant.id}/access`,
        ) && response.request().method() === "POST",
  );
  await guestInvitation
    .getByRole("button", { name: "Restore Session access", exact: true })
    .click();
  const restorePacket = await (await restoreResponse).json();
  assert(
    restorePacket?.ok === true &&
      restorePacket?.boundaries?.canonicalAccessRestored === true,
    "Participant access was not restored through the host UI.",
  );
  assert(
    restorePacket?.boundaries?.providerJoined === false &&
      restorePacket?.boundaries?.recordingChanged === false,
    "Restoring access unexpectedly joined media or changed recording state.",
  );

  await guestPage.reload({ waitUntil: "domcontentloaded" });
  await guestPage
    .getByRole("heading", {
      name: "Retained email-bound Session invitation rehearsal",
      exact: true,
    })
    .waitFor({ timeout: 20_000 });
  await guestPage
    .getByRole("button", { name: "Join live room", exact: true })
    .waitFor({ timeout: 20_000 });
  assert(
    (await guestPage
      .getByRole("button", { name: "Leave", exact: true })
      .count()) === 0,
    "Restoring access automatically rejoined the provider room.",
  );
  const restoredParticipant = await prisma.callParticipant.findUnique({
    where: { id: participant.id },
  });
  const restoreReceipt = await prisma.callParticipantAccessReceipt.findFirst({
    where: { participantId: participant.id, action: "RESTORE" },
  });
  assert(
    restoredParticipant?.accessStatus === "ACTIVE" &&
      restoredParticipant.accessRevision === 2,
    "Restored participant state or revision is incorrect.",
  );
  assert(
    Boolean(restoreReceipt),
    "Append-only restoration receipt is missing.",
  );

  const collaborationReadback = await hostPage.evaluate(
    async ({ callRoomId }) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(callRoomId)}/invitations`,
        { cache: "no-store" },
      );
      return {
        status: response.status,
        packet: await response.json().catch(() => ({})),
      };
    },
    { callRoomId: ROOM_ID },
  );
  assert(
    collaborationReadback.status === 200 &&
      collaborationReadback.packet?.ok === true,
    "Host could not read the rendered Session collaboration activity boundary.",
  );
  const collaborationKinds = new Set(
    (collaborationReadback.packet?.collaboration?.activity || []).map(
      (item) => item.kind,
    ),
  );
  for (const expectedKind of [
    "INVITATION_CREATED",
    "INVITATION_ACCEPTED",
    "PARTICIPANT_REMOVED",
    "PROVIDER_RECONCILIATION",
    "PARTICIPANT_RESTORED",
  ]) {
    assert(
      collaborationKinds.has(expectedKind),
      `Collaboration activity omitted ${expectedKind}.`,
    );
  }
  const collaborationBoundary =
    collaborationReadback.packet?.collaboration?.boundaries;
  assert(
    collaborationBoundary?.appendOnlyAccessHistory === true &&
      collaborationBoundary?.joinKeyLeaseIsPresenceProof === false &&
      collaborationBoundary?.providerIdentitiesExposed === false &&
      collaborationBoundary?.credentialsExposed === false,
    "Collaboration activity safety boundaries are incomplete.",
  );
  assert(
    (collaborationReadback.packet?.collaboration?.joinKeyLeases || []).length >=
      1,
    "Host collaboration readback omitted recent short-lived device authority.",
  );
  const serializedCollaboration = JSON.stringify(
    collaborationReadback.packet?.collaboration || {},
  );
  for (const forbiddenField of [
    "providerIdentity",
    "tokenJti",
    "accessToken",
    "apiKey",
    "apiSecret",
  ]) {
    assert(
      !serializedCollaboration.includes(forbiddenField),
      `Collaboration readback exposed forbidden field ${forbiddenField}.`,
    );
  }
  await hostManagerPage
    .getByText("Access activity", { exact: true })
    .waitFor({ timeout: 20_000 });
  await hostManagerPage
    .getByText("Provider access reconciled", { exact: true })
    .waitFor({ timeout: 20_000 });
  await hostManagerPage
    .getByText(/not proof that the device is currently connected/i)
    .waitFor({ timeout: 20_000 });

  console.log(
    JSON.stringify(
      {
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
        authoritativeConnectedPresenceReadback: "two-devices",
        providerTrackStateReadback: "passed",
        sessionChatRoundTrip: "passed",
        connectedParticipantCanonicalRemoval: "passed",
        providerImmediateReadbackZero: true,
        authoritativeRemovedPresenceReadback: "host-only",
        guestDisconnectSignalObserved,
        selfHostedTokenRevocationClaimed: false,
        removedJoinTokenDenial: "passed",
        removedSessionChatDenial: "passed",
        providerReconciliationReadback: "passed",
        immutableAccessReceipts: "passed",
        participantRestoreWithoutAutoJoin: "passed",
        collaborationActivityProjection: "passed",
        safeJoinKeyLeaseReadback: "passed",
        joinKeyLeasePresenceClaimed: false,
        providerCredentialsExposed: false,
        externalInvitationSent: false,
        retainedSourceStarted: false,
        providerRecordingStarted: false,
        secretsPrinted: false,
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
  await browser.close();
  await prisma.callRoom
    .update({
      where: { id: ROOM_ID },
      data: { status: "ENDED", endedAt: new Date() },
    })
    .catch(() => undefined);
  await prisma.$disconnect();
}
