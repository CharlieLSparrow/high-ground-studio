#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const SCHEMA = "quipsly-physical-voice-writing-acceptance-v1";
const APP_BUNDLE_ID = "com.highgroundodyssey.HighGroundCapture";
const DEVICE_RECEIPT_PATH =
  "Library/Application Support/QuipslyCapture/PhysicalVoiceWritingAcceptance/latest.json";
const DEVICE_RECORDINGS_PATH = "Documents/Recordings";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIO_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,239}\.(m4a|aac|caf|wav)$/i;
const TERMINAL_PHASES = new Set(["start-failed", "cancelled", "finished"]);
const PLAYABLE_LOCAL_STATUSES = new Set([
  "saved",
  "queued",
  "uploading",
  "awaitingVerification",
  "uploaded",
  "uploadHeld",
  "recovered",
]);

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
  const options = {
    device: "",
    receiptPath: "",
    outputPath: "",
    expectedBuild: "",
    maxAgeMinutes: 30,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--device") options.device = value;
    else if (flag === "--receipt") options.receiptPath = value;
    else if (flag === "--output") options.outputPath = value;
    else if (flag === "--expected-build") options.expectedBuild = value;
    else if (flag === "--max-age-minutes") options.maxAgeMinutes = Number(value);
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  if (options.help) return options;
  if (Boolean(clean(options.device)) === Boolean(clean(options.receiptPath))) {
    fail("Provide exactly one of --device or --receipt.");
  }
  if (!Number.isFinite(options.maxAgeMinutes) || options.maxAgeMinutes <= 0 || options.maxAgeMinutes > 1_440) {
    fail("--max-age-minutes must be greater than 0 and no more than 1440.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-physical-voice-writing-readback.mjs \\
    --device <CoreDevice ID, UDID, or name> [--expected-build 69]

  node scripts/release/quipsly-capture-physical-voice-writing-readback.mjs \\
    --receipt <already-pulled-latest.json> [--expected-build 69]

Options:
  --output <path>          Write an owner-only normalized receipt.
  --max-age-minutes <n>   Reject stale device evidence (default 30).

The device form reads only the Debug physical-acceptance receipt from Quipsly
Capture's own app data container. It does not read audio or transcript content,
and it cannot run against an App Store build because that build contains no
acceptance harness.
`;
}

export function inspectPhysicalVoiceWritingReceipt(value, {
  auditedAt = new Date(),
  expectedBuild = "",
  maxAgeMinutes = 30,
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("The physical voice-writing receipt must be a JSON object.");
  }
  if (value.schema !== SCHEMA) fail("The physical voice-writing receipt schema is not supported.");
  const phase = clean(value.phase);
  if (!["requested", "start-failed", "recording", "cancelled", "finished"].includes(phase)) {
    fail("The physical voice-writing receipt phase is invalid.");
  }
  const attemptID = clean(value.attemptID);
  const sessionID = clean(value.sessionID);
  const appBuild = clean(value.appBuild);
  const captureState = clean(value.captureState);
  const recordingID = clean(value.recordingID) || null;
  if (!UUID_PATTERN.test(attemptID)) fail("The physical acceptance attempt ID is invalid.");
  if (!sessionID || sessionID.length > 240) fail("The physical acceptance Session ID is invalid.");
  if (!/^\d+$/.test(appBuild)) fail("The physical acceptance app build is invalid.");
  if (expectedBuild && appBuild !== String(expectedBuild)) {
    fail(`Expected app build ${expectedBuild}, received ${appBuild}.`);
  }
  if (!captureState) fail("The physical acceptance capture state is missing.");
  if (recordingID && !UUID_PATTERN.test(recordingID)) fail("The physical acceptance recording ID is invalid.");

  const recordedAt = new Date(value.recordedAt);
  const auditDate = auditedAt instanceof Date ? auditedAt : new Date(auditedAt);
  if (!Number.isFinite(recordedAt.getTime()) || !Number.isFinite(auditDate.getTime())) {
    fail("The physical acceptance receipt timestamp is invalid.");
  }
  const ageMilliseconds = auditDate.getTime() - recordedAt.getTime();
  if (ageMilliseconds < -5 * 60_000) fail("The physical acceptance receipt is unexpectedly in the future.");
  if (ageMilliseconds > maxAgeMinutes * 60_000) fail("The physical acceptance receipt is stale.");

  const durationSeconds = Number.isFinite(value.durationSeconds) ? value.durationSeconds : null;
  const localStatus = clean(value.localStatus) || null;
  const sourceFileName = clean(value.sourceFileName) || null;
  const sourceByteCount = Number.isSafeInteger(value.sourceByteCount) ? value.sourceByteCount : null;
  if (sourceFileName && (!AUDIO_FILE_NAME_PATTERN.test(sourceFileName) || sourceFileName.includes(".."))) {
    fail("The physical acceptance source file name is invalid.");
  }
  if (sourceByteCount !== null && sourceByteCount <= 0) {
    fail("The physical acceptance source byte count is invalid.");
  }
  const saved = value.saved === true;
  const phaseContractValid = phase === "requested"
    ? !recordingID && saved === false
    : phase === "recording"
      ? Boolean(recordingID) && captureState === "recording" && saved === false
      : phase !== "finished" || (
      Boolean(recordingID)
      && captureState === "saved"
      && saved
      && durationSeconds !== null
      && durationSeconds >= 1
      && PLAYABLE_LOCAL_STATUSES.has(localStatus)
      && Boolean(sourceFileName)
      && AUDIO_FILE_NAME_PATTERN.test(sourceFileName)
      && !sourceFileName.includes("..")
      && sourceByteCount !== null
      && sourceByteCount > 0
    );
  if (!phaseContractValid) {
    fail(`The ${phase} receipt contradicts its recording evidence.`);
  }

  const captureAcceptanceProven = phase === "finished" && phaseContractValid;
  return {
    schema: "quipsly-capture-physical-voice-writing-readback-v1",
    checkedAt: auditDate.toISOString(),
    ok: true,
    appBuild,
    attemptID,
    phase,
    terminal: TERMINAL_PHASES.has(phase),
    sessionID,
    recordingID,
    captureState,
    durationSeconds,
    localStatus,
    sourceFileName,
    sourceByteCount,
    saved,
    detail: clean(value.detail) || null,
    ageSeconds: Math.max(0, Math.floor(ageMilliseconds / 1_000)),
    observedPhase: phase,
    phaseContractValid,
    recordingPhaseObserved: phase === "recording",
    terminalPhaseObserved: TERMINAL_PHASES.has(phase),
    captureAcceptanceProven,
    sourceAudioRead: false,
    sourceAudioPlayable: false,
    sourceAudioSHA256: null,
    sourceAudioDurationSeconds: null,
    sourceAudioCodec: null,
    sourceAudioSampleRate: null,
    sourceAudioChannels: null,
    transcriptContentRead: false,
    externalMutation: false,
  };
}

async function pullAndInspectSource(device, receipt, destination) {
  if (!receipt.sourceFileName || !receipt.sourceByteCount) {
    fail("Finished device evidence does not identify a source file.");
  }
  await execFileAsync("xcrun", [
    "devicectl",
    "device",
    "copy",
    "from",
    "--device",
    device,
    "--domain-type",
    "appDataContainer",
    "--domain-identifier",
    APP_BUNDLE_ID,
    "--source",
    `${DEVICE_RECORDINGS_PATH}/${receipt.sourceFileName}`,
    "--destination",
    destination,
  ], { maxBuffer: 1024 * 1024, timeout: 30_000 });

  const bytes = await readFile(destination);
  if (bytes.byteLength !== receipt.sourceByteCount) {
    fail(`Pulled source byte count ${bytes.byteLength} does not match receipt ${receipt.sourceByteCount}.`);
  }
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,sample_rate,channels",
    "-of", "json",
    destination,
  ], { maxBuffer: 1024 * 1024, timeout: 30_000 });
  const probe = JSON.parse(stdout);
  const audioStream = Array.isArray(probe.streams)
    ? probe.streams.find((stream) => stream?.codec_type === "audio")
    : null;
  const decodedDurationSeconds = Number(probe.format?.duration);
  const decodedSize = Number(probe.format?.size);
  if (!audioStream || !Number.isFinite(decodedDurationSeconds) || decodedDurationSeconds < 1) {
    fail("The pulled source does not contain a decodable audio stream of at least one second.");
  }
  if (!Number.isSafeInteger(decodedSize) || decodedSize !== bytes.byteLength) {
    fail("The decoded source size does not match the pulled source bytes.");
  }
  return {
    sourceAudioRead: true,
    sourceAudioPlayable: true,
    sourceAudioSHA256: createHash("sha256").update(bytes).digest("hex"),
    sourceAudioDurationSeconds: decodedDurationSeconds,
    sourceAudioCodec: clean(audioStream.codec_name) || null,
    sourceAudioSampleRate: Number(audioStream.sample_rate) || null,
    sourceAudioChannels: Number(audioStream.channels) || null,
  };
}

async function pullReceipt(device, destination) {
  await execFileAsync("xcrun", [
    "devicectl",
    "device",
    "copy",
    "from",
    "--device",
    device,
    "--domain-type",
    "appDataContainer",
    "--domain-identifier",
    APP_BUNDLE_ID,
    "--source",
    DEVICE_RECEIPT_PATH,
    "--destination",
    destination,
  ], { maxBuffer: 1024 * 1024, timeout: 30_000 });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  let temporaryDirectory = null;
  try {
    let receiptPath = options.receiptPath;
    if (options.device) {
      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "quipsly-physical-writing-"));
      receiptPath = path.join(temporaryDirectory, "latest.json");
      await pullReceipt(options.device, receiptPath);
    }
    const source = JSON.parse(await readFile(receiptPath, "utf8"));
    let receipt = inspectPhysicalVoiceWritingReceipt(source, {
      expectedBuild: options.expectedBuild,
      maxAgeMinutes: options.maxAgeMinutes,
    });
    if (options.device && receipt.captureAcceptanceProven) {
      const sourcePath = path.join(temporaryDirectory, receipt.sourceFileName);
      receipt = {
        ...receipt,
        ...await pullAndInspectSource(options.device, receipt, sourcePath),
      };
    }
    if (options.outputPath) {
      await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      await chmod(options.outputPath, 0o600);
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`QUIPSLY_PHYSICAL_VOICE_WRITING_READBACK_FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
