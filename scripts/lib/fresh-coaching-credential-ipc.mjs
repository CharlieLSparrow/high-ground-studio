import assert from "node:assert/strict";

export const FRESH_COACHING_CREDENTIAL_IPC_SCHEMA =
  "quipsly-fresh-coaching-credential-ipc-v1";

const TEST_EMAIL = /^[^\s@]+@[^\s@]+\.test$/i;

function validateIdentity(identity, role) {
  assert.equal(identity?.role, role, `Fresh ${role} credential role is invalid.`);
  assert.match(
    String(identity?.email || ""),
    TEST_EMAIL,
    `Fresh ${role} credential email must use the reserved .test domain.`,
  );
  const password = String(identity?.password || "");
  assert(
    password.length >= 16 && !/[\r\n\0]/.test(password),
    `Fresh ${role} credential password is invalid.`,
  );
  return {
    role,
    email: identity.email,
    password,
  };
}

export function createFreshCoachingCredentialIPCPacket(identities) {
  return {
    schema: FRESH_COACHING_CREDENTIAL_IPC_SCHEMA,
    coach: validateIdentity(identities?.coach, "coach"),
    client: validateIdentity(identities?.client, "client"),
  };
}

export function parseFreshCoachingCredentialIPCPacket(
  packet,
  expectedIdentities,
) {
  assert.equal(
    packet?.schema,
    FRESH_COACHING_CREDENTIAL_IPC_SCHEMA,
    "Fresh coaching child did not provide the expected private credential packet.",
  );
  const credentials = {
    coach: validateIdentity(packet.coach, "coach"),
    client: validateIdentity(packet.client, "client"),
  };
  assert.equal(
    credentials.coach.email,
    expectedIdentities?.coach?.email,
    "Fresh coach IPC identity does not match the rendered acceptance result.",
  );
  assert.equal(
    credentials.client.email,
    expectedIdentities?.client?.email,
    "Fresh client IPC identity does not match the rendered acceptance result.",
  );
  return credentials;
}
