import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  requireLoopbackDatabaseUrl,
} from "./quipsly-retained-calendar-overview-operation.mjs";

test("calendar overview operation accepts only explicit loopback databases", () => {
  assert.equal(
    requireLoopbackDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/quipsly"),
    "postgresql://user:pass@127.0.0.1:5432/quipsly",
  );
  assert.throws(() => requireLoopbackDatabaseUrl("postgresql://example.com/quipsly"), /loopback/);
  assert.throws(() => requireLoopbackDatabaseUrl("postgresql://127.0.0.1"), /loopback/);
});

test("calendar overview operation requires a new absolute evidence directory", () => {
  assert.deepEqual(parseArguments(["--output-dir", "/tmp/quipsly-calendar-proof"]), {
    help: false,
    outputDir: "/tmp/quipsly-calendar-proof",
  });
  assert.equal(parseArguments(["--", "--output-dir", "/tmp/quipsly-calendar-proof"]).outputDir, "/tmp/quipsly-calendar-proof");
  assert.throws(() => parseArguments(["--output-dir", "relative-proof"]), /absolute/);
  assert.throws(() => parseArguments(["--wat"]), /Unknown argument/);
});
