#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_TIMEOUT_MS = 15_000;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const jsonOutput = args.get("json") === "1";
const baseUrl = normalizeBaseUrl(
  args.get("base-url") ||
    process.env.QUIPSLY_CAPTURE_REVIEWER_BASE_URL ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_BASE_URL ||
    process.env.QUIPSLY_MOBILE_CAPTURE_BASE_URL ||
    process.env.QUIPSLY_AUTH_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    DEFAULT_BASE_URL,
);
const email = clean(
  args.get("email") ||
    process.env.QUIPSLY_CAPTURE_REVIEWER_EMAIL ||
    process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL ||
    process.env.QUIPSLY_AUTH_SMOKE_EMAIL,
).toLowerCase();
const password =
  resolveSecret({
    direct:
      args.get("password") ||
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD ||
      process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD ||
      process.env.QUIPSLY_AUTH_SMOKE_PASSWORD ||
      "",
    file:
      args.get("password-file") ||
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_FILE ||
      process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_FILE ||
      process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_FILE ||
      "",
    keychainService:
      args.get("password-keychain-service") ||
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE ||
      process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_KEYCHAIN_SERVICE ||
      process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_KEYCHAIN_SERVICE ||
      "",
    keychainAccount:
      args.get("password-keychain-account") ||
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT ||
      process.env.QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD_KEYCHAIN_ACCOUNT ||
      process.env.QUIPSLY_AUTH_SMOKE_PASSWORD_KEYCHAIN_ACCOUNT ||
      email,
  });
const timeoutMs =
  Number.parseInt(
    args.get("timeout-ms") ||
      process.env.QUIPSLY_CAPTURE_REVIEWER_TIMEOUT_MS ||
      String(DEFAULT_TIMEOUT_MS),
    10,
  ) || DEFAULT_TIMEOUT_MS;
const createSession =
  args.get("create-session") === "1" ||
  process.env.QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION === "1";
const createSessionTitle =
  clean(args.get("session-title") || process.env.QUIPSLY_CAPTURE_REVIEWER_SESSION_TITLE) ||
  `Reviewer test capture session ${new Date().toISOString()}`;
const createSessionPurpose =
  clean(args.get("session-purpose") || process.env.QUIPSLY_CAPTURE_REVIEWER_SESSION_PURPOSE || "COACHING")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
const createSessionProvider =
  clean(args.get("session-provider") || process.env.QUIPSLY_CAPTURE_REVIEWER_SESSION_PROVIDER || "livekit").toLowerCase();
const grantConsent =
  truthy(args.get("grant-consent") || process.env.QUIPSLY_CAPTURE_REVIEWER_GRANT_CONSENT);
const inspectRoomJoin =
  truthy(args.get("inspect-room-join") || process.env.QUIPSLY_CAPTURE_REVIEWER_INSPECT_ROOM_JOIN);
const prepareRoomJoin =
  truthy(args.get("prepare-room-join") || process.env.QUIPSLY_CAPTURE_REVIEWER_PREPARE_ROOM_JOIN);

const checks = [];
const reviewerSetupRunbook = {
  purpose:
    "Prepare one reviewer-safe capture session that the native iOS app can display without charging, inviting, publishing, or recording.",
  login: {
    route: "/admin/users",
    card: "Capture reviewer setup",
    defaultEmail: "reviewer-capture@dev.test",
    action:
      "Create or repair the Firebase email/password login, app-owned Quipsly user, free tier, and Home Nest.",
  },
  session: {
    route: "/coaching",
    preset: "Reviewer preset",
    action: "Create booking and capture room",
    expectedDefaults: {
      title: "Reviewer test capture session",
      purpose: "COACHING",
      paymentPolicy: "MANUAL",
      durationMinutes: 30,
    },
  },
  boundaries: [
    "Stripe is not charged.",
    "No external calendar event is created.",
    "No invite is sent.",
    "No recording starts.",
    "Quipsly owns the booking, room, participant, requested consent, and receipt-slot evidence.",
  ],
  validation: [
    "node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs",
    "QUIPSLY_CAPTURE_REVIEWER_EMAIL=<reviewer email> QUIPSLY_CAPTURE_REVIEWER_PASSWORD=<password> node scripts/quipsly-capture-reviewer-session-smoke.mjs --base-url=https://nest.quipsly.com --json",
    "Confirm the iOS Session screen shows the same session and MobileCaptureReviewDigestPanel.",
  ],
};

function clean(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  return clean(value).replace(/\/+$/, "");
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function readSecretFile(filePath) {
  const normalized = clean(filePath);
  if (!normalized) return "";
  if (!existsSync(normalized)) {
    throw new Error(`Password file does not exist: ${normalized}`);
  }
  return clean(readFileSync(normalized, "utf8"));
}

function readKeychainSecret(service, account) {
  const normalizedService = clean(service);
  const normalizedAccount = clean(account);
  if (!normalizedService || !normalizedAccount) return "";
  const result = spawnSync("security", [
    "find-generic-password",
    "-s",
    normalizedService,
    "-a",
    normalizedAccount,
    "-w",
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Could not read password from macOS Keychain service ${normalizedService} for ${normalizedAccount}.`);
  }
  return clean(result.stdout);
}

function resolveSecret({ direct, file, keychainService, keychainAccount }) {
  const fromFile = readSecretFile(file);
  if (fromFile) return fromFile;
  const fromKeychain = readKeychainSecret(keychainService, keychainAccount);
  if (fromKeychain) return fromKeychain;
  return clean(direct);
}

function addCheck(name, status, summary, details = undefined) {
  checks.push({ name, status, summary, details });
}

function expect(condition, name, summary, details) {
  addCheck(name, condition ? "pass" : "fail", summary, details);
  return condition;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      raw,
      json: parseJson(raw),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      raw: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFirebaseConfig() {
  const result = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  const firebase = result.json?.firebase;

  expect(
    result.ok &&
      result.status === 200 &&
      result.json?.ok === true &&
      typeof firebase?.apiKey === "string" &&
      Boolean(firebase.apiKey),
    "firebaseClientConfigAvailable",
    "Nest exposes public Firebase client config for native email/password sign-in.",
    {
      status: result.status,
      ok: result.json?.ok === true,
      missing: result.json?.missing || null,
      contentType: result.contentType,
    },
  );

  if (!(result.ok && result.status === 200 && result.json?.ok === true && firebase?.apiKey)) {
    throw new Error("Firebase client config is unavailable from Nest.");
  }

  return firebase;
}

async function signInWithFirebase(apiKey) {
  const result = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  expect(
    result.ok &&
      result.status === 200 &&
      typeof result.json?.idToken === "string" &&
      typeof result.json?.refreshToken === "string",
    "firebasePasswordSignIn",
    "Firebase accepted reviewer/native email-password credentials.",
    { status: result.status, email, error: result.json?.error?.message || null },
  );

  if (!(result.ok && result.status === 200 && result.json?.idToken)) {
    throw new Error(`Firebase sign-in failed for ${email}.`);
  }

  return result.json;
}

async function verifyFirebaseAccount(apiKey, idToken) {
  const result = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: JSON.stringify({ idToken }),
    },
  );
  const account = Array.isArray(result.json?.users) ? result.json.users[0] : null;
  const actualEmail = clean(account?.email).toLowerCase();

  expect(
    result.ok && result.status === 200 && actualEmail === email,
    "firebaseAccountLookup",
    "Firebase returned the signed-in reviewer account.",
    {
      status: result.status,
      expectedEmail: email,
      actualEmail: actualEmail || null,
      error: result.json?.error?.message || null,
    },
  );
  expect(
    account?.emailVerified === true,
    "firebaseAccountVerified",
    "Firebase marks the reviewer mailbox verified, matching Capture's protected-session gate.",
    {
      email,
      emailVerified: account?.emailVerified === true,
      repair:
        "Use /admin/users Capture reviewer setup to repair the Firebase login before native or TestFlight testing.",
    },
  );

  if (!(result.ok && result.status === 200 && actualEmail === email && account?.emailVerified === true)) {
    throw new Error(`Firebase reviewer account is not verified and native-ready for ${email}.`);
  }
}

async function verifyNativeSession(idToken) {
  const result = await requestJson(`${baseUrl}/api/mac/session-check`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const actualEmail = clean(
    result.json?.user?.primaryEmail || result.json?.user?.email,
  ).toLowerCase();

  expect(
    result.ok && result.status === 200 && (result.json?.ok === true || result.json?.authenticated === true),
    "nativeSessionCheck",
    "Quipsly verifies the Firebase bearer token through the native session-check route.",
    { status: result.status, authenticated: result.json?.authenticated, error: result.json?.error || null },
  );
  expect(
    actualEmail === email,
    "nativeSessionEmailMatches",
    "Native session-check returns the same reviewer/test email.",
    { expectedEmail: email, actualEmail: actualEmail || null },
  );
  expect(
    Boolean(result.json?.homeNest?.slug || result.json?.onboarding?.homeNestSlug),
    "nativeSessionHomeNest",
    "Native session-check exposes Home Nest/free-account onboarding evidence.",
    { homeNestSlug: result.json?.homeNest?.slug || result.json?.onboarding?.homeNestSlug || null },
  );

  if (!(result.ok && result.status === 200 && (result.json?.ok === true || result.json?.authenticated === true))) {
    throw new Error("Quipsly native session-check rejected the Firebase bearer token.");
  }

  return result.json;
}

async function fetchReviewerSessions(idToken) {
  const result = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  expect(
    result.ok && result.status === 200 && result.json?.ok === true && Array.isArray(result.json?.sessions),
    "reviewerSessionsEndpointReachable",
    "Authenticated mobile capture sessions route returns JSON for this native user.",
    {
      status: result.status,
      contentType: result.contentType,
      ok: result.json?.ok === true,
      error: result.json?.error || null,
    },
  );

  if (!(result.ok && result.status === 200 && result.json?.ok === true && Array.isArray(result.json?.sessions))) {
    throw new Error("Authenticated mobile capture sessions route is not returning usable session JSON.");
  }

  return result.json;
}

async function createReviewerSession(idToken) {
  const result = await requestJson(`${baseUrl}/api/mobile/capture/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      title: createSessionTitle,
      purpose: createSessionPurpose,
      provider: createSessionProvider,
      deviceLabel: "Quipsly reviewer/native smoke",
    }),
  });
  const session = isObject(result.json?.session) ? result.json.session : null;
  const boundaries = isObject(result.json?.boundaries) ? result.json.boundaries : {};
  const externalSideEffectsStayedOff =
    boundaries.recordingStarted === false &&
    boundaries.providerJoined === false &&
    boundaries.providerTokenMinted === false &&
    boundaries.calendarMutated === false &&
    boundaries.stripeMutated === false &&
    boundaries.externalInviteSent === false;

  expect(
    result.ok &&
      result.status === 201 &&
      result.json?.ok === true &&
      result.json?.created === true &&
      Boolean(session?.callRoomId || session?.id),
    "reviewerCreateSessionPost",
    "Opt-in reviewer smoke can create a safe app-owned Quipsly capture session.",
    {
      status: result.status,
      title: createSessionTitle,
      purpose: createSessionPurpose,
      provider: createSessionProvider,
      error: result.json?.error || null,
    },
  );
  expect(
    boundaries.appOwnedRoomCreated === true &&
      Boolean(boundaries.participantCreated) &&
      boundaries.consentRequested === true,
    "reviewerCreateSessionTruthRecords",
    "Created reviewer session includes room, participant, and requested consent truth records.",
    boundaries,
  );
  expect(
    externalSideEffectsStayedOff,
    "reviewerCreateSessionNoExternalSideEffects",
    "Created reviewer session does not start recording, join provider media, mint provider tokens, mutate calendar, mutate Stripe, or send invites.",
    boundaries,
  );
  expect(
    Boolean(session?.recordingConsentStatus && session.recordingConsentStatus !== "not-created"),
    "reviewerCreateSessionConsentVisible",
    "Created reviewer session immediately exposes explicit recording consent state to the native app.",
    summarizeSession(session),
  );

  if (!(result.ok && result.status === 201 && result.json?.ok === true && session)) {
    throw new Error(`Opt-in reviewer session creation failed for ${email}.`);
  }

  return session;
}

function summarizeSession(session) {
  if (!isObject(session)) return null;

  const lifecycle = isObject(session.lifecycle) ? session.lifecycle : null;
  const captureReadiness = isObject(session.captureReadiness)
    ? session.captureReadiness
    : null;
  const journeySummary = isObject(session.journeySummary)
    ? session.journeySummary
    : null;

  return {
    id: session.id || null,
    callRoomId: session.callRoomId || session.id || null,
    title: session.title || null,
    purpose: session.purpose || null,
    status: session.status || null,
    scheduledStart: session.scheduledStart || null,
    scheduledEnd: session.scheduledEnd || null,
    participantId: session.participantId || null,
    recordingConsentId: session.recordingConsentId || null,
    recordingConsentStatus: session.recordingConsentStatus || null,
    canRecordNow: session.canRecordNow === true,
    providerReadiness: session.providerReadiness || null,
    providerCanJoin: session.providerCanJoin === true,
    bookingStatus: session.bookingStatus || null,
    paymentPolicy: session.paymentPolicy || null,
    paymentStatus: session.paymentStatus || null,
    calendarStatus: session.calendarStatus || null,
    recordingCount: Number.isFinite(session.recordingCount) ? session.recordingCount : null,
    latestTranscriptStatus: session.latestTranscriptStatus || null,
    coachingPacketStatus: session.coachingPacketStatus || null,
    lifecycleKind: lifecycle?.kind || null,
    lifecycleStage: lifecycle?.stage || null,
    lifecycleNextAction: lifecycle?.nextAction || null,
    journeyStage: journeySummary?.stage || null,
    journeyNextAction: journeySummary?.nextAction || null,
    captureReadinessStatus: captureReadiness?.status || null,
    captureReadinessLabel: captureReadiness?.label || null,
    captureReadinessNextAction: captureReadiness?.nextAction || null,
    nextAction: session.nextAction || null,
  };
}

function roomIdForSession(session) {
  return clean(session?.callRoomId || session?.id);
}

function summarizeConsentUpdate(payload) {
  const session = isObject(payload?.session) ? payload.session : {};
  const effects = isObject(payload?.effects) ? payload.effects : {};

  return {
    ok: payload?.ok === true,
    callRoomId: session.callRoomId || session.id || null,
    participantId: session.participantId || null,
    recordingConsentId: session.recordingConsentId || null,
    recordingConsentStatus: session.recordingConsentStatus || null,
    recordingConsentGranted: session.recordingConsentGranted === true,
    effects,
    nextAction: session.nextAction || null,
  };
}

function summarizeJoinDiagnostic(payload) {
  const effects = isObject(payload?.effects) ? payload.effects : {};
  const recordingBoundary = isObject(payload?.recordingBoundary) ? payload.recordingBoundary : {};
  const paymentBoundary = isObject(payload?.paymentBoundary) ? payload.paymentBoundary : {};

  return {
    ok: payload?.ok === true,
    diagnosticOnly: payload?.diagnosticOnly === true,
    callRoomId: payload?.callRoomId || null,
    provider: payload?.provider || null,
    providerReadiness: payload?.providerReadiness || null,
    canJoin: payload?.canJoin === true,
    canMintJoinToken: payload?.canMintJoinToken === true,
    tokenReturned: payload?.tokenReturned === true,
    serverUrlReturned: payload?.serverUrlReturned === true,
    effects,
    recordingBoundary,
    paymentBoundary,
    localFallback: isObject(payload?.localFallback) ? payload.localFallback : null,
    nextAction: payload?.nextAction || null,
  };
}

function summarizeJoinResponse(payload) {
  const effects = isObject(payload?.effects) ? payload.effects : {};
  const recordingBoundary = isObject(payload?.recordingBoundary) ? payload.recordingBoundary : {};
  const token = typeof payload?.participantToken === "string" ? payload.participantToken : "";

  return {
    ok: payload?.ok === true,
    callRoomId: payload?.callRoomId || null,
    participantId: payload?.participantId || null,
    provider: payload?.provider || null,
    providerReadiness: payload?.providerReadiness || null,
    canJoin: payload?.canJoin === true,
    roomName: payload?.roomName || null,
    serverUrlReturned: typeof payload?.serverUrl === "string" && payload.serverUrl.length > 0,
    participantTokenReturned: token.length > 0,
    participantTokenRedacted: token.length > 0 ? `[redacted:${token.length} chars]` : null,
    tokenExpiresAt: payload?.tokenExpiresAt || null,
    tokenExpiresInSeconds: Number.isFinite(payload?.tokenExpiresInSeconds) ? payload.tokenExpiresInSeconds : null,
    tokenSafeClaims: isObject(payload?.tokenSafeClaims) ? payload.tokenSafeClaims : null,
    recordingConsentId: payload?.recordingConsentId || null,
    recordingConsentStatus: payload?.recordingConsentStatus || null,
    recordingConsentGranted: payload?.recordingConsentGranted === true,
    effects,
    recordingBoundary,
    nextAction: payload?.nextAction || null,
  };
}

async function grantReviewerRecordingConsent(idToken, session) {
  const callRoomId = roomIdForSession(session);
  const participantId = clean(session?.participantId);

  const result = await requestJson(`${baseUrl}/api/mobile/capture/consent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      callRoomId,
      ...(participantId ? { participantId } : {}),
      consentAction: "GRANT",
    }),
  });
  const summary = summarizeConsentUpdate(result.json);
  const effects = summary.effects || {};

  expect(
    result.ok &&
      result.status === 200 &&
      result.json?.ok === true &&
      summary.recordingConsentGranted === true &&
      summary.recordingConsentStatus === "GRANTED",
    "reviewerConsentGrant",
    "Opt-in reviewer proof can grant explicit app-owned recording consent.",
    {
      status: result.status,
      callRoomId,
      recordingConsentStatus: summary.recordingConsentStatus,
      recordingConsentGranted: summary.recordingConsentGranted,
      error: result.json?.error || null,
    },
  );
  expect(
    effects.appOwnedConsentMutated === true &&
      effects.externalMutated === false &&
      effects.recordingStarted === false &&
      effects.providerJoined === false &&
      effects.providerRecordingStarted === false &&
      effects.providerTokenMinted === false &&
      effects.providerTokenReturned === false &&
      effects.stripeMutated === false &&
      effects.calendarMutated === false &&
      effects.externalInviteSent === false &&
      effects.secretExposed === false,
    "reviewerConsentGrantNoExternalSideEffects",
    "Granting consent mutates only Quipsly-owned consent truth and starts no recording or provider join.",
    effects,
  );

  if (!(result.ok && result.status === 200 && result.json?.ok === true && summary.recordingConsentGranted)) {
    throw new Error(`Opt-in reviewer consent grant failed for call room ${callRoomId}.`);
  }

  return summary;
}

async function inspectReviewerRoomJoin(idToken, session, checkPrefix) {
  const callRoomId = roomIdForSession(session);
  const url = new URL(`${baseUrl}/api/mobile/capture/rooms/join/diagnostics`);
  url.searchParams.set("callRoomId", callRoomId);
  const result = await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const summary = summarizeJoinDiagnostic(result.json);
  const effects = summary.effects || {};

  expect(
    result.ok &&
      result.status === 200 &&
      result.json?.ok === true &&
      summary.diagnosticOnly === true,
    `${checkPrefix}RoomJoinDiagnostic`,
    "Reviewer can inspect room join readiness without side effects.",
    {
      status: result.status,
      callRoomId,
      providerReadiness: summary.providerReadiness,
      canJoin: summary.canJoin,
      canMintJoinToken: summary.canMintJoinToken,
      error: result.json?.error || null,
    },
  );
  expect(
    effects.sideEffectFree === true &&
      effects.externalMutated === false &&
      effects.participantCreated === false &&
      effects.providerJoined === false &&
      effects.recordingStarted === false &&
      effects.tokenMinted === false &&
      effects.tokenReturned === false &&
      effects.stripeMutated === false &&
      effects.calendarMutated === false &&
      effects.mediaMutated === false,
    `${checkPrefix}RoomJoinDiagnosticNoSideEffects`,
    "Room join diagnostics do not create participants, mint tokens, join provider rooms, record, or mutate external systems.",
    effects,
  );

  if (!(result.ok && result.status === 200 && result.json?.ok === true && summary.diagnosticOnly)) {
    throw new Error(`Room join diagnostics failed for call room ${callRoomId}.`);
  }

  return summary;
}

async function prepareReviewerRoomJoin(idToken, session) {
  const callRoomId = roomIdForSession(session);
  const result = await requestJson(`${baseUrl}/api/mobile/capture/rooms/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ callRoomId }),
  });
  const summary = summarizeJoinResponse(result.json);
  const effects = summary.effects || {};

  expect(
    result.ok &&
      result.status === 200 &&
      result.json?.ok === true &&
      summary.canJoin === true &&
      summary.providerReadiness === "livekit-ready" &&
      summary.participantTokenReturned === true,
    "reviewerRoomJoinPrepared",
    "Opt-in reviewer proof can prepare a short-lived LiveKit room join token.",
    {
      status: result.status,
      callRoomId,
      providerReadiness: summary.providerReadiness,
      canJoin: summary.canJoin,
      participantTokenReturned: summary.participantTokenReturned,
      participantTokenRedacted: summary.participantTokenRedacted,
      tokenExpiresInSeconds: summary.tokenExpiresInSeconds,
      error: result.json?.error || null,
    },
  );
  expect(
    effects.providerJoined === false &&
      effects.recordingStarted === false &&
      effects.providerRecordingStarted === false &&
      effects.tokenMinted === true &&
      effects.tokenReturned === true &&
      effects.stripeMutated === false &&
      effects.calendarMutated === false &&
      effects.mediaMutated === false &&
      effects.secretExposed === false,
    "reviewerRoomJoinPreparedNoRecordingOrExternalMutation",
    "Preparing a join token does not join media, record, or mutate Stripe/Calendar/media.",
    {
      ...effects,
      participantTokenRedacted: summary.participantTokenRedacted,
    },
  );

  if (!(result.ok && result.status === 200 && result.json?.ok === true && summary.participantTokenReturned)) {
    throw new Error(`Room join preparation failed for call room ${callRoomId}.`);
  }

  return summary;
}

function chooseCandidate(sessions) {
  return (
    sessions.find((session) => session?.status === "OPEN" || session?.status === "PLANNED") ||
    sessions.find((session) => session?.callRoomId || session?.id) ||
    null
  );
}

async function main() {
  expect(Boolean(email), "reviewerEmailConfigured", "Reviewer/test auth email is configured.", {
    env: "QUIPSLY_CAPTURE_REVIEWER_EMAIL, QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL, or QUIPSLY_AUTH_SMOKE_EMAIL",
  });
  expect(Boolean(password), "reviewerPasswordConfigured", "Reviewer/test auth password is configured without printing it.", {
    configured: Boolean(password),
  });

  let sessionJson = null;
  let candidate = null;
  let candidateSummary = null;
  let createdSession = null;
  let createdSessionSummary = null;
  let createdSessionReadbackSummary = null;
  let consentRoomProof = null;

  if (email && password) {
    const firebase = await fetchFirebaseConfig();
    const signIn = await signInWithFirebase(firebase.apiKey);
    await verifyFirebaseAccount(firebase.apiKey, signIn.idToken);
    await verifyNativeSession(signIn.idToken);
    if (createSession) {
      createdSession = await createReviewerSession(signIn.idToken);
      createdSessionSummary = summarizeSession(createdSession);
    }
    sessionJson = await fetchReviewerSessions(signIn.idToken);

    const sessions = Array.isArray(sessionJson.sessions) ? sessionJson.sessions : [];
    candidate = chooseCandidate(sessions);
    candidateSummary = summarizeSession(candidate);
    if (createdSessionSummary?.callRoomId) {
      const createdRoomId = createdSessionSummary.callRoomId;
      const createdReadback = sessions.find((session) => {
        const summary = summarizeSession(session);
        return summary?.callRoomId === createdRoomId || summary?.id === createdSessionSummary?.id;
      });
      createdSessionReadbackSummary = summarizeSession(createdReadback);

      expect(
        Boolean(createdSessionReadbackSummary?.callRoomId),
        "reviewerCreatedSessionReadback",
        "The opt-in created capture session appears when the native app reloads sessions.",
        {
          created: createdSessionSummary,
          readback: createdSessionReadbackSummary,
          sessionCount: sessions.length,
        },
      );
    }

    expect(
      sessions.length > 0,
      "reviewerHasVisibleCaptureSession",
      "Reviewer/test account has at least one visible coaching, podcast, or interview capture session.",
      {
        sessionCount: sessions.length,
        nextAction:
          "Use /admin/users Capture reviewer setup for the login, then /coaching Reviewer preset with Create booking and capture room.",
        setupRunbook: reviewerSetupRunbook,
      },
    );
    expect(
      Boolean(candidateSummary?.callRoomId && candidateSummary?.participantId),
      "reviewerSessionHasParticipantBoundary",
      "Visible reviewer session is linked to an app-owned call room and participant.",
      candidateSummary,
    );
    expect(
      Boolean(candidateSummary?.recordingConsentStatus && candidateSummary.recordingConsentStatus !== "not-created"),
      "reviewerSessionHasConsentBoundary",
      "Visible reviewer session exposes explicit recording consent state.",
      candidateSummary,
    );
    expect(
      Boolean(
        candidateSummary?.captureReadinessStatus ||
          candidateSummary?.lifecycleStage ||
          candidateSummary?.journeyStage,
      ),
      "reviewerSessionHasLifecycleTruth",
      "Visible reviewer session exposes capture readiness, lifecycle, or journey state.",
      candidateSummary,
    );
    expect(
      typeof candidate?.canRecordNow === "boolean" &&
        Boolean(candidateSummary?.nextAction || candidateSummary?.captureReadinessNextAction || candidateSummary?.lifecycleNextAction),
      "reviewerSessionHasSafeRecordingBoundary",
      "Visible reviewer session gives the app a boolean recordability boundary and next safe action.",
      candidateSummary,
    );

    if (grantConsent || inspectRoomJoin || prepareRoomJoin) {
      let proofTarget = createdSession || candidate;
      if (!proofTarget) {
        throw new Error("Consent/room proof requested but no reviewer capture session is available.");
      }

      const beforeDiagnostic = inspectRoomJoin
        ? await inspectReviewerRoomJoin(signIn.idToken, proofTarget, "beforeConsent")
        : null;
      const consentUpdate = grantConsent
        ? await grantReviewerRecordingConsent(signIn.idToken, proofTarget)
        : null;
      if (consentUpdate) {
        proofTarget = {
          ...proofTarget,
          id: consentUpdate.callRoomId || proofTarget.id,
          callRoomId: consentUpdate.callRoomId || proofTarget.callRoomId,
          participantId: consentUpdate.participantId || proofTarget.participantId,
          recordingConsentId: consentUpdate.recordingConsentId || proofTarget.recordingConsentId,
          recordingConsentStatus: consentUpdate.recordingConsentStatus || proofTarget.recordingConsentStatus,
          recordingConsentGranted: consentUpdate.recordingConsentGranted,
        };
      }
      const afterDiagnostic = inspectRoomJoin
        ? await inspectReviewerRoomJoin(signIn.idToken, proofTarget, "afterConsent")
        : null;
      const joinPrepared = prepareRoomJoin
        ? await prepareReviewerRoomJoin(signIn.idToken, proofTarget)
        : null;

      consentRoomProof = {
        requested: {
          grantConsent,
          inspectRoomJoin,
          prepareRoomJoin,
        },
        callRoomId: roomIdForSession(proofTarget),
        consentUpdate,
        beforeDiagnostic,
        afterDiagnostic,
        joinPrepared,
        passwordPrinted: false,
        providerSecretsExposed: false,
      };
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  const sessions = Array.isArray(sessionJson?.sessions) ? sessionJson.sessions : [];
  const report = {
    ok: failed.length === 0,
    baseUrl,
    email,
    createSession,
    sessionCount: sessions.length,
    reviewerReady: failed.length === 0 && sessions.length > 0,
    createdSession: createdSessionSummary,
    createdSessionReadback: createdSessionReadbackSummary,
    candidateSession: candidateSummary,
    consentRoomProof,
    setupRunbook: reviewerSetupRunbook,
    nextAction:
      failed.length === 0 && sessions.length > 0
        ? "Open the iOS capture app with this reviewer/test login and confirm the same session appears before TestFlight/App Review handoff."
        : "Create or repair the reviewer account in /admin/users, then create a reviewer-safe booking and capture room from /coaching before claiming capture is App Store-reviewable.",
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quipsly capture reviewer session smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Email: ${email || "not configured"}`);
    console.log(`Visible sessions: ${report.sessionCount}`);
    if (!report.reviewerReady) {
      console.log("Reviewer setup path:");
      console.log(`  1. ${reviewerSetupRunbook.login.route} -> ${reviewerSetupRunbook.login.card}`);
      console.log(`  2. ${reviewerSetupRunbook.session.route} -> ${reviewerSetupRunbook.session.preset}`);
      console.log(`  3. ${reviewerSetupRunbook.session.action}`);
    }
    if (report.candidateSession) {
      console.log(`Candidate: ${report.candidateSession.title || report.candidateSession.callRoomId}`);
      console.log(
        `Next action: ${
          report.candidateSession.nextAction ||
          report.candidateSession.captureReadinessNextAction ||
          report.candidateSession.lifecycleNextAction ||
          "not provided"
        }`,
      );
    }
    for (const check of checks) {
      console.log(`${check.status === "pass" ? "PASS" : "FAIL"} ${check.name}: ${check.summary}`);
      if (check.status !== "pass" && check.details) {
        console.log(`  ${JSON.stringify(check.details)}`);
      }
    }
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
