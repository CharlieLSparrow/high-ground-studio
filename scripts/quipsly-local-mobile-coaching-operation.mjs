#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { deleteApp, initializeApp } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");
const { chromium } = requireFromQuipsly("playwright");
const livekitBundle = requireFromQuipsly.resolve("livekit-client");

const COACH_EMAIL = "quipsly-mobile-coach@dev.test";
const CLIENT_EMAIL = "quipsly-mobile-client@dev.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackOrigin(value, label) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
  assert(url.protocol === "http:", `${label} must use loopback HTTP.`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    `${label} refuses non-loopback hosts.`,
  );
  assert(!url.username && !url.password, `${label} must not include URL credentials.`);
  return url.origin;
}

function loopbackLiveKitUrl(value) {
  const url = new URL(String(value || "").trim());
  assert(["ws:", "wss:"].includes(url.protocol), "LiveKit must use WebSocket transport.");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "This local operation refuses a non-loopback LiveKit server.",
  );
  assert(!url.username && !url.password, "LiveKit URL must not contain credentials.");
  return url.toString();
}

async function proveProviderRoom({ origin, coachJoin, clientJoin }) {
  assert(coachJoin.body?.canJoin === true, "Coach join was not authorized.");
  assert(clientJoin.body?.canJoin === true, "Client join was not authorized.");
  assert(
    typeof coachJoin.body?.participantToken === "string" && coachJoin.body.participantToken.length > 100,
    "Coach join did not return a participant token.",
  );
  assert(
    typeof clientJoin.body?.participantToken === "string" && clientJoin.body.participantToken.length > 100,
    "Client join did not return a participant token.",
  );
  const serverUrl = loopbackLiveKitUrl(coachJoin.body?.serverUrl);
  assert(
    loopbackLiveKitUrl(clientJoin.body?.serverUrl) === serverUrl,
    "Coach and client were routed to different LiveKit servers.",
  );
  assert(
    coachJoin.body?.roomName === clientJoin.body?.roomName,
    "Coach and client were routed to different provider rooms.",
  );

  const browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = [];
  const topic = `quipsly.coaching.operated.${randomUUID()}`;
  try {
    for (const context of contexts) {
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.addScriptTag({ path: livekitBundle });
      pages.push(page);
    }

    await Promise.all([
      pages[0].evaluate(async ({ url, token }) => {
        const room = new globalThis.LivekitClient.Room();
        await room.connect(url, token);
        globalThis.__quipslyOperatedRoom = room;
      }, { url: serverUrl, token: coachJoin.body.participantToken }),
      pages[1].evaluate(async ({ url, token, packetTopic }) => {
        const room = new globalThis.LivekitClient.Room();
        globalThis.__quipslyOperatedReceipt = new Promise((resolve) => {
          room.on(
            globalThis.LivekitClient.RoomEvent.DataReceived,
            (bytes, participant, _kind, receivedTopic) => {
              if (receivedTopic !== packetTopic) return;
              resolve({
                body: JSON.parse(new TextDecoder().decode(bytes)),
                participantIdentity: participant?.identity || null,
              });
            },
          );
        });
        await room.connect(url, token);
        globalThis.__quipslyOperatedRoom = room;
      }, { url: serverUrl, token: clientJoin.body.participantToken, packetTopic: topic }),
    ]);

    for (const page of pages) {
      await page.waitForFunction(
        () => globalThis.__quipslyOperatedRoom?.remoteParticipants?.size === 1,
        null,
        { timeout: 10_000 },
      );
    }

    const receipt = {
      schema: "quipsly-coaching-room-proof.v1",
      callRoomId: coachJoin.body.callRoomId,
      roomName: coachJoin.body.roomName,
      sentAt: new Date().toISOString(),
      nonce: randomUUID(),
    };
    await pages[0].evaluate(async ({ body, packetTopic }) => {
      await globalThis.__quipslyOperatedRoom.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(body)),
        { reliable: true, topic: packetTopic },
      );
    }, { body: receipt, packetTopic: topic });

    const received = await Promise.race([
      pages[1].evaluate(() => globalThis.__quipslyOperatedReceipt),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Timed out waiting for the coach-to-client room receipt.")),
        10_000,
      )),
    ]);
    assert(received?.body?.nonce === receipt.nonce, "Client received the wrong room receipt.");
    assert(
      received?.participantIdentity === coachJoin.body?.tokenBoundary?.safeClaims?.identity,
      "Client did not receive the receipt from the API-authorized coach identity.",
    );

    return {
      participantsConnected: 2,
      mutualPresence: true,
      reliableCoachToClientData: true,
      providerRoomMatches: true,
      participantIdentityMatchesGrant: true,
      serverUrlIsLoopback: true,
    };
  } finally {
    await Promise.all(pages.map((page) => page.evaluate(() => {
      globalThis.__quipslyOperatedRoom?.disconnect();
    }).catch(() => undefined)));
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
}

async function upsertAuthUser(auth, { email, name, password }) {
  const current = await auth.getUserByEmail(email).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  const fields = {
    email,
    displayName: name,
    emailVerified: true,
    disabled: false,
    password,
  };
  if (current) {
    await auth.updateUser(current.uid, fields);
    return current.uid;
  }
  const created = await auth.createUser({
    uid: `local-${email.split("@")[0]}`,
    ...fields,
  });
  return created.uid;
}

async function authenticate(authOrigin, email, password) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json().catch(() => null);
  assert(
    response.status === 200 && typeof body?.idToken === "string",
    `Local Firebase sign-in failed for ${email}.`,
  );
  return body.idToken;
}

async function api(origin, token, path, { method = "GET", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

async function main() {
  assert(
    process.env.QUIPSLY_LOCAL_MOBILE_COACHING_OPERATION === "1",
    "Set QUIPSLY_LOCAL_MOBILE_COACHING_OPERATION=1 before running this local mutation.",
  );
  const origin = loopbackOrigin(
    process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012",
    "Mobile coaching operation",
  );
  const authOrigin = loopbackOrigin(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
    "Firebase Auth emulator",
  );
  process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;

  const password = `Qp-${randomBytes(24).toString("base64url")}!26`;
  const firebaseApp = initializeApp(
    { projectId: "quipsly-reef" },
    `mobile-coaching-${randomUUID()}`,
  );
  const auth = getAuth(firebaseApp);

  try {
    await upsertAuthUser(auth, {
      email: COACH_EMAIL,
      name: "Quipsly Mobile Coach",
      password,
    });
    await upsertAuthUser(auth, {
      email: CLIENT_EMAIL,
      name: "Quipsly Mobile Client",
      password,
    });

    const [coachToken, clientToken] = await Promise.all([
      authenticate(authOrigin, COACH_EMAIL, password),
      authenticate(authOrigin, CLIENT_EMAIL, password),
    ]);

    const coachSetup = await api(origin, coachToken, "/api/coaching/runway", {
      method: "POST",
      body: {
        action: "setup-coach-profile",
        coachEmail: COACH_EMAIL,
        coachName: "Quipsly Mobile Coach",
        timezone: "America/Denver",
        defaultDurationMinutes: 60,
        offeringTitle: "One-to-one coaching session",
        offeringDescription: "Local operated proof of the Quipsly phone-only coaching workflow.",
        currency: "USD",
      },
    });
    assert(
      coachSetup.status === 200 && coachSetup.body?.ok === true,
      `Coach setup failed (${coachSetup.status}: ${String(coachSetup.body?.error || "unknown")}).`,
    );

    const scheduledStart = new Date(Date.now() + 2 * 60 * 60 * 1_000);
    const appointment = await api(origin, coachToken, "/api/coaching/runway", {
      method: "POST",
      body: {
        action: "create-booking-room",
        clientEmail: CLIENT_EMAIL,
        clientName: "Quipsly Mobile Client",
        title: `Operated iPhone coaching ${scheduledStart.toISOString()}`,
        scheduledStart: scheduledStart.toISOString(),
        durationMinutes: 60,
        purpose: "COACHING",
        paymentPolicy: "MANUAL",
        timezone: "America/Denver",
        currency: "USD",
      },
    });
    const result = appointment.body?.result;
    assert(
      appointment.status === 200 && appointment.body?.ok === true,
      `Appointment creation failed (${appointment.status}: ${String(appointment.body?.error || "unknown")}).`,
    );
    assert(typeof result?.bookingId === "string", "Appointment did not return its canonical booking ID.");
    assert(typeof result?.callRoomId === "string", "Appointment did not return its canonical room ID.");
    assert(typeof result?.engagementId === "string", "Appointment did not create durable client continuity.");
    assert(
      typeof result?.clientEntryPath === "string" && result.clientEntryPath.includes(result.callRoomId),
      "Appointment did not return the exact private client entry.",
    );

    const [coachSessions, clientSessions, coachRunway, clientRunway] = await Promise.all([
      api(origin, coachToken, "/api/mobile/capture/sessions"),
      api(origin, clientToken, "/api/mobile/capture/sessions"),
      api(origin, coachToken, "/api/coaching/runway"),
      api(origin, clientToken, "/api/coaching/runway"),
    ]);
    for (const [label, response] of Object.entries({
      coachSessions,
      clientSessions,
      coachRunway,
      clientRunway,
    })) {
      assert(
        response.status === 200 && response.body?.ok === true,
        `${label} readback failed (${response.status}).`,
      );
    }

    const coachSession = coachSessions.body.sessions?.find(
      (session) => session.callRoomId === result.callRoomId || session.id === result.callRoomId,
    );
    const clientSession = clientSessions.body.sessions?.find(
      (session) => session.callRoomId === result.callRoomId || session.id === result.callRoomId,
    );
    assert(coachSession, "The coach's iPhone projection omitted the new Session.");
    assert(clientSession, "The invited client's iPhone projection omitted the new Session.");
    assert(coachSession.provider === "livekit", "The coaching room silently downgraded to a planned/local-only provider.");
    assert(
      typeof coachSession.providerRoomId === "string" && coachSession.providerRoomId.startsWith("quipsly-"),
      "The coaching Session did not preserve its opaque LiveKit room identity.",
    );
    assert(
      coachRunway.body.upcomingBookings?.some((booking) => booking.id === result.bookingId),
      "The coach's phone runway omitted the new appointment.",
    );
    assert(
      clientRunway.body.upcomingBookings?.some((booking) => booking.id === result.bookingId),
      "The client's private runway omitted the invited appointment.",
    );

    const [coachJoin, clientJoin] = await Promise.all([
      api(origin, coachToken, "/api/mobile/capture/rooms/join", {
        method: "POST",
        body: {
          callRoomId: result.callRoomId,
          clientInstanceId: "operated-coach-iphone",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · operated coach iPhone",
        },
      }),
      api(origin, clientToken, "/api/mobile/capture/rooms/join", {
        method: "POST",
        body: {
          callRoomId: result.callRoomId,
          clientInstanceId: "operated-client-iphone",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · operated client iPhone",
        },
      }),
    ]);
    assert(coachJoin.status === 200 && coachJoin.body?.ok === true, "Coach join preparation failed.");
    assert(clientJoin.status === 200 && clientJoin.body?.ok === true, "Client join preparation failed.");
    assert(coachJoin.body?.provider === "livekit", "Coach join did not preserve the LiveKit provider.");
    assert(clientJoin.body?.provider === "livekit", "Client join did not preserve the LiveKit provider.");
    assert(coachJoin.body?.providerReadiness === "livekit-ready", "Coach provider was not ready.");
    assert(clientJoin.body?.providerReadiness === "livekit-ready", "Client provider was not ready.");

    const providerProof = await proveProviderRoom({ origin, coachJoin, clientJoin });

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      operatedThroughHTTP: true,
      testActors: [COACH_EMAIL, CLIENT_EMAIL],
      bookingId: result.bookingId,
      callRoomId: result.callRoomId,
      engagementId: result.engagementId,
      clientEntryPath: result.clientEntryPath,
      provider: coachSession.provider,
      providerReadiness: coachSession.providerReadiness,
      coachCanJoin: coachJoin.body?.canJoin === true,
      clientCanJoin: clientJoin.body?.canJoin === true,
      joinTokensReturned: Boolean(
        coachJoin.body?.participantToken && clientJoin.body?.participantToken
      ),
      providerProof,
      consentStarted: false,
      recordingStarted: false,
      calendarMutated: false,
      paymentMutated: false,
      externalInviteSent: false,
      databaseArtifactsRetainedForInspection: true,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await deleteApp(firebaseApp);
  }
}

await main();
