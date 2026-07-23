import assert from "node:assert/strict";
import test from "node:test";

import { collectExpectedSchema } from "./quipsly-foundation-baseline-audit.mjs";

test("collects additive baseline objects", () => {
  const expected = collectExpectedSchema([
    `
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TYPE "Status" AS ENUM ('OPEN');
      CREATE TABLE IF NOT EXISTS "Thing" (
        "id" TEXT NOT NULL,
        "status" "Status" NOT NULL,
        CONSTRAINT "Thing_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Thing_id_key" ON "Thing"("id");
      ALTER TABLE "Thing" ADD COLUMN IF NOT EXISTS "note" TEXT;
    `,
  ]);

  assert.deepEqual([...expected.extensions], ["vector"]);
  assert.deepEqual([...expected.types], ["Status"]);
  assert.deepEqual([...expected.tables], ["Thing"]);
  assert.deepEqual([...expected.columns], [
    "Thing.id",
    "Thing.status",
    "Thing.note",
  ]);
  assert.deepEqual([...expected.indexes], ["Thing_id_key"]);
  assert.deepEqual([...expected.constraints], ["Thing_pkey"]);
});

test("rejects destructive baseline statements", () => {
  assert.throws(
    () => collectExpectedSchema([`DROP TABLE "Thing";`]),
    /destructive SQL statement/,
  );
});
