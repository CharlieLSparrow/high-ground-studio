#!/usr/bin/env node

import { chmod, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const PRIVACY_BOUNDARY =
  "Privacy boundary: no email, account ID, session or recording ID, source text, filename, file path, credential, access token, or refresh token is included.";

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
    snapshotPath: "",
    outputPath: "",
    maxAgeHours: 24,
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
    if (flag === "--snapshot") options.snapshotPath = value;
    else if (flag === "--output") options.outputPath = value;
    else if (flag === "--max-age-hours") {
      options.maxAgeHours = Number(value);
    } else fail(`Unknown argument: ${flag}`);
    index += 1;
  }
  if (options.help) return options;
  if (!clean(options.snapshotPath)) fail("--snapshot is required.");
  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0 || options.maxAgeHours > 168) {
    fail("--max-age-hours must be greater than 0 and no more than 168.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-physical-install-readback.mjs \\
    --snapshot <shared-support-snapshot.txt> \\
    [--output <owner-only-receipt.json>] \\
    [--max-age-hours 24]

The input is the text Homer shares from Quipsly Capture > Account > Help &
diagnostics. This read-only check proves the exact public release is running on
a physical iPhone with a verified Quipsly session. It deliberately does not
claim recording, consent, camera switching, recovery, upload, or playback.
`;
}

function fieldMap(text) {
  const fields = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = clean(line.slice(0, separator));
    if (!fields.has(key)) fields.set(key, clean(line.slice(separator + 1)));
  }
  return fields;
}

function requiredField(fields, name) {
  const value = clean(fields.get(name));
  if (!value) fail(`The support snapshot is missing ${name}.`);
  return value;
}

function assertPrivacyBoundary(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (!lines.includes(PRIVACY_BOUNDARY)) {
    fail("The exact Quipsly support-snapshot privacy boundary is missing.");
  }
  const inspectable = lines.filter((line) => line !== PRIVACY_BOUNDARY).join("\n");
  const forbidden = [
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
    /\b(?:access|refresh)[-_ ]?token\s*:/i,
    /\b(?:account|session|recording|source) id\s*:/i,
    /\b(?:file ?name|file ?path|credential)\s*:/i,
  ];
  if (forbidden.some((pattern) => pattern.test(inspectable))) {
    fail("The shared support snapshot contains a forbidden private field.");
  }
}

export function inspectPhysicalInstallSnapshot({
  text,
  auditedAt = new Date(),
  maxAgeHours = 24,
}) {
  const normalizedText = String(text || "").replaceAll("\u0000", "");
  if (Buffer.byteLength(normalizedText, "utf8") > 32_768) {
    fail("The support snapshot is unexpectedly large.");
  }
  const firstLine = clean(normalizedText.split(/\r?\n/, 1)[0]);
  if (firstLine !== "Quipsly Capture support snapshot") {
    fail("The file is not a Quipsly Capture support snapshot.");
  }
  assertPrivacyBoundary(normalizedText);
  const fields = fieldMap(normalizedText);
  const createdRaw = requiredField(fields, "Created");
  const createdAt = new Date(createdRaw);
  if (!Number.isFinite(createdAt.getTime())) fail("Created must be an ISO-8601 timestamp.");
  const auditedDate = auditedAt instanceof Date ? auditedAt : new Date(auditedAt);
  if (!Number.isFinite(auditedDate.getTime())) fail("auditedAt must be a valid timestamp.");
  const ageMilliseconds = auditedDate.getTime() - createdAt.getTime();
  if (ageMilliseconds < -5 * 60 * 1000) {
    fail("The support snapshot timestamp is unexpectedly in the future.");
  }
  if (ageMilliseconds > maxAgeHours * 60 * 60 * 1000) {
    fail(`The support snapshot is older than ${maxAgeHours} hours.`);
  }

  const appLine = requiredField(fields, "App");
  const appMatch = appLine.match(/^([0-9]+(?:\.[0-9]+)*) \(([0-9]+)\)$/);
  if (!appMatch) fail("App must contain an exact version and numeric build.");
  const [, version, build] = appMatch;
  const deviceModel = requiredField(fields, "Device");
  const systemLine = requiredField(fields, "System");
  const systemMatch = systemLine.match(/^iOS ([0-9]+(?:\.[0-9]+){0,2})$/);
  const surface = requiredField(fields, "Surface");
  const accountAccessMode = requiredField(fields, "Account access");
  const nestHost = requiredField(fields, "Nest host");
  const previewMode = requiredField(fields, "Preview mode");

  const checks = {
    exactRelease:
      version === QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion
      && build === QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    physicalIPhone: /^iPhone[0-9]+,[0-9]+$/.test(deviceModel),
    iosRuntime: Boolean(systemMatch),
    accountSurface: surface === "Account",
    authenticatedAccess: ["online", "offlineCachedIdentity"].includes(accountAccessMode),
    productionNest: nestHost === "nest.quipsly.com",
    productionMode: previewMode === "no",
    privacyBoundaryPresent: true,
    snapshotFresh: true,
  };
  const ok = Object.values(checks).every(Boolean);
  const blockers = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    schema: "quipsly-capture-physical-install-readback-v1",
    checkedAt: auditedDate.toISOString(),
    ok,
    target: {
      appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
      appName: QUIPSLY_CAPTURE_RELEASE_TARGET.appName,
      bundleId: QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
      version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
      build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
      buildId: QUIPSLY_CAPTURE_RELEASE_TARGET.buildId,
    },
    snapshot: {
      createdAt: createdAt.toISOString(),
      ageSeconds: Math.max(0, Math.floor(ageMilliseconds / 1000)),
      surface,
      appVersion: version,
      appBuild: build,
      deviceModel,
      systemName: systemMatch ? "iOS" : "unknown",
      systemVersion: systemMatch?.[1] || "unknown",
      accountAccessMode,
      nestHost,
      audioCaptureState: clean(fields.get("Audio capture")) || "unknown",
      videoCaptureState: clean(fields.get("Video capture")) || "unknown",
      roomState: clean(fields.get("Live room")) || "unknown",
      audioRoutePortType: clean(fields.get("Audio route type")) || "unknown",
      localOriginalCount: clean(fields.get("Local originals")) || "unknown",
      recoverableUploadCount: clean(fields.get("Recoverable uploads")) || "unknown",
      previewMode,
    },
    checks,
    blockers,
    physicalInstallAndAuthenticationProven: ok,
    physicalCaptureAcceptanceProven: false,
    claimsNotMade: [
      "recording consent granted",
      "microphone or camera fidelity",
      "front/back camera switching",
      "pause/resume or interruption recovery",
      "upload and server verification",
      "assembled playback or timeline alignment",
    ],
    sensitiveFieldsPrinted: false,
    rawSnapshotRetainedInReceipt: false,
    externalMutation: false,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const text = await readFile(options.snapshotPath, "utf8");
  const receipt = inspectPhysicalInstallSnapshot({
    text,
    maxAgeHours: options.maxAgeHours,
  });
  if (options.outputPath) {
    await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(options.outputPath, 0o600);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `QUIPSLY_CAPTURE_PHYSICAL_INSTALL_READBACK_FAIL ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
}
