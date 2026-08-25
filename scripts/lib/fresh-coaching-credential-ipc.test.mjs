import assert from "node:assert/strict";
import test from "node:test";

import {
  createFreshCoachingCredentialIPCPacket,
  parseFreshCoachingCredentialIPCPacket,
} from "./fresh-coaching-credential-ipc.mjs";

const identities = {
  coach: {
    role: "coach",
    email: "fresh-coach@example.test",
    password: "safe-coach-password-26",
  },
  client: {
    role: "client",
    email: "fresh-client@example.test",
    password: "safe-client-password-26",
  },
};

test("round-trips fresh credentials through the private IPC contract", () => {
  const packet = createFreshCoachingCredentialIPCPacket(identities);
  assert.deepEqual(
    parseFreshCoachingCredentialIPCPacket(packet, identities),
    identities,
  );
});

test("rejects an IPC packet that does not match the rendered identities", () => {
  const packet = createFreshCoachingCredentialIPCPacket(identities);
  assert.throws(
    () =>
      parseFreshCoachingCredentialIPCPacket(packet, {
        ...identities,
        client: { ...identities.client, email: "other-client@example.test" },
      }),
    /does not match the rendered acceptance result/,
  );
});

test("rejects non-test identities and unsafe passwords", () => {
  assert.throws(
    () =>
      createFreshCoachingCredentialIPCPacket({
        ...identities,
        coach: { ...identities.coach, email: "coach@example.com" },
      }),
    /reserved \.test domain/,
  );
  assert.throws(
    () =>
      createFreshCoachingCredentialIPCPacket({
        ...identities,
        client: { ...identities.client, password: "short" },
      }),
    /password is invalid/,
  );
});
