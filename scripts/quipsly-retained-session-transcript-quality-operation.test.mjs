import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { normalizedWords, wordErrorRate } from "./quipsly-retained-session-transcript-quality-operation.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const operationPath = resolve(repositoryRoot, "scripts/quipsly-retained-session-transcript-quality-operation.mjs");

function runOperation(env) {
  return execFileAsync(process.execPath, [operationPath], { cwd: repositoryRoot, env });
}

test("retained transcript-quality operation requires explicit mutation authority", async () => {
  const env = { ...process.env };
  delete env.QUIPSLY_RETAINED_TRANSCRIPT_QUALITY_OPERATION;
  await assert.rejects(runOperation(env), /Set QUIPSLY_RETAINED_TRANSCRIPT_QUALITY_OPERATION=1/);
});

test("retained transcript-quality operation refuses remote PostgreSQL before reading credentials", async () => {
  await assert.rejects(runOperation({
    ...process.env,
    QUIPSLY_RETAINED_TRANSCRIPT_QUALITY_OPERATION: "1",
    DATABASE_URL: "postgresql://operator:secret@database.example.test:5432/quipsly",
  }), /PostgreSQL must use loopback/);
});

test("matched-source comparison normalizes punctuation and counts word edits deterministically", () => {
  assert.deepEqual(normalizedWords("Quipsly, Recovery!"), ["quipsly", "recovery"]);
  assert.deepEqual(wordErrorRate("one two three", "one two three"), {
    edits: 0,
    referenceWords: 3,
    candidateWords: 3,
    rate: 0,
  });
  assert.equal(wordErrorRate("one two three", "one too three").edits, 1);
  assert.equal(wordErrorRate("one two three", "zero one two three").edits, 1);
});
