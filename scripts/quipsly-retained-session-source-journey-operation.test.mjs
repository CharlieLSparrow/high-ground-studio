import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const operationPath = resolve(repositoryRoot, "scripts/quipsly-retained-session-source-journey-operation.mjs");
const loaderPath = resolve(repositoryRoot, "scripts/register-ts-extension-loader.mjs");

function runOperation(env) {
  return execFileAsync(process.execPath, [
    "--experimental-transform-types",
    "--import", loaderPath,
    operationPath,
  ], {
    cwd: repositoryRoot,
    env,
  });
}

test("retained source-journey operation requires explicit activation", async () => {
  const env = { ...process.env };
  delete env.QUIPSLY_RETAINED_SOURCE_JOURNEY_OPERATION;
  await assert.rejects(runOperation(env), /Set QUIPSLY_RETAINED_SOURCE_JOURNEY_OPERATION=1/);
});

test("retained source-journey operation refuses a remote database before importing application code", async () => {
  await assert.rejects(runOperation({
    ...process.env,
    QUIPSLY_RETAINED_SOURCE_JOURNEY_OPERATION: "1",
    DATABASE_URL: "postgresql://operator:secret@database.example.test:5432/quipsly",
  }), /requires loopback PostgreSQL and refuses remote databases/);
});
