import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const operationPath = resolve(repositoryRoot, "scripts/quipsly-retained-session-transcript-source-focus-operation.mjs");

function runOperation(env) {
  return execFileAsync(process.execPath, [operationPath], { cwd: repositoryRoot, env });
}

test("retained transcript source-focus operation requires explicit activation", async () => {
  const env = { ...process.env };
  delete env.QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_FOCUS_OPERATION;
  await assert.rejects(runOperation(env), /Set QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_FOCUS_OPERATION=1/);
});

test("retained transcript source-focus operation refuses remote PostgreSQL before reading credentials", async () => {
  await assert.rejects(runOperation({
    ...process.env,
    QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_FOCUS_OPERATION: "1",
    DATABASE_URL: "postgresql://operator:secret@database.example.test:5432/quipsly",
  }), /PostgreSQL must use loopback/);
});
