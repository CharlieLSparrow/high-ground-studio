import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseArguments,
  uploadReservedAsset,
  validateSubmissionReceipt,
} from "./quipsly-app-store-connect-screenshots.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-asc-screenshots-"));
  const imagePath = path.join(directory, "01.png");
  const bytes = Buffer.from("0123456789");
  fs.writeFileSync(imagePath, bytes);
  const metadata = {
    screenshots: {
      deviceClass: "iPhone 6.9-inch",
      planned: [{ order: 1, filename: "01.png", width: 1320, height: 2868 }],
    },
  };
  const receipt = {
    schema: "quipsly-capture-app-store-screenshot-submission-v1",
    submissionEligible: true,
    sourceRevision: "a".repeat(40),
    sourceIsolation: "detached-worktree",
    locale: "en-US",
    candidate: { version: "1.0", build: "35" },
    screenshots: [{
      order: 1, filename: "01.png", path: imagePath, width: 1320, height: 2868, bytes: 10,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      md5: crypto.createHash("md5").update(bytes).digest("hex"),
    }],
  };
  return { directory, metadata, receipt };
}

test("defaults to read-only planning", () => {
  const options = parseArguments(["--submission-receipt", "/tmp/receipt.json"]);
  assert.equal(options.apply, false);
  assert.equal(options.locale, "en-US");
  assert.equal(options.displayType, "APP_IPHONE_67");
});

test("accepts exact candidate-bound screenshot bytes", () => {
  const values = fixture();
  try {
    const screenshots = validateSubmissionReceipt(values.receipt, {
      metadata: values.metadata, version: "1.0", locale: "en-US", displayType: "APP_IPHONE_67",
    });
    assert.equal(screenshots.length, 1);
    assert.equal(screenshots[0].bytesBuffer.toString(), "0123456789");
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("rejects a screenshot receipt that is not submission eligible", () => {
  const values = fixture();
  try {
    values.receipt.submissionEligible = false;
    assert.throws(() => validateSubmissionReceipt(values.receipt, {
      metadata: values.metadata, version: "1.0", locale: "en-US", displayType: "APP_IPHONE_67",
    }), /not submission eligible/);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("uploads every provider-requested byte range with exact headers", async () => {
  const calls = [];
  const bytes = Buffer.from("abcdefghij");
  await uploadReservedAsset({
    attributes: {
      uploadOperations: [
        { method: "PUT", url: "https://upload.example/one", offset: 0, length: 4, requestHeaders: [{ name: "Content-Type", value: "image/png" }] },
        { method: "PUT", url: "https://upload.example/two", offset: 4, length: 6, requestHeaders: [{ name: "X-Test", value: "two" }] },
      ],
    },
  }, bytes, async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  });
  assert.deepEqual(calls.map(({ url, init }) => ({ url, method: init.method, headers: init.headers, body: init.body.toString() })), [
    { url: "https://upload.example/one", method: "PUT", headers: { "Content-Type": "image/png" }, body: "abcd" },
    { url: "https://upload.example/two", method: "PUT", headers: { "X-Test": "two" }, body: "efghij" },
  ]);
});
