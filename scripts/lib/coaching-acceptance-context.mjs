import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertIdentifier(value, label) {
  assert.match(
    text(value),
    /^[A-Za-z0-9_-]{8,240}$/,
    `${label} is missing or unsafe.`,
  );
  return text(value);
}

function assertTitle(value, label) {
  const normalized = text(value);
  assert(
    normalized.length >= 8 && normalized.length <= 240,
    `${label} is missing or unsafe.`,
  );
  assert(
    !/[\r\n\0]/.test(normalized),
    `${label} contains unsupported control characters.`,
  );
  return normalized;
}

function assertIdentity(value, role) {
  assert(
    value && typeof value === "object",
    `Fresh ${role} identity is missing.`,
  );
  assert.equal(value.role, role, `Fresh ${role} identity has the wrong role.`);
  assert.match(
    text(value.email),
    /^[^\s@]+@dev\.test$/,
    `Fresh ${role} must use a disposable .dev.test address.`,
  );
  assert(text(value.displayName), `Fresh ${role} display name is missing.`);
  return {
    role,
    uid: assertIdentifier(value.firebaseUid, `Fresh ${role} Firebase UID`),
    userId: assertIdentifier(value.userId, `Fresh ${role} user ID`),
    email: text(value.email).toLowerCase(),
    displayName: text(value.displayName),
  };
}

export async function loadFreshCoachingAcceptanceContext({
  baseURL,
  env = process.env,
} = {}) {
  const configuredPath = text(env.QUIPSLY_COACHING_ACCEPTANCE_CONTEXT);
  if (!configuredPath) return null;

  const contextPath = path.resolve(configuredPath);
  const file = await stat(contextPath);
  assert(
    file.isFile(),
    "Fresh coaching acceptance context must be a regular file.",
  );
  assert.equal(
    file.mode & 0o077,
    0,
    "Fresh coaching acceptance context must not be readable by group or others.",
  );

  const packet = JSON.parse(await readFile(contextPath, "utf8"));
  assert.equal(
    packet?.schema,
    "quipsly-fresh-coaching-acceptance-context-v1",
    "Fresh coaching acceptance context schema is unsupported.",
  );
  assert.equal(
    packet?.testLane,
    "fresh-ui-automation",
    "Fresh coaching acceptance context has the wrong test lane.",
  );
  assert.equal(
    packet?.humanAcceptanceSatisfied,
    false,
    "Automation context cannot claim human acceptance.",
  );
  assert.equal(
    packet?.baseURL,
    baseURL,
    "Fresh coaching acceptance context belongs to another local origin.",
  );
  assert.equal(
    packet?.boundaries?.passwordsWrittenToArtifact,
    false,
    "Fresh context must not contain passwords.",
  );
  assert.equal(
    packet?.boundaries?.passwordsStoredInMacOSKeychain,
    true,
    "Fresh context must use macOS Keychain credentials.",
  );
  assert(
    text(packet.keychainService),
    "Fresh context Keychain service is missing.",
  );

  const coach = assertIdentity(packet?.identities?.coach, "coach");
  const client = assertIdentity(packet?.identities?.client, "client");
  assert.notEqual(
    coach.email,
    client.email,
    "Fresh coach and client must be separate accounts.",
  );
  assert.notEqual(
    coach.userId,
    client.userId,
    "Fresh coach and client must be separate users.",
  );

  const roomId = assertIdentifier(packet.roomId, "Fresh room ID");
  const clientEntryPath = text(packet.clientEntryPath);
  const clientEntryURL = new URL(clientEntryPath, baseURL);
  assert.equal(
    clientEntryURL.origin,
    baseURL,
    "Fresh client entry belongs to another origin.",
  );
  assert.equal(
    clientEntryURL.pathname,
    `/sessions/${roomId}`,
    "Fresh client entry does not target its exact Session.",
  );

  return {
    contextPath,
    testLane: "fresh-ui-automation",
    fixtureIdentifiersUsed: false,
    humanAcceptanceSatisfied: false,
    sessionTitle: assertTitle(packet.sessionTitle, "Fresh Session title"),
    roomId,
    bookingId: assertIdentifier(packet.bookingId, "Fresh booking ID"),
    engagementId: assertIdentifier(packet.engagementId, "Fresh engagement ID"),
    keychainService: text(packet.keychainService),
    clientEntryPath: `${clientEntryURL.pathname}${clientEntryURL.search}`,
    identities: { coach, client },
  };
}
