import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  execute,
  parseArguments,
  uploadReservedAsset,
  validateSubmissionReceipt,
} from "./quipsly-app-store-connect-screenshots.mjs";

function response(body = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function apiKey() {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    keyId: "TESTKEY123",
    issuerId: "11111111-2222-3333-4444-555555555555",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

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

test("plans a missing set without mutating App Store Connect", async () => {
  const values = fixture();
  const calls = [];
  try {
    const result = await execute({
      options: {
        apply: false, appId: "6780995957", version: "1.0", locale: "en-US",
        displayType: "APP_IPHONE_67", confirmTarget: "",
      },
      key: apiKey(),
      metadata: values.metadata,
      receipt: values.receipt,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url.includes("/appStoreVersions?")) return response({
          data: [{ type: "appStoreVersions", id: "version-1" }],
          included: [{ type: "appStoreVersionLocalizations", id: "locale-1", attributes: { locale: "en-US" } }],
        });
        if (url.includes("/relationships/appScreenshotSets")) return response({ data: [] });
        throw new Error(`Unexpected request: ${init.method} ${url}`);
      },
    });
    assert.equal(result.mode, "plan");
    assert.equal(result.externalMutation, false);
    assert.equal(calls.every(({ init }) => init.method === "GET"), true);
    assert.deepEqual(result.changes, [
      "create APP_IPHONE_67 screenshot set",
      "upload 1 exact candidate-bound screenshot(s)",
      "persist canonical screenshot order",
    ]);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("creates, uploads, commits, and orders an empty candidate-bound screenshot set", async () => {
  const values = fixture();
  const calls = [];
  try {
    const result = await execute({
      options: {
        apply: true, appId: "6780995957", version: "1.0", locale: "en-US",
        displayType: "APP_IPHONE_67", confirmTarget: "6780995957/1.0/en-US/APP_IPHONE_67",
      },
      key: apiKey(),
      metadata: values.metadata,
      receipt: values.receipt,
      sleep: async () => {},
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url.includes("/appStoreVersions?")) return response({
          data: [{ type: "appStoreVersions", id: "version-1" }],
          included: [{ type: "appStoreVersionLocalizations", id: "locale-1", attributes: { locale: "en-US" } }],
        });
        if (url.includes("/relationships/appScreenshotSets") && init.method === "GET") return response({ data: [] });
        if (url.endsWith("/v1/appScreenshotSets") && init.method === "POST") return response({
          data: { type: "appScreenshotSets", id: "set-1", attributes: { screenshotDisplayType: "APP_IPHONE_67" } },
        }, 201);
        if (url.endsWith("/v1/appScreenshots") && init.method === "POST") return response({
          data: {
            type: "appScreenshots", id: "shot-1",
            attributes: {
              fileName: "01.png", fileSize: 10,
              assetDeliveryState: { state: "AWAITING_UPLOAD" },
              uploadOperations: [{ method: "PUT", url: "https://upload.example/shot-1", offset: 0, length: 10, requestHeaders: [] }],
            },
          },
        }, 201);
        if (url === "https://upload.example/shot-1" && init.method === "PUT") return response();
        if (url.endsWith("/v1/appScreenshots/shot-1") && init.method === "PATCH") return response({
          data: {
            type: "appScreenshots", id: "shot-1",
            attributes: { fileName: "01.png", sourceFileChecksum: values.receipt.screenshots[0].md5, assetDeliveryState: { state: "COMPLETE" } },
          },
        });
        if (url.endsWith("/v1/appScreenshotSets/set-1/relationships/appScreenshots") && init.method === "PATCH") {
          return response({}, 204);
        }
        throw new Error(`Unexpected request: ${init.method} ${url}`);
      },
    });
    assert.equal(result.providerComplete, true);
    assert.equal(result.externalMutation, true);
    const requestBodies = calls.filter(({ init }) => init.body && typeof init.body === "string")
      .map(({ init }) => JSON.parse(init.body));
    assert.equal(requestBodies[0].data.relationships.appStoreVersionLocalization.data.id, "locale-1");
    assert.equal(requestBodies[1].data.relationships.appScreenshotSet.data.id, "set-1");
    assert.equal(requestBodies[2].data.attributes.uploaded, true);
    assert.deepEqual(requestBodies.at(-1).data, [{ type: "appScreenshots", id: "shot-1" }]);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});
