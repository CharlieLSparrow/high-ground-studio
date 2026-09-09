import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertRetainedSpeechWork, selectRetainedSpeechWork } from "./lib/retained-speech-work.mjs";

function workFixture() {
  return {
    tasks: [{ id: "task-1", title: "My edited task", assignedUserId: "client", status: "DONE", detail: "Keep my edits", dueAt: "2026-09-10", sourceJson: { generatedSnapshot: { title: "Tomorrow I will draft one page" }, recordingAssetId: "source-1" } }],
    goals: [{ id: "goal-1", title: "My edited goal", ownerUserId: "client", status: "ACTIVE", description: "My goal description", targetAt: "2026-10-10", sourceJson: { generatedSnapshot: { title: "My coaching goal is to write every morning" }, recordingAssetId: "source-1" } }],
  };
}

test("retained recording recognizes renamed work by generation source and preserves reassignment", () => {
  const before = workFixture();
  assert.deepEqual(selectRetainedSpeechWork(before), before);
  assertRetainedSpeechWork({ before, after: structuredClone(before), actorId: "coach" });
  assert.deepEqual(selectRetainedSpeechWork({ tasks: [], goals: [{ title: "My coaching goal is to write again" }] }).goals.length, 1);
});

test("new speech work is assigned to the speaker", () => {
  const after = workFixture();
  assert.throws(() => assertRetainedSpeechWork({ before: { tasks: [], goals: [] }, after, actorId: "coach" }), /recording speaker/);
  assertRetainedSpeechWork({ before: { tasks: [], goals: [] }, after, actorId: "client" });
});

test("recognizes the concise generated goal while retaining user wording", () => {
  const work = workFixture();
  work.goals[0].sourceJson.generatedSnapshot.title = "Write every morning";
  assert.deepEqual(selectRetainedSpeechWork(work), work);
  assert.deepEqual(selectRetainedSpeechWork({tasks: [], goals: [{title: "Write every evening"}]}).goals, []);
});

for (const [label, mutate] of [
  ["title overwrite", (work) => { work.tasks[0].title = "Overwritten"; }],
  ["due date overwrite", (work) => { work.tasks[0].dueAt = null; }],
  ["source replacement", (work) => { work.goals[0].sourceJson.recordingAssetId = "different"; }],
  ["duplicate work", (work) => { work.tasks.push(structuredClone(work.tasks[0])); }],
  ["identity replacement", (work) => { work.goals[0].id = "replacement"; }],
]) {
  test(`retained recording rejects ${label}`, () => {
    const before = workFixture(), after = structuredClone(before);
    mutate(after);
    assert.throws(() => assertRetainedSpeechWork({ before, after, actorId: "client" }));
  });
}

const script = fileURLToPath(new URL("./quipsly-retained-browser-source-operation.mjs", import.meta.url));

for (const [name, env, expected] of [
  ["explicit regression opt-in", { QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION: "0" }, /authorize this retained local-media regression/],
  ["a synthetic account", { QUIPSLY_BROWSER_SOURCE_QA_EMAIL: "person@example.com" }, /synthetic \.test account/],
  ["a local auth emulator", { FIREBASE_AUTH_EMULATOR_HOST: "auth.example.test:9099" }, /loopback HTTP origin/],
  ["a local database", { QUIPSLY_LOCAL_DATABASE_URL: "postgresql://test:test@db.example.test:5432/test" }, /loopback database/],
]) {
  test(`browser speech rehearsal requires ${name} before fixture or account mutations`, () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8", timeout: 10_000,
      env: {
        ...process.env,
        QUIPSLY_RETAINED_BROWSER_SOURCE_OPERATION: "1",
        QUIPSLY_BROWSER_SOURCE_QA_EMAIL: "synthetic@example.test",
        QUIPSLY_LOCAL_BASE_URL: "http://127.0.0.1:1",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
        QUIPSLY_LOCAL_DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
        ...env,
      },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|auth\/user-not-found|spawnSync say/);
  });
}
