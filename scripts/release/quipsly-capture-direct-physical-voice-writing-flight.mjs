#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const APP_BUNDLE_ID = "com.highgroundodyssey.HighGroundCapture";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const readbackScript = path.join(
  scriptDirectory,
  "quipsly-capture-physical-voice-writing-readback.mjs",
);

function fail(message) {
  throw new Error(message);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    device: "",
    appPath: "",
    expectedBuild: "",
    outputPath: "",
    timeoutSeconds: 180,
    pollSeconds: 2,
    skipInstall: false,
    forceDirectRecorder: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--skip-install") {
      options.skipInstall = true;
      continue;
    }
    if (flag === "--force-direct-recorder") {
      options.forceDirectRecorder = true;
      continue;
    }
    const value = valueAfter(argv, index, flag);
    if (flag === "--device") options.device = value;
    else if (flag === "--app") options.appPath = value;
    else if (flag === "--expected-build") options.expectedBuild = value;
    else if (flag === "--output") options.outputPath = value;
    else if (flag === "--timeout-seconds") options.timeoutSeconds = Number(value);
    else if (flag === "--poll-seconds") options.pollSeconds = Number(value);
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  if (options.help) return options;
  if (!options.device) fail("--device is required.");
  if (!options.skipInstall && !options.appPath) {
    fail("--app is required unless --skip-install is used.");
  }
  if (!options.outputPath) fail("--output is required so physical evidence is retained.");
  if (options.expectedBuild && !/^\d+$/.test(options.expectedBuild)) {
    fail("--expected-build must be numeric.");
  }
  if (!Number.isFinite(options.timeoutSeconds)
      || options.timeoutSeconds < 30
      || options.timeoutSeconds > 600) {
    fail("--timeout-seconds must be between 30 and 600.");
  }
  if (!Number.isFinite(options.pollSeconds)
      || options.pollSeconds < 0.5
      || options.pollSeconds > 10) {
    fail("--poll-seconds must be between 0.5 and 10.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-direct-physical-voice-writing-flight.mjs \\
    --device <CoreDevice ID, UDID, or name> \\
    --app <signed Debug HighGroundCapture.app> \\
    --expected-build 69 \\
    --output <owner-only evidence.json>

Options:
  --skip-install          Exercise the already-installed Debug app.
  --force-direct-recorder Isolate the AVAudioRecorder fallback from live preview.
  --timeout-seconds <n>   Overall receipt wait, 30-600 (default 180).
  --poll-seconds <n>      Readback interval, 0.5-10 (default 2).

This direct-device flight avoids XCTest's UI-automation passcode gate. It
launches the Debug-only source-first acceptance path, waits for one fresh
attempt, and requires independently pulled playable audio plus nonempty
on-device timed text bound to those exact source bytes. Grant Apple's ordinary
microphone and speech permissions on the device if prompted, then speak for
the seven-second take. Transcript words are never printed or retained in the
evidence receipt.
`;
}

export function physicalFlightStateMessage(receipt) {
  if (!receipt) return "Waiting for the app's protected acceptance receipt.";
  if (receipt.phase === "requested") {
    return receipt.detail?.startsWith("Recording begins in ")
      ? receipt.detail
      : "Waiting for microphone permission and recorder activation on the device.";
  }
  if (receipt.phase === "recording") {
    return "Recording on the physical device now; speak for the seven-second take.";
  }
  if (receipt.phase === "start-failed") {
    return `Recorder start failed${receipt.detail ? `: ${receipt.detail}` : "."}`;
  }
  if (receipt.phase === "cancelled") {
    return `The physical take was cancelled${receipt.detail ? `: ${receipt.detail}` : "."}`;
  }
  if (receipt.captureAcceptanceProven
      && receipt.sourceAudioLikelySilent
      && receipt.transcriptState === "failed"
      && !receipt.transcriptAcceptanceReady) {
    return "Audio is saved, but the source is very quiet and on-device recognition found no speech; speak near the device and run a fresh take.";
  }
  if (receipt.captureAcceptanceProven
      && receipt.sourceAudioLikelySilent
      && !receipt.transcriptAcceptanceReady) {
    return "Audio is saved but very quiet; waiting for exact-source transcript evidence before deciding whether the take is usable.";
  }
  if (receipt.captureAcceptanceProven && !receipt.transcriptAcceptanceReady) {
    return "Audio is saved and playable; waiting for the exact-source on-device transcript.";
  }
  if (receipt.transcriptAcceptanceReady && !receipt.sourceBoundTranscriptProven) {
    return "Transcript metadata is ready; independently reading its protected exact-source sidecar.";
  }
  if (receipt.sourceBoundTranscriptProven) {
    return "Physical source and source-bound on-device transcript are proven.";
  }
  return `Observed physical acceptance phase ${receipt.phase || "unknown"}.`;
}

export function physicalFlightIsComplete(receipt) {
  return receipt?.captureAcceptanceProven === true
    && receipt?.sourceAudioRead === true
    && receipt?.sourceAudioPlayable === true
    && receipt?.transcriptContentRead === true
    && receipt?.sourceBoundTranscriptProven === true
    && receipt?.transcriptionRanOnDevice === true
    && Number.isSafeInteger(receipt?.transcriptCharacterCount)
    && receipt.transcriptCharacterCount > 0;
}

async function readPlistValue(appPath, key) {
  const { stdout } = await execFileAsync("/usr/bin/plutil", [
    "-extract",
    key,
    "raw",
    "-o",
    "-",
    path.join(appPath, "Info.plist"),
  ], { timeout: 10_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function readback(device, expectedBuild, outputPath = "", strict = false) {
  const args = [
    readbackScript,
    "--device",
    device,
    "--max-age-minutes",
    "5",
  ];
  if (expectedBuild) args.push("--expected-build", expectedBuild);
  if (strict) args.push("--require-transcript-proof");
  if (outputPath) args.push("--output", outputPath);
  try {
    const { stdout } = await execFileAsync(process.execPath, args, {
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const outputPath = path.resolve(options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let expectedBuild = options.expectedBuild;
  if (!options.skipInstall) {
    const appPath = path.resolve(options.appPath);
    const appStat = await stat(appPath).catch(() => null);
    assert(appStat?.isDirectory(), `Signed app bundle is unavailable at ${appPath}.`);
    assert.equal(
      await readPlistValue(appPath, "CFBundleIdentifier"),
      APP_BUNDLE_ID,
      "The supplied app bundle is not Quipsly Capture.",
    );
    const appBuild = await readPlistValue(appPath, "CFBundleVersion");
    if (expectedBuild) {
      assert.equal(appBuild, expectedBuild, "The supplied app build does not match --expected-build.");
    } else {
      expectedBuild = appBuild;
    }
    process.stderr.write(`[physical voice writing] installing Debug build ${appBuild} on ${options.device}\n`);
    await execFileAsync("xcrun", [
      "devicectl",
      "device",
      "install",
      "app",
      "--device",
      options.device,
      "--timeout",
      "120",
      appPath,
    ], { timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
  }

  const previous = await readback(options.device, expectedBuild);
  const previousAttemptID = previous?.attemptID || null;
  process.stderr.write("[physical voice writing] launching the direct source-first acceptance path\n");
  const launchArguments = [
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    options.device,
    "--terminate-existing",
    "--timeout",
    "60",
    APP_BUNDLE_ID,
    "--capture-runtime-writing-link=quipsly://write",
    "--capture-physical-voice-writing-acceptance",
  ];
  if (options.forceDirectRecorder) {
    launchArguments.push("--capture-force-voice-writing-recorder-fallback");
  }
  await execFileAsync("xcrun", launchArguments, {
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const deadline = Date.now() + options.timeoutSeconds * 1_000;
  let lastState = "";
  let current = null;
  while (Date.now() < deadline) {
    current = await readback(options.device, expectedBuild);
    const isFreshAttempt = current?.attemptID && current.attemptID !== previousAttemptID;
    if (isFreshAttempt) {
      const state = physicalFlightStateMessage(current);
      if (state !== lastState) {
        process.stderr.write(`[physical voice writing] ${state}\n`);
        lastState = state;
      }
      if (["start-failed", "cancelled"].includes(current.phase)) fail(state);
      if (current.captureAcceptanceProven
          && current.sourceAudioLikelySilent
          && current.transcriptState === "failed"
          && !current.transcriptAcceptanceReady) {
        fail(state);
      }
      if (physicalFlightIsComplete(current)) break;
    } else if (!lastState) {
      lastState = physicalFlightStateMessage(null);
      process.stderr.write(`[physical voice writing] ${lastState}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollSeconds * 1_000));
  }
  if (!current?.attemptID || current.attemptID === previousAttemptID) {
    fail("Quipsly did not create a fresh physical acceptance attempt after direct launch.");
  }
  if (!physicalFlightIsComplete(current)) {
    fail(`Physical voice-writing proof timed out. ${physicalFlightStateMessage(current)}`);
  }

  const strictReceipt = await readback(
    options.device,
    expectedBuild,
    outputPath,
    true,
  );
  assert.equal(
    strictReceipt.attemptID,
    current.attemptID,
    "Strict readback returned a different physical acceptance attempt.",
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "quipsly-direct-physical-voice-writing-flight-v1",
    device: options.device,
    appBuild: strictReceipt.appBuild,
    recorderPath: options.forceDirectRecorder ? "av-audio-recorder" : "live-preview-when-available",
    attemptID: strictReceipt.attemptID,
    recordingID: strictReceipt.recordingID,
    sourceAudioDurationSeconds: strictReceipt.sourceAudioDurationSeconds,
    sourceAudioCodec: strictReceipt.sourceAudioCodec,
    sourceAudioSampleRate: strictReceipt.sourceAudioSampleRate,
    sourceAudioChannels: strictReceipt.sourceAudioChannels,
    transcriptCharacterCount: strictReceipt.transcriptCharacterCount,
    transcriptionRanOnDevice: strictReceipt.transcriptionRanOnDevice,
    sourceBoundTranscriptProven: strictReceipt.sourceBoundTranscriptProven,
    transcriptWordsDisclosed: false,
    outputPath,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`QUIPSLY_DIRECT_PHYSICAL_VOICE_WRITING_FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
