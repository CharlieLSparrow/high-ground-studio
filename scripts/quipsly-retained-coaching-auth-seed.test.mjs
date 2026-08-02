import assert from "node:assert/strict";
import test from "node:test";

import {
  requireLoopbackAuthEmulator,
  RETAINED_COACHING_AUTH_IDENTITIES,
} from "./quipsly-retained-coaching-auth-seed.mjs";

test("retained coaching auth seed refuses non-loopback emulators", () => {
  assert.equal(requireLoopbackAuthEmulator("127.0.0.1:9099"), "127.0.0.1:9099");
  assert.equal(requireLoopbackAuthEmulator("localhost:9099"), "localhost:9099");
  assert.throws(
    () => requireLoopbackAuthEmulator("identitytoolkit.googleapis.com"),
    /loopback/,
  );
  assert.throws(() => requireLoopbackAuthEmulator("127.0.0.1"), /loopback/);
});

test("retained coaching auth seed has a distinct ungranted privacy identity", () => {
  const collaborator = RETAINED_COACHING_AUTH_IDENTITIES.find(
    (identity) => identity.role === "outsider",
  );
  const privacyOutsider = RETAINED_COACHING_AUTH_IDENTITIES.find(
    (identity) => identity.role === "privacy-outsider",
  );

  assert.equal(collaborator?.name, "Quipsly Retained Room Producer");
  assert.deepEqual(privacyOutsider, {
    role: "privacy-outsider",
    uid: "quipsly-privacy-outsider-retained-20260802",
    email: "quipsly-privacy-outsider-retained-20260802@example.test",
    name: "Quipsly Retained Privacy Outsider",
  });
  assert.notEqual(privacyOutsider?.email, collaborator?.email);
});
