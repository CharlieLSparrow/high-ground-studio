import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectAttentionLedger,
  parseArguments,
} from "./quipsly-capture-device-attention-readback.mjs";

function ledger(events) {
  return { schemaVersion: 1, events };
}

function event(overrides = {}) {
  return {
    id: "private-event-id",
    occurredAt: "2026-08-31T05:00:00Z",
    message: "No microphone is available after activating the audio session.",
    selectedSessionID: "private-session-id",
    selectedSessionIsLocal: false,
    canonicalSessionCount: 3,
    localDraftSessionCount: 1,
    isRefreshing: false,
    isCreatingSession: false,
    isChangingCapture: true,
    isChangingRoom: false,
    ...overrides,
  };
}

test("requires exactly one read-only source", () => {
  assert.equal(parseArguments(["--device", "Morbo"]).device, "Morbo");
  assert.equal(parseArguments(["--ledger", "/tmp/ledger.json"]).ledgerPath, "/tmp/ledger.json");
  assert.throws(() => parseArguments([]), /exactly one/);
  assert.throws(() => parseArguments(["--device", "Morbo", "--ledger", "/tmp/a"]), /exactly one/);
});

test("reports the exact latest failure without private identifiers", () => {
  const receipt = inspectAttentionLedger(ledger([
    event({ message: "The live room could not connect." }),
    event(),
  ]));
  assert.equal(receipt.eventCount, 2);
  assert.equal(receipt.latest.category, "microphone-or-audio-route");
  assert.equal(receipt.latest.transitionState, "changing-capture");
  assert.equal(receipt.latest.message, "No microphone is available after activating the audio session.");
  assert.equal(receipt.identifiersPrinted, false);
  assert.doesNotMatch(JSON.stringify(receipt), /private-(?:event|session)-id/);
});

test("accepts an empty bounded ledger and rejects invalid evidence", () => {
  assert.equal(inspectAttentionLedger(ledger([])).latest, null);
  assert.throws(() => inspectAttentionLedger({ schemaVersion: 2, events: [] }), /Unsupported/);
  assert.throws(() => inspectAttentionLedger(ledger([event({ occurredAt: "bad" })])), /timestamp/);
  assert.throws(() => inspectAttentionLedger(ledger(Array.from({ length: 201 }, () => event()))), /bounded/);
});

test("CLI writes an owner-only receipt and omits ledger identifiers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-attention-test-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const outputPath = path.join(directory, "receipt.json");
  try {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger([event()])));
    execFileSync(process.execPath, [
      fileURLToPath(new URL("./quipsly-capture-device-attention-readback.mjs", import.meta.url)),
      "--ledger", ledgerPath,
      "--output", outputPath,
    ]);
    const output = fs.readFileSync(outputPath, "utf8");
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.doesNotMatch(output, /private-(?:event|session)-id/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
