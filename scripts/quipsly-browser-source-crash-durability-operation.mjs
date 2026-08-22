#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  loadPlaywright,
  requireLoopbackOrigin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_BROWSER_SOURCE_CRASH_DURABILITY_OPERATION,
  "1",
  "Set QUIPSLY_BROWSER_SOURCE_CRASH_DURABILITY_OPERATION=1 to run the local OPFS durability operation.",
);

const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "QUIPSLY_LOCAL_BASE_URL",
);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const fileName = `crash-durability-${crypto.randomUUID()}.bin.part`;

try {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async (targetFileName) => {
    const worker = new Worker("/workers/quipsly-opfs-source-writer-v1.js");
    let sequence = 0;
    const request = (action, payload = {}, transfer = []) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = window.setTimeout(
          () => reject(new Error(`Worker ${action} timed out.`)),
          15_000,
        );
        const onMessage = (event) => {
          if (event.data?.id !== id) return;
          worker.removeEventListener("message", onMessage);
          window.clearTimeout(timeout);
          if (event.data?.ok === true) resolve(event.data);
          else reject(new Error(event.data?.error || `Worker ${action} failed.`));
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, action, ...payload }, transfer);
      });

    const first = new TextEncoder().encode("quipsly-durable-chunk-one|");
    const second = new TextEncoder().encode("chunk-two-survives-abrupt-worker-loss");
    await request("init", { opfsFileName: targetFileName });
    const firstReply = await request(
      "write",
      { byteOffset: 0, bytes: first.buffer },
      [first.buffer],
    );
    const secondReply = await request(
      "write",
      { byteOffset: firstReply.committedSizeBytes, bytes: second.buffer },
      [second.buffer],
    );

    // Deliberately do not send close. This models a page/process loss after the
    // recorder has received a committed-chunk acknowledgement.
    worker.terminate();
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(
      "quipsly-browser-sources-v1",
    );
    const handle = await directory.getFileHandle(targetFileName);
    const file = await handle.getFile();
    const text = await file.text();
    await directory.removeEntry(targetFileName);
    return {
      firstCommittedSizeBytes: firstReply.committedSizeBytes,
      secondCommittedSizeBytes: secondReply.committedSizeBytes,
      fileSizeBytes: file.size,
      text,
    };
  }, fileName);

  assert.equal(
    result.text,
    "quipsly-durable-chunk-one|chunk-two-survives-abrupt-worker-loss",
    "Acknowledged source chunks did not survive abrupt worker loss exactly.",
  );
  assert.equal(
    result.fileSizeBytes,
    result.secondCommittedSizeBytes,
    "The committed OPFS size does not match the recovered file.",
  );
  assert(result.firstCommittedSizeBytes > 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        abruptWorkerTerminationBeforeClose: true,
        acknowledgedChunksRecoveredExactly: true,
        firstCommittedSizeBytes: result.firstCommittedSizeBytes,
        secondCommittedSizeBytes: result.secondCommittedSizeBytes,
        fileSizeBytes: result.fileSizeBytes,
        syntheticFixtureOnly: true,
        sourceBytesPrinted: false,
        externalSideEffects: false,
      },
      null,
      2,
    ),
  );
} finally {
  await page.close();
  await browser.close();
}
