import assert from "node:assert/strict";
import test from "node:test";

import { requireLoopbackAuthEmulator } from "./quipsly-retained-coaching-auth-seed.mjs";

test("retained coaching auth seed refuses non-loopback emulators", () => {
  assert.equal(requireLoopbackAuthEmulator("127.0.0.1:9099"), "127.0.0.1:9099");
  assert.equal(requireLoopbackAuthEmulator("localhost:9099"), "localhost:9099");
  assert.throws(
    () => requireLoopbackAuthEmulator("identitytoolkit.googleapis.com"),
    /loopback/,
  );
  assert.throws(() => requireLoopbackAuthEmulator("127.0.0.1"), /loopback/);
});
