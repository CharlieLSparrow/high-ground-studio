#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const options = parseArguments(process.argv.slice(2));
const bearerToken = requiredEnvironment("QUIPSLY_BEARER_TOKEN");
const baseUrl = controlPlaneOrigin(options.baseUrl);
const runnerPath = resolve(process.env.QUIPSLY_EVALUATION_RUNNER_PATH?.trim()
  || new URL("./quipsly-transcript-provider-runner.mjs", import.meta.url).pathname);
let stopping = false;
let activeChild = null;

await mkdir(resolve(options.evidenceDir), { recursive: true, mode: 0o700 });

do {
  const claim = await post({
    operation: "claim-run",
    workerId: options.workerId,
    leaseSeconds: options.leaseSeconds,
  });
  if (!claim.lease) {
    if (options.once) break;
    await delay(options.pollMilliseconds);
    continue;
  }
  await operateLease(claim.lease);
  if (options.once) break;
} while (!stopping);

async function operateLease(lease) {
  validateLease(lease);
  const workingDirectory = await mkdtemp(join(tmpdir(), "quipsly-evaluation-lease-"));
  const inputPath = join(workingDirectory, "runner-input.json");
  const runKey = lease.run.runKey;
  await writeFile(inputPath, `${JSON.stringify(lease.runnerInput)}\n`, { flag: "wx", mode: 0o600 });
  let heartbeatFailure = null;
  const heartbeat = setInterval(() => {
    void post({
      operation: "heartbeat-run",
      runId: lease.run.id,
      leaseToken: lease.token,
      leaseSeconds: options.leaseSeconds,
    }).catch((error) => {
      heartbeatFailure = error instanceof Error ? error : new Error("Evaluation lease heartbeat failed.");
      if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM");
    });
  }, options.heartbeatMilliseconds);
  heartbeat.unref();
  try {
    process.stdout.write(`START transcript evaluation ${lease.run.id} attempt ${lease.run.attemptCount}\n`);
    const result = await runProviderRunner({ inputPath, runKey });
    if (heartbeatFailure) throw heartbeatFailure;
    await post({ operation: "complete-run", runId: lease.run.id, leaseToken: lease.token });
    process.stdout.write(`PASS transcript evaluation ${lease.run.id} ${result.windowCount} candidate arms\n`);
  } catch (error) {
    const message = sanitizeMessage(error);
    try {
      const failure = await post({
        operation: "fail-run",
        runId: lease.run.id,
        leaseToken: lease.token,
        errorCode: failureCode(error),
        errorMessage: message,
        retryable: retryableFailure(error),
      });
      process.stderr.write(`${failure.retryQueued ? "RETRY" : "FAIL"} transcript evaluation ${lease.run.id} ${message}\n`);
    } catch (commitError) {
      process.stderr.write(`LEASE-LOST transcript evaluation ${lease.run.id} ${sanitizeMessage(commitError)}\n`);
    }
  } finally {
    clearInterval(heartbeat);
    activeChild = null;
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function runProviderRunner({ inputPath, runKey }) {
  const args = [
    "--experimental-strip-types",
    "--import", resolve(new URL("./register-ts-extension-loader.mjs", import.meta.url).pathname),
    runnerPath,
    "--provider", "local-whisper",
    "--terminology-experiment",
    "--input", inputPath,
    "--base-url", baseUrl,
    "--run-key", runKey,
    "--policy", resolve(options.policy),
    "--evidence-dir", resolve(options.evidenceDir),
    "--whisper-executable", resolve(options.whisperExecutable),
    "--whisper-model", options.whisperModel,
    "--whisper-device", options.whisperDevice,
    "--language", options.language,
  ];
  let stdout = "";
  let stderr = "";
  const exit = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-4_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-32_000); });
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  if (exit.code !== 0) {
    const error = new Error(`Provider runner exited ${exit.code ?? exit.signal}: ${sanitizeMessage(stderr || stdout)}`);
    error.runnerExitCode = exit.code;
    throw error;
  }
  const summary = JSON.parse(stdout);
  if (summary?.kind !== "quipsly-transcript-provider-run-summary-v1" || summary?.experiment !== "terminology") {
    throw new Error("Provider runner returned an invalid matched-experiment summary.");
  }
  return summary;
}

async function post(body) {
  const response = await fetch(`${baseUrl}/api/transcript-evaluation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `Evaluation control plane returned HTTP ${response.status}.`);
    error.errorCode = payload.errorCode;
    error.httpStatus = response.status;
    throw error;
  }
  return payload;
}

function validateLease(lease) {
  if (
    lease?.schema !== "quipsly-transcript-evaluation-runner-lease-v1"
    || !lease.run?.id
    || !lease.run?.runKey
    || !lease.token
    || lease.runnerInput?.kind !== "quipsly-private-transcript-evaluation-runner-input-v1"
    || !Array.isArray(lease.runnerInput?.windows)
    || !lease.runnerInput.windows.length
  ) throw new Error("Nest returned an invalid transcript evaluation lease.");
}

function failureCode(error) {
  const provided = typeof error?.errorCode === "string" ? error.errorCode.toLowerCase().replace(/[^a-z0-9._-]+/g, "-") : "";
  return (provided || "evaluation-worker-failure").slice(0, 128);
}

function retryableFailure(error) {
  const message = sanitizeMessage(error).toLowerCase();
  if (error?.httpStatus === 401 || error?.httpStatus === 403 || error?.httpStatus === 409) return false;
  return ![
    "invalid transcript evaluation lease",
    "no valid frozen terminology",
    "does not support prompt terminology",
    "does not match current immutable evidence",
    "invalid matched-experiment summary",
  ].some((needle) => message.includes(needle));
}

function sanitizeMessage(error) {
  return (error instanceof Error ? error.message : String(error || "Unknown evaluation worker failure."))
    .replaceAll(process.env.QUIPSLY_BEARER_TOKEN || "__never__", "[redacted]")
    .slice(0, 2_000);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required and is never accepted as a command-line argument.`);
  return value;
}

function controlPlaneOrigin(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("--base-url must use HTTPS except for an explicit loopback development address.");
  }
  return url.origin;
}

function parseArguments(args) {
  const parsed = {
    baseUrl: "http://127.0.0.1:3012",
    policy: "",
    evidenceDir: "",
    workerId: `local-${hostname().replace(/[^A-Za-z0-9._-]+/g, "-")}-${process.pid}`,
    whisperExecutable: process.env.QUIPSLY_LOCAL_WHISPER_EXECUTABLE?.trim()
      || "/opt/homebrew/Caskroom/miniconda/base/bin/whisper",
    whisperModel: process.env.QUIPSLY_LOCAL_WHISPER_MODEL?.trim() || "large-v3-turbo",
    whisperDevice: process.env.QUIPSLY_LOCAL_WHISPER_DEVICE?.trim() || "cpu",
    language: process.env.QUIPSLY_LOCAL_WHISPER_LANGUAGE?.trim() || "en",
    leaseSeconds: 1800,
    heartbeatMilliseconds: 120_000,
    pollMilliseconds: 5_000,
    once: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--base-url") parsed.baseUrl = args[++index] ?? "";
    else if (argument === "--policy") parsed.policy = args[++index] ?? "";
    else if (argument === "--evidence-dir") parsed.evidenceDir = args[++index] ?? "";
    else if (argument === "--worker-id") parsed.workerId = args[++index] ?? "";
    else if (argument === "--whisper-executable") parsed.whisperExecutable = args[++index] ?? "";
    else if (argument === "--whisper-model") parsed.whisperModel = args[++index] ?? "";
    else if (argument === "--whisper-device") parsed.whisperDevice = args[++index] ?? "";
    else if (argument === "--language") parsed.language = args[++index] ?? "";
    else if (argument === "--lease-seconds") parsed.leaseSeconds = Number(args[++index]);
    else if (argument === "--heartbeat-ms") parsed.heartbeatMilliseconds = Number(args[++index]);
    else if (argument === "--poll-ms") parsed.pollMilliseconds = Number(args[++index]);
    else if (argument === "--once") parsed.once = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: QUIPSLY_BEARER_TOKEN=... pnpm quipsly:transcript:evaluation-worker -- --policy POLICY.json --evidence-dir PRIVATE_DIR [--once]\n");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (!parsed.policy || !parsed.evidenceDir) throw new Error("--policy and --evidence-dir are required.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(parsed.workerId)) throw new Error("--worker-id is invalid.");
  if (!Number.isSafeInteger(parsed.leaseSeconds) || parsed.leaseSeconds < 60 || parsed.leaseSeconds > 3600) throw new Error("--lease-seconds must be 60–3600.");
  if (!Number.isSafeInteger(parsed.heartbeatMilliseconds) || parsed.heartbeatMilliseconds < 1_000 || parsed.heartbeatMilliseconds >= parsed.leaseSeconds * 1000) throw new Error("--heartbeat-ms must be at least 1000 and shorter than the lease.");
  if (!Number.isSafeInteger(parsed.pollMilliseconds) || parsed.pollMilliseconds < 500 || parsed.pollMilliseconds > 60_000) throw new Error("--poll-ms must be 500–60000.");
  return parsed;
}

function stop() {
  stopping = true;
  if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
