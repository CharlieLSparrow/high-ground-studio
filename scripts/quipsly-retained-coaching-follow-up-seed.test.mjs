import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(
  "scripts/quipsly-retained-coaching-follow-up-seed.mjs",
  "utf8",
);

test("retained coaching fixture grants scoped staff authority only to the coach", () => {
  const roleGrants = [...seed.matchAll(/prisma\.userRole\.upsert\(\{[\s\S]*?\n    \}\);/g)]
    .map((match) => match[0]);
  assert.equal(roleGrants.length, 1);
  assert.match(roleGrants[0], /userId: userByRole\.coach\.id/);
  assert.match(roleGrants[0], /role: "COACH"/);
  assert.doesNotMatch(roleGrants[0], /userByRole\.(client|outsider)\.id/);
  assert.doesNotMatch(roleGrants[0], /role: "OWNER"/);
});

test("retained coaching fixture remains local-only and uses reserved identities", () => {
  assert.match(seed, /requireLocalDatabase/);
  assert.match(seed, /requireLoopbackOrigin/);
  assert.match(seed, /@example\.test/);
  assert.doesNotMatch(seed, /deleteMany|\$executeRawUnsafe\(\s*["'`]DELETE/i);
});

test("retained coaching fixture does not grant or enroll the privacy outsider", () => {
  assert.doesNotMatch(
    seed,
    /quipsly-privacy-outsider-retained-20260802@example\.test/,
  );
});
