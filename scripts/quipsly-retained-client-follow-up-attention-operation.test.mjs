import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireLoopbackDatabaseUrl } from "./quipsly-retained-client-follow-up-attention-operation.mjs";

const operationPath = new URL(
  "./quipsly-retained-client-follow-up-attention-operation.mjs",
  import.meta.url,
);

test("client follow-up attention operation refuses non-local databases", () => {
  assert.throws(
    () => requireLoopbackDatabaseUrl("postgresql://user:secret@db.example.com/quipsly"),
    /explicit loopback PostgreSQL database/i,
  );
  assert.equal(
    requireLoopbackDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio"),
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
});

test("client follow-up attention operation proves explicit recipient readback boundaries", async () => {
  const source = await readFile(operationPath, "utf8");
  assert.match(source, /today-client-follow-up-attention/);
  assert.match(source, /Confirm follow-up opened/);
  assert.match(source, /recipientUserId === latest\.recipientUserId/);
  assert.match(source, /contentSha256 === latest\.contentSha256/);
  assert.match(source, /canonicalTaskMutated: false/);
  assert.match(source, /providerCalendarMutated: false/);
  assert.match(source, /externalMessageSent: false/);
});
