import assert from "node:assert/strict";
import test from "node:test";

import { requireLoopbackDatabaseUrl } from "./quipsly-retained-coaching-draft-revision-operation.mjs";

test("coaching draft revision operation accepts only explicit loopback PostgreSQL", () => {
  assert.equal(
    requireLoopbackDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
    ),
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  assert.throws(
    () => requireLoopbackDatabaseUrl("postgresql://example.com/quipsly"),
    /loopback PostgreSQL/,
  );
  assert.throws(
    () => requireLoopbackDatabaseUrl("mysql://127.0.0.1/quipsly"),
    /loopback PostgreSQL/,
  );
  assert.throws(
    () => requireLoopbackDatabaseUrl("postgresql://127.0.0.1"),
    /loopback PostgreSQL/,
  );
});
