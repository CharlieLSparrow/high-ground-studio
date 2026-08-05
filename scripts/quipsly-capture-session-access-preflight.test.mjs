import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs as parseAccessArgs } from "./quipsly-capture-session-access-preflight.mjs";
import {
  assertLocalDatabase,
  parseArgs as parseCollaborationArgs,
} from "./quipsly-local-hgo-collaboration-converge.mjs";

test("capture access preflight accepts several identity paths for one expected Session", () => {
  const parsed = parseAccessArgs([
    "node",
    "script",
    "--",
    "--base-url",
    "https://nest.quipsly.com/",
    "--email",
    " Charlie@Example.com ",
    "--email",
    "alternate@example.com",
    "--expect-session",
    "Episode 9: The Swear Jar",
  ]);

  assert.equal(parsed.baseUrl, "https://nest.quipsly.com");
  assert.deepEqual(parsed.emails, ["charlie@example.com", "alternate@example.com"]);
  assert.equal(parsed.expectedSession, "Episode 9: The Swear Jar");
});

test("local collaboration convergence is dry-run by default and retains repeated credentials", () => {
  const parsed = parseCollaborationArgs([
    "node",
    "script",
    "--owner-firebase-uid",
    "owner-one",
    "--owner-firebase-uid",
    "owner-two",
    "--collaborator-firebase-uid",
    "collaborator-one",
  ]);

  assert.equal(parsed.apply, false);
  assert.deepEqual(parsed.owner.firebaseUids, ["owner-one", "owner-two"]);
  assert.deepEqual(parsed.collaborator.firebaseUids, ["collaborator-one"]);
});

test("local collaboration convergence fails closed outside the loopback database", () => {
  assert.doesNotThrow(() => assertLocalDatabase(
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  ));
  assert.throws(
    () => assertLocalDatabase("postgresql://operator@example.com:5432/quipsly"),
    /non-loopback database/,
  );
});
