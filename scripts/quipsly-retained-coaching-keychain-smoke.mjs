#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const IDENTITIES = [
  {
    role: "coach",
    email: "quipsly-coach-retained-20260731@example.test",
    expectedFollowUpRole: "COACH",
    expectedStatus: 200,
  },
  {
    role: "client",
    email: "quipsly-client-retained-20260731@example.test",
    expectedFollowUpRole: "CLIENT",
    expectedStatus: 200,
  },
  {
    role: "outsider",
    email: "quipsly-followup-outsider-retained-20260731@example.test",
    expectedFollowUpRole: null,
    expectedStatus: 404,
  },
];
const EXPECTED_ELIGIBLE_IDS = {
  note: "retained-follow-up-client-safe-note-20260731",
  task: "retained-follow-up-client-task-20260731",
  goal: "retained-follow-up-client-goal-20260731",
};
const FORBIDDEN_MARKERS = [
  "retained-follow-up-private-note-20260731",
  "retained-follow-up-shared-note-20260731",
  "retained-follow-up-candidate-task-20260731",
  "RETAINED PRIVATE MARKER",
  "RETAINED SHARED MARKER",
  "RETAINED UNREVIEWED MARKER",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

function sessionCookie(setCookie) {
  return String(setCookie || "").split(";")[0].trim();
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    response,
    status: response.status,
    body,
    cacheControl: response.headers.get("cache-control") || "",
  };
}

function assertNoForbiddenMarkers(value, surface) {
  const serialized = JSON.stringify(value);
  for (const marker of FORBIDDEN_MARKERS) {
    assert(!serialized.includes(marker), `${surface} disclosed forbidden marker ${marker}.`);
  }
}

async function signIn(authOrigin, identity, password) {
  const result = await jsonRequest(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: identity.email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  assert(
    result.status === 200 && typeof result.body?.idToken === "string",
    `${identity.role} could not sign in to the local Firebase emulator.`,
  );
  return result.body.idToken;
}

async function exchangeNestSession(baseURL, identity, idToken) {
  const result = await jsonRequest(`${baseURL}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = sessionCookie(result.response.headers.get("set-cookie"));
  assert(
    result.status === 200
      && result.body?.success === true
      && String(result.body?.user?.email || "").toLowerCase() === identity.email
      && cookie.includes("="),
    `${identity.role} Firebase identity did not bind to the expected local Nest session.`,
  );
  return cookie;
}

function assertCoachFollowUp(body) {
  assert(body?.ok === true && body?.role === "COACH", "Coach follow-up role was not preserved.");
  const noteIDs = (body.eligible?.notes || []).map((item) => item.id);
  const taskIDs = (body.eligible?.tasks || []).map((item) => item.id);
  const goalIDs = (body.eligible?.goals || []).map((item) => item.id);
  assert(noteIDs.includes(EXPECTED_ELIGIBLE_IDS.note), "Coach lost the client-safe follow-up note.");
  assert(taskIDs.includes(EXPECTED_ELIGIBLE_IDS.task), "Coach lost the reviewed client task.");
  assert(goalIDs.includes(EXPECTED_ELIGIBLE_IDS.goal), "Coach lost the client-owned goal.");
  assert(body.boundaries?.draftsVisibleToClient === false, "Draft visibility boundary changed.");
  assert(body.boundaries?.privateNotesEligible === false, "Private-note eligibility boundary changed.");
  assert(body.boundaries?.unreviewedCandidatesEligible === false, "Unreviewed-candidate boundary changed.");
}

function assertClientFollowUp(body) {
  assert(body?.ok === true && body?.role === "CLIENT", "Client follow-up role was not preserved.");
  assert(body.eligible === null, "Client received the coach-only eligibility workspace.");
  assert(body.output?.status === "RELEASED", "Client did not receive the released follow-up snapshot.");
  assert(body.output?.recipient?.label, "Released follow-up lost its immutable recipient projection.");
  assert(body.boundaries?.draftsVisibleToClient === false, "Client draft-visibility boundary changed.");
}

async function verifyIdentity({ baseURL, authOrigin, identity }) {
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: identity.email,
  });
  assert(password, `${identity.role} has no retained Keychain password.`);
  const idToken = await signIn(authOrigin, identity, password);
  const cookie = await exchangeNestSession(baseURL, identity, idToken);
  const result = await jsonRequest(
    `${baseURL}/api/sessions/${encodeURIComponent(ROOM_ID)}/client-follow-up`,
    {
      headers: {
        authorization: `Bearer ${idToken}`,
        cookie,
      },
      redirect: "manual",
    },
  );
  assert(result.status === identity.expectedStatus, `${identity.role} follow-up status changed.`);
  assert(
    result.cacheControl.toLowerCase().includes("private")
      && result.cacheControl.toLowerCase().includes("no-store"),
    `${identity.role} follow-up response is not private and non-cacheable.`,
  );
  assertNoForbiddenMarkers(result.body, `${identity.role} follow-up`);

  if (identity.role === "coach") assertCoachFollowUp(result.body);
  if (identity.role === "client") assertClientFollowUp(result.body);
  if (identity.role === "outsider") {
    assert(
      result.body?.ok === false && result.body?.code === "FOLLOW_UP_UNAVAILABLE",
      "Outsider denial stopped concealing relationship-protected follow-up existence.",
    );
  }

  const logout = await jsonRequest(`${baseURL}/api/auth/session`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert(
    logout.status === 200 && logout.body?.success === true,
    `${identity.role} local Nest session did not clear cleanly.`,
  );

  return {
    role: identity.role,
    firebaseSignIn: "passed",
    nestSessionExchange: "passed",
    nestSessionClear: "passed",
    followUpStatus: result.status,
    followUpRole: identity.expectedFollowUpRole,
    outsiderExistenceConcealed: identity.role === "outsider" ? true : null,
  };
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const authOrigin = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );

  const identities = [];
  for (const identity of IDENTITIES) {
    identities.push(await verifyIdentity({ baseURL, authOrigin, identity }));
  }

  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    retained: true,
    credentialStore: "macOS Keychain",
    secretsPrinted: false,
    externalSideEffects: false,
    identities,
  }, null, 2));
}

await main();
