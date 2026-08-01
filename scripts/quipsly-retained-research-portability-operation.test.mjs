#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./quipsly-retained-research-portability-operation.mjs", import.meta.url), "utf8");

test("retained Research portability operator stays local and credential-safe", () => {
  assert.match(source, /requireLoopbackOrigin/);
  assert.match(source, /requireLocalDatabase/);
  assert.match(source, /readRetainedQAPassword/);
  assert.match(source, /QUIPSLY_RESEARCH_OUTSIDER_CREDENTIAL_FILE/);
  assert.match(source, /secretsPrinted: false/);
  assert.doesNotMatch(source, /console\.log\([^)]*password/i);
});

test("retained Research portability operator performs rendered authoring and restore", () => {
  for (const contract of [
    "selectExactQuote",
    "Save source-linked annotation",
    "Start private draft with this evidence",
    "document-save-status",
    "waitForEvent(\"download\")",
    "Validate restore plan",
    "Apply verified restore",
    "sameBundleRetryIdempotent: true",
  ]) assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("retained Research portability operator proves canonical and privacy boundaries", () => {
  for (const contract of [
    "sourceFingerprint",
    "restored-from-export",
    "manifestSha256",
    "Unrelated account export denial",
    "Unrelated account was not redirected away",
    "immutableSourceMutated: false",
    "overwroteExisting: false",
  ]) assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
