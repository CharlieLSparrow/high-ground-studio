import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalDatabaseUrl,
  deriveFixtureDatabase,
  parseFixtureReceipt,
  quoteFixtureIdentifier,
} from "./quipsly-local-schema-fixture.mjs";

test("accepts only explicit loopback PostgreSQL URLs with a database", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const value = assertLocalDatabaseUrl(
      `postgresql://postgres:secret@${host}:5432/high_ground_studio`,
    );
    assert.equal(value.pathname, "/high_ground_studio");
  }

  for (const value of [
    "",
    "https://127.0.0.1/high_ground_studio",
    "postgresql://cloud.example.com/high_ground_studio",
    "postgresql://127.0.0.1",
  ]) {
    assert.throws(() => assertLocalDatabaseUrl(value));
  }
});

test("derives and quotes only the exact release-owned fixture identity", () => {
  const sha = "e4bfd28a88be86ad011e088f116da57fc4e5eb6a";
  const name = deriveFixtureDatabase(sha);
  assert.equal(name, "quipsly_fixture_e4bfd28a88be_local");
  assert.equal(quoteFixtureIdentifier(name), `"${name}"`);
  assert.throws(() => deriveFixtureDatabase("e4bfd28a"));
  assert.throws(() => quoteFixtureIdentifier("high_ground_studio"));
  assert.throws(() => quoteFixtureIdentifier("quipsly_fixture_safe;drop"));
});

test("extracts only the verified worker receipt from mixed Prisma output", () => {
  const receipt = parseFixtureReceipt([
    "Applying migration example",
    JSON.stringify({ kind: "unrelated" }),
    JSON.stringify({
      kind: "quipsly-schema-fixture-receipt-v1",
      sourceSha: "abc",
      schemaDiff: "zero",
    }),
  ].join("\n"));
  assert.equal(receipt.sourceSha, "abc");
  assert.throws(() => parseFixtureReceipt("No difference detected."));
});
