import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectPhysicalInstallSnapshot,
  parseArguments,
} from "./quipsly-capture-physical-install-readback.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const privacyBoundary =
  "Privacy boundary: no email, account ID, session or recording ID, source text, filename, file path, credential, access token, or refresh token is included.";

function snapshot(overrides = {}) {
  const fields = {
    Created: "2026-08-05T20:00:00Z",
    Surface: "Account",
    App: `${QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion} (${QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber})`,
    Device: "iPhone17,3",
    System: "iOS 26.2",
    "Account access": "online",
    "Nest host": "nest.quipsly.com",
    "Audio capture": "saved",
    "Video capture": "saved",
    "Live room": "not connected",
    "Audio route type": "BuiltInMic",
    "Local originals": "2",
    "Recoverable uploads": "0",
    "Preview mode": "no",
    ...overrides,
  };
  return [
    "Quipsly Capture support snapshot",
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    "",
    privacyBoundary,
  ].join("\n");
}

test("parses the package-script separator and bounded snapshot age", () => {
  assert.deepEqual(
    parseArguments(["--", "--snapshot", "/tmp/report.txt", "--max-age-hours", "12"]),
    {
      snapshotPath: "/tmp/report.txt",
      outputPath: "",
      maxAgeHours: 12,
      help: false,
    },
  );
  assert.throws(
    () => parseArguments(["--snapshot", "/tmp/report.txt", "--max-age-hours", "0"]),
    /greater than 0/,
  );
});

test("proves the canonical build on a physical authenticated iPhone without inventing capture proof", () => {
  const receipt = inspectPhysicalInstallSnapshot({
    text: snapshot(),
    auditedAt: new Date("2026-08-05T20:10:00Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.physicalInstallAndAuthenticationProven, true);
  assert.equal(receipt.physicalCaptureAcceptanceProven, false);
  assert.equal(receipt.snapshot.deviceModel, "iPhone17,3");
  assert.equal(receipt.snapshot.appBuild, QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber);
  assert.equal(receipt.snapshot.accountAccessMode, "online");
  assert.equal(receipt.rawSnapshotRetainedInReceipt, false);
  assert.equal(receipt.claimsNotMade.length, 6);
});

test("accepts a fresh verified offline account session", () => {
  const receipt = inspectPhysicalInstallSnapshot({
    text: snapshot({ "Account access": "offlineCachedIdentity" }),
    auditedAt: new Date("2026-08-05T20:15:00Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.checks.authenticatedAccess, true);
});

test("fails closed for a simulator, wrong build, preview, sign-in surface, or stale report", () => {
  const receipt = inspectPhysicalInstallSnapshot({
    text: snapshot({
      Surface: "Sign-in",
      App: "1.0 (31)",
      Device: "arm64",
      "Account access": "signedOut",
      "Preview mode": "yes",
    }),
    auditedAt: new Date("2026-08-05T20:10:00Z"),
  });
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.blockers, [
    "exactRelease",
    "physicalIPhone",
    "accountSurface",
    "authenticatedAccess",
    "productionMode",
  ]);
  assert.throws(
    () => inspectPhysicalInstallSnapshot({
      text: snapshot(),
      auditedAt: new Date("2026-08-07T20:00:01Z"),
    }),
    /older than 24 hours/,
  );
});

test("rejects private fields even when the privacy disclaimer is copied", () => {
  assert.throws(
    () => inspectPhysicalInstallSnapshot({
      text: snapshot() + "\nEmail: homer@example.com\n",
      auditedAt: new Date("2026-08-05T20:10:00Z"),
    }),
    /forbidden private field/,
  );
  assert.throws(
    () => inspectPhysicalInstallSnapshot({
      text: snapshot().replace(privacyBoundary, "Privacy boundary: missing"),
      auditedAt: new Date("2026-08-05T20:10:00Z"),
    }),
    /privacy boundary is missing/,
  );
});

test("CLI writes an owner-only derivative receipt without the raw snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-physical-install-"));
  const snapshotPath = path.join(directory, "support.txt");
  const receiptPath = path.join(directory, "receipt.json");
  try {
    fs.writeFileSync(snapshotPath, snapshot({ Created: new Date().toISOString() }));
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./quipsly-capture-physical-install-readback.mjs", import.meta.url)),
        "--snapshot",
        snapshotPath,
        "--output",
        receiptPath,
      ],
      { stdio: "pipe" },
    );
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.rawSnapshotRetainedInReceipt, false);
    assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
    assert.doesNotMatch(JSON.stringify(receipt), /support snapshot\n|privacy boundary:/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
