#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const execFileAsync = promisify(execFile);
const DIAGNOSTIC_SOURCE =
  "Library/Application Support/QuipslyCapture/Diagnostics/capture-attention-v1.json";

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = { device: "", outputPath: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--device") options.device = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  if (!options.help && !clean(options.device)) fail("--device is required.");
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-device-diagnostics-readback.mjs \\
    --device <paired-device-name-or-id> \\
    [--output <owner-only-receipt.json>]

Reads the installed Quipsly Capture version and its protected local attention
ledger from a paired development iPhone or iPad. The receipt contains only a
coarse failure category and transition state. It never includes the original
message, account, Session, source, filename, path, credential, or device ID.
`;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonnegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function supportCategory(message) {
  const normalized = clean(message).toLowerCase();
  if (normalized.includes("microphone") || normalized.includes("audio route")) {
    return "microphone-or-audio-route";
  }
  if (normalized.includes("camera")) return "camera";
  if (normalized.includes("permission") || normalized.includes("allow ")) {
    return "system-permission";
  }
  if (
    normalized.includes("storage") ||
    normalized.includes("disk") ||
    normalized.includes("free space")
  ) {
    return "device-storage";
  }
  if (normalized.includes("upload")) return "upload-or-verification";
  if (
    normalized.includes("live room") ||
    normalized.includes("call") ||
    normalized.includes("join the room")
  ) {
    return "call";
  }
  if (
    normalized.includes("network") ||
    normalized.includes("offline") ||
    normalized.includes("reach nest")
  ) {
    return "connection";
  }
  if (normalized.includes("account") || normalized.includes("sign in"))
    return "account";
  if (
    normalized.includes("session") ||
    normalized.includes("nest") ||
    normalized.includes("workspace") ||
    normalized.includes("that space") ||
    normalized.includes("selected space")
  ) {
    return "session-or-workspace";
  }
  if (normalized.includes("record") || normalized.includes("capture"))
    return "recording";
  return "capture-attention";
}

export function summarizeAttentionLedger(value) {
  const ledger = object(value);
  const events = array(ledger.events);
  if (ledger.schemaVersion !== 1 || events.length === 0) {
    return {
      schemaSupported: ledger.schemaVersion === 1,
      eventCount: 0,
      latestOccurredAt: null,
      latestCategory: null,
      latestTransitionState: null,
      latestSelectedSessionWasLocal: null,
      latestCanonicalSessionCount: null,
      latestLocalDraftSessionCount: null,
    };
  }
  const latest = object(events.at(-1));
  const activeTransitions = [
    latest.isRefreshing === true ? "refreshing" : null,
    latest.isCreatingSession === true ? "creating-session" : null,
    latest.isChangingCapture === true ? "changing-capture" : null,
    latest.isChangingRoom === true ? "changing-room" : null,
  ].filter(Boolean);
  const occurredAt = new Date(latest.occurredAt);
  return {
    schemaSupported: true,
    eventCount: Math.min(events.length, 200),
    latestOccurredAt: Number.isFinite(occurredAt.getTime())
      ? occurredAt.toISOString()
      : null,
    latestCategory: supportCategory(latest.message),
    latestTransitionState:
      activeTransitions.length > 0 ? activeTransitions.join(",") : "idle",
    latestSelectedSessionWasLocal:
      typeof latest.selectedSessionIsLocal === "boolean"
        ? latest.selectedSessionIsLocal
        : null,
    latestCanonicalSessionCount: nonnegativeInteger(
      latest.canonicalSessionCount,
    ),
    latestLocalDraftSessionCount: nonnegativeInteger(
      latest.localDraftSessionCount,
    ),
  };
}

export function inspectDeviceReadback({
  appsPayload,
  attentionLedger = null,
  checkedAt = new Date(),
}) {
  const apps = array(object(object(appsPayload).result).apps);
  const installed = apps.find(
    (candidate) =>
      object(candidate).bundleIdentifier ===
      QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
  );
  if (!installed)
    fail("Quipsly Capture is not installed on that paired device.");
  const app = object(installed);
  const version = clean(app.version);
  const build = clean(app.bundleVersion);
  const diagnostics =
    attentionLedger === null
      ? {
          schemaSupported: null,
          eventCount: 0,
          latestOccurredAt: null,
          latestCategory: null,
          latestTransitionState: null,
          latestSelectedSessionWasLocal: null,
          latestCanonicalSessionCount: null,
          latestLocalDraftSessionCount: null,
        }
      : summarizeAttentionLedger(attentionLedger);
  const exactRelease =
    version === QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion &&
    build === QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber;
  return {
    schema: "quipsly-capture-device-diagnostics-readback-v1",
    checkedAt: new Date(checkedAt).toISOString(),
    ok: exactRelease,
    target: {
      appName: QUIPSLY_CAPTURE_RELEASE_TARGET.appName,
      bundleId: QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
      version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
      build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
      buildId: QUIPSLY_CAPTURE_RELEASE_TARGET.buildId,
    },
    installed: {
      appName: clean(app.name) || QUIPSLY_CAPTURE_RELEASE_TARGET.appName,
      version,
      build,
    },
    checks: {
      appInstalled: true,
      exactRelease,
      diagnosticLedgerReadable: attentionLedger !== null,
    },
    diagnostics,
    rawAttentionMessageRetained: false,
    privateIdentifiersRetained: false,
    externalMutation: false,
  };
}

async function runDeviceCtl(args) {
  return execFileAsync("xcrun", ["devicectl", ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "quipsly-capture-device-readback-"),
  );
  try {
    const appsJSONPath = path.join(temporaryDirectory, "apps.json");
    await runDeviceCtl([
      "device",
      "info",
      "apps",
      "--device",
      options.device,
      "--json-output",
      appsJSONPath,
    ]);
    const appsPayload = JSON.parse(await readFile(appsJSONPath, "utf8"));
    const diagnosticPath = path.join(
      temporaryDirectory,
      "capture-attention-v1.json",
    );
    let attentionLedger = null;
    try {
      await runDeviceCtl([
        "device",
        "copy",
        "from",
        "--device",
        options.device,
        "--domain-type",
        "appDataContainer",
        "--domain-identifier",
        QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
        "--source",
        DIAGNOSTIC_SOURCE,
        "--destination",
        diagnosticPath,
      ]);
      attentionLedger = JSON.parse(await readFile(diagnosticPath, "utf8"));
    } catch {
      // A current install with no attention events may not have created the
      // ledger yet. The installed-version readback remains useful and honest.
    }
    const receipt = inspectDeviceReadback({ appsPayload, attentionLedger });
    if (options.outputPath) {
      await writeFile(
        options.outputPath,
        `${JSON.stringify(receipt, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );
      await chmod(options.outputPath, 0o600);
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (!receipt.ok) process.exitCode = 2;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `QUIPSLY_CAPTURE_DEVICE_DIAGNOSTICS_READBACK_FAIL ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
}
