import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  requireLoopbackDatabaseUrl,
} from "./quipsly-retained-calendar-subscription-operation.mjs";

test("calendar subscription operation requires private absolute evidence output", () => {
  assert.equal(
    parseArguments(["--output-dir", "/private/tmp/calendar-operation"])
      .outputDir,
    "/private/tmp/calendar-operation",
  );
  assert.throws(() => parseArguments(["--output-dir", "relative"]), /absolute/);
  assert.throws(() => parseArguments(["--unexpected"]), /Unknown/);
});

test("calendar subscription operation refuses remote and server-only database targets", () => {
  assert.match(
    requireLoopbackDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
    ),
    /^postgresql:\/\//,
  );
  assert.throws(
    () => requireLoopbackDatabaseUrl("postgresql://db.example.com/quipsly"),
    /loopback/,
  );
  assert.throws(
    () => requireLoopbackDatabaseUrl("postgresql://localhost"),
    /loopback/,
  );
});
