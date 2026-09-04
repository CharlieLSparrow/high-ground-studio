import assert from "node:assert/strict";
import test from "node:test";

import {
  runFairLocalMediaWorkerCycle,
  type LocalMediaWorkerRunner,
} from "./local-episode-worker.js";

function runner(
  name: string,
  disposition: string,
  calls: string[],
): LocalMediaWorkerRunner {
  return async () => {
    calls.push(name);
    return { disposition };
  };
}

test("rotates beyond a retrying queue so downstream work cannot starve", async () => {
  const calls: string[] = [];
  const runners = [
    runner("signal", "retry", calls),
    runner("alignment", "completed", calls),
    runner("share", "idle", calls),
  ];

  const first = await runFairLocalMediaWorkerCycle(runners, 0);
  assert.equal(first.result.disposition, "retry");
  assert.equal(first.nextIndex, 1);

  const second = await runFairLocalMediaWorkerCycle(runners, first.nextIndex);
  assert.equal(second.result.disposition, "completed");
  assert.equal(second.nextIndex, 2);
  assert.deepEqual(calls, ["signal", "alignment"]);
});

test("scans across idle queues and preserves at-most-one operated job per cycle", async () => {
  const calls: string[] = [];
  const result = await runFairLocalMediaWorkerCycle(
    [
      runner("proxy", "idle", calls),
      runner("mastery", "idle", calls),
      runner("transcript", "completed", calls),
      runner("alignment", "completed", calls),
    ],
    0,
  );

  assert.equal(result.result.disposition, "completed");
  assert.equal(result.nextIndex, 3);
  assert.deepEqual(calls, ["proxy", "mastery", "transcript"]);
});

test("normalizes the cursor and advances an all-idle ring", async () => {
  const calls: string[] = [];
  const result = await runFairLocalMediaWorkerCycle(
    [runner("first", "idle", calls), runner("second", "idle", calls)],
    -1,
  );

  assert.equal(result.result.disposition, "idle");
  assert.equal(result.nextIndex, 0);
  assert.deepEqual(calls, ["second", "first"]);
});

test("an empty ring remains safely idle", async () => {
  assert.deepEqual(await runFairLocalMediaWorkerCycle([], 12), {
    result: { disposition: "idle" },
    nextIndex: 0,
  });
});
