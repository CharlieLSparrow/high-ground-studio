#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_BUNDLE_ID = "com.highgroundodyssey.HighGroundCapture";
const LEDGER_SOURCE = "Library/Application Support/QuipslyCapture/Diagnostics/capture-attention-v1.json";

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    device: "",
    ledgerPath: "",
    bundleId: DEFAULT_BUNDLE_ID,
    outputPath: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = valueAfter(argv, index, flag);
    if (flag === "--device") options.device = value;
    else if (flag === "--ledger") options.ledgerPath = value;
    else if (flag === "--bundle-id") options.bundleId = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  if (options.help) return options;
  if (Boolean(clean(options.device)) === Boolean(clean(options.ledgerPath))) {
    fail("Provide exactly one of --device or --ledger.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/.test(options.bundleId)) {
    fail("--bundle-id must be a safe application identifier.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-device-attention-readback.mjs --device <name-or-id> [--output <receipt.json>]
  node scripts/release/quipsly-capture-device-attention-readback.mjs --ledger <capture-attention-v1.json> [--output <receipt.json>]

Reads Quipsly Capture's development-only attention ledger and reports the exact
latest failure plus coarse navigation state. It never prints account, Session,
recording, or media identifiers and does not mutate the device.
`;
}

function categoryFor(message) {
  const normalized = clean(message).toLowerCase();
  if (normalized.includes("microphone") || normalized.includes("audio route")) return "microphone-or-audio-route";
  if (normalized.includes("camera")) return "camera";
  if (normalized.includes("permission") || normalized.includes("allow ")) return "system-permission";
  if (/(storage|disk|free space)/.test(normalized)) return "device-storage";
  if (normalized.includes("upload")) return "upload-or-verification";
  if (/(live room|call|join the room)/.test(normalized)) return "call";
  if (/(network|offline|reach nest)/.test(normalized)) return "connection";
  if (/(account|sign in)/.test(normalized)) return "account";
  if (/(session|nest|workspace|that space|selected space)/.test(normalized)) return "session-or-workspace";
  if (/(record|capture)/.test(normalized)) return "recording";
  return "capture-attention";
}

export function inspectAttentionLedger(document, { checkedAt = new Date() } = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) fail("Attention ledger must be an object.");
  if (document.schemaVersion !== 1 || !Array.isArray(document.events)) fail("Unsupported attention ledger schema.");
  if (document.events.length > 200) fail("Attention ledger exceeds its bounded event count.");
  const latest = document.events.at(-1);
  if (!latest) {
    return {
      schema: "quipsly-capture-device-attention-readback-v1",
      checkedAt: new Date(checkedAt).toISOString(),
      eventCount: 0,
      latest: null,
      identifiersPrinted: false,
      deviceMutated: false,
    };
  }
  const occurredAt = new Date(latest.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) fail("Latest attention timestamp is invalid.");
  const message = clean(latest.message);
  if (!message || Buffer.byteLength(message, "utf8") > 8_000) fail("Latest attention message is invalid.");
  const transitions = [
    latest.isRefreshing ? "refreshing" : null,
    latest.isCreatingSession ? "creating-session" : null,
    latest.isChangingCapture ? "changing-capture" : null,
    latest.isChangingRoom ? "changing-room" : null,
  ].filter(Boolean);
  return {
    schema: "quipsly-capture-device-attention-readback-v1",
    checkedAt: new Date(checkedAt).toISOString(),
    eventCount: document.events.length,
    latest: {
      occurredAt: occurredAt.toISOString(),
      category: categoryFor(message),
      message,
      transitionState: transitions.length ? transitions.join(",") : "idle",
      selectedSessionWasLocal: latest.selectedSessionIsLocal === true,
      canonicalSessionCount: Math.max(0, Number(latest.canonicalSessionCount) || 0),
      localDraftSessionCount: Math.max(0, Number(latest.localDraftSessionCount) || 0),
    },
    identifiersPrinted: false,
    deviceMutated: false,
  };
}

async function pullLedger(device, bundleId) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "quipsly-attention-readback-"));
  const destination = path.join(temporaryRoot, "capture-attention-v1.json");
  try {
    await execFileAsync("xcrun", [
      "devicectl", "device", "copy", "from",
      "--device", device,
      "--domain-type", "appDataContainer",
      "--domain-identifier", bundleId,
      "--source", LEDGER_SOURCE,
      "--destination", destination,
      "--quiet",
    ]);
    return JSON.parse(await readFile(destination, "utf8"));
  } catch (error) {
    fail(`Could not read Capture attention from ${device}. The app may not have recorded an attention event yet, or the device may be locked/disconnected. ${clean(error?.stderr)}`.trim());
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const document = options.device
    ? await pullLedger(options.device, options.bundleId)
    : JSON.parse(await readFile(options.ledgerPath, "utf8"));
  const receipt = inspectAttentionLedger(document);
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.outputPath) {
    await writeFile(options.outputPath, rendered, { encoding: "utf8", mode: 0o600 });
    await chmod(options.outputPath, 0o600);
  }
  process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`QUIPSLY_CAPTURE_DEVICE_ATTENTION_READBACK_FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
