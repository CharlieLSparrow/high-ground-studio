#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const localOnly = args.has("--local-only");
const productionBuildNodeOptions = [
  process.env.NODE_OPTIONS
    ?.replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/g, " ")
    .trim(),
  // Keep the readiness path aligned with the exact committed release verifier.
  // The current 160-page Nest graph compiles inside 4 GiB but can exhaust that
  // ceiling while Next collects types and traces after compilation.
  "--max-old-space-size=8192",
].filter(Boolean).join(" ");

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function checkPayload(check) {
  if (Object.hasOwn(check, "payload")) return check.payload;
  return parseJson(check.stdout) || null;
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireGeneratedBuildLock(lockName) {
  if (!lockName) return null;

  const lockRoot = join(ROOT_DIR, ".tmp");
  const lockPath = join(lockRoot, `${lockName}.lock`);
  mkdirSync(lockRoot, { recursive: true });

  for (let attempt = 1; attempt <= 80; attempt += 1) {
    try {
      mkdirSync(lockPath);
      return {
        release() {
          rmSync(lockPath, { force: true, recursive: true });
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      wait(250);
    }
  }

  throw new Error(
    `Timed out waiting for generated build lock ${lockName}. Another readiness build may still be running.`,
  );
}

function cleanGeneratedPaths(paths) {
  for (const cleanPath of paths) {
    const absolutePath = join(ROOT_DIR, cleanPath);
    let lastError = null;

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      try {
        rmSync(absolutePath, {
          force: true,
          maxRetries: 3,
          recursive: true,
          retryDelay: 150,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        wait(150 * attempt);
      }
    }

    if (lastError) {
      throw new Error(
        `Could not clean generated build path ${cleanPath}: ${lastError.message}`,
      );
    }
  }
}

function runCheck(id, command, commandArgs, options = {}) {
  let buildLock = null;

  try {
    buildLock = acquireGeneratedBuildLock(options.lockName);
    cleanGeneratedPaths(options.cleanPaths || []);
  } catch (error) {
    buildLock?.release();
    return {
      id,
      status: "fail",
      exitCode: 1,
      command: [command, ...commandArgs].join(" "),
      summary: options.summary,
      requiredForDeploy: options.requiredForDeploy !== false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  let result;
  try {
    result = spawnSync(command, commandArgs, {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    });
  } finally {
    buildLock?.release();
  }

  const rawStdout = result.stdout?.trim() || "";
  const stdout = rawStdout.slice(0, options.maxOutput || 2400);
  const stderr = result.stderr?.trim() || "";
  const status = result.status === 0 ? "pass" : "fail";

  const check = {
    id,
    status,
    exitCode: result.status,
    command: [command, ...commandArgs].join(" "),
    summary: options.summary,
    requiredForDeploy: options.requiredForDeploy !== false,
    stdout,
    stderr: stderr.slice(0, options.maxOutput || 2400),
  };

  if (options.parseJson) {
    Object.defineProperty(check, "payload", {
      enumerable: false,
      value: parseJson(rawStdout),
    });
  }

  return check;
}

const localCheckRunners = [
  () => runCheck(
    "local-hgo-quipsly-handoff-static-contract",
    "node",
    ["scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs"],
    {
      summary:
      "Local HGO page, disabled legacy APIs, Nest public packet route, and shared coaching contract are wired.",
    },
  ),
  () => runCheck(
    "nest-public-coaching-packet-smoke-syntax",
    "node",
    ["--check", "scripts/quipsly-coaching-public-handoff-smoke.mjs"],
    {
      summary:
        "Nest public coaching packet smoke parses, including public-loop owner, proof-ladder, and safe-action assertions.",
    },
  ),
  () => runCheck(
    "quipsly-production-build",
    "corepack",
    ["pnpm", "--filter", "quipsly", "build"],
    {
      summary:
        "Nest/apps/quipsly production build succeeds, including App Router route-collision, proxy, generated type, and bundle-shape checks.",
      env: {
        DATABASE_URL: process.env.DATABASE_URL
          || "postgresql://quipsly_build:quipsly_build@127.0.0.1:5432/quipsly_build",
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_OPTIONS: productionBuildNodeOptions,
        QUIPSLY_BUILD_DIST_DIR: ".next-release",
      },
      cleanPaths: ["apps/quipsly/.next-release"],
      lockName: "next-production-build",
      maxOutput: 12000,
    },
  ),
  () => runCheck(
    "hgo-production-build",
    "corepack",
    ["pnpm", "--filter", "web", "build"],
    {
      summary:
        "HighGroundOdyssey/apps/web production build succeeds, including public route, handoff page, generated metadata, and bundle-shape checks.",
      env: {
        DATABASE_URL: process.env.DATABASE_URL
          || "postgresql://quipsly_build:quipsly_build@127.0.0.1:5432/quipsly_build",
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_OPTIONS: productionBuildNodeOptions,
        WEB_BUILD_DIST_DIR: ".next-release",
      },
      cleanPaths: ["apps/web/.next-release"],
      lockName: "next-production-build",
      maxOutput: 12000,
    },
  ),
  () => runCheck(
    "capture-reviewer-runway-static-contract",
    "node",
    ["scripts/quipsly-capture-reviewer-runway-static-smoke.mjs"],
    {
      summary:
        "Local reviewer setup path is coherent: admin login setup, coaching reviewer preset, visible-session smoke, review digest, and App Store checklist agree.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "coaching-payment-static-contract",
    "node",
    ["scripts/quipsly-coaching-payment-contract-smoke.mjs", "--static-only", "--json"],
    {
      summary:
        "Local one-to-one coaching payment boundary is coherent: Stripe stays evidence-only, live mode is explicitly guarded, Customer Portal requires customer evidence, and non-IAP-safe products are excluded.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "coaching-lifecycle-static-contract",
    "node",
    ["scripts/quipsly-coaching-lifecycle-static-smoke.mjs"],
    {
      summary:
        "Local coaching lifecycle contract is coherent: booking, payment evidence, capture room, consent, recording, transcript, packet notes, and action items remain app-owned and reviewable.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "coaching-scheduling-static-contract",
    "node",
    ["scripts/quipsly-coaching-scheduling-static-smoke.mjs"],
    {
      summary:
        "Local coaching scheduling contract is coherent: holds, booking conversion, reschedule/cancel, calendar-ready packets, and receipt attachment remain app-owned and provider-evidence-only.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "mobile-capture-source-contract",
    "node",
    ["scripts/quipsly-mobile-capture-contract-smoke.mjs", "--source-only", "--json"],
    {
      summary:
        "Local mobile capture source contract is coherent: upload retention, room join, consent, transcript, packet, review digest, and native decode/UI boundaries agree.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "ios-capture-app-store-static-contract",
    "node",
    ["scripts/quipsly-ios-capture-app-store-static-smoke.mjs"],
    {
      summary:
        "iOS capture App Store static contract is coherent: privacy manifest, permission strings, explicit consent, local retention, reviewer auth, deletion path, and App Review notes agree.",
      maxOutput: 8000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "coaching-capture-schema-readiness",
    "node",
    ["scripts/quipsly-coaching-schema-readiness.mjs", "--json"],
    {
      summary:
        "Target database has the app-owned coaching/capture tables required for authenticated booking, payment, call-room, consent, recording, transcript, note, and action-item writes.",
      requiredForDeploy: false,
      maxOutput: 8000,
      parseJson: true,
    },
  ),
];

const operatorCheckRunners = [
  () => runCheck(
    "operator-gcloud-auth",
    "bash",
    ["scripts/release/quipsly-gcloud-auth-check.sh"],
    {
      summary:
        "Operator gcloud and ADC credentials can access high-ground-odyssey and quipsly-reef.",
    },
  ),
];

const liveCheckRunners = [
  () => runCheck(
    "live-nest-public-coaching-packet",
    "node",
    [
      "scripts/quipsly-coaching-public-handoff-smoke.mjs",
      "--base-url=https://nest.quipsly.com",
      "--json",
    ],
    {
      summary:
        "Live Nest public coaching packet reports ownership, proof ladder, and safe next actions without requiring auth.",
      requiredForDeploy: false,
      maxOutput: 6000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "live-public-route-matrix",
    "node",
    ["scripts/hgo-quipsly-public-route-matrix.mjs", "--warn-only", "--json"],
    {
      summary:
        "Live HGO, Quipsly.com, and Nest route truth is visible without failing the readiness wrapper.",
      requiredForDeploy: false,
      maxOutput: 6000,
      parseJson: true,
    },
  ),
  () => runCheck(
    "live-public-integration-smoke",
    "node",
    ["scripts/hgo-quipsly-public-integration-smoke.mjs", "--warn-only", "--json"],
    {
      summary:
        "Live public integration smoke reports whether HGO home/coaching, Quipsly.com, Nest packet, mobile capture readiness, and review digest agree.",
      requiredForDeploy: false,
      maxOutput: 6000,
      parseJson: true,
    },
  ),
];

const localChecks = localCheckRunners.map((run) => run());
const operatorChecks = localOnly ? [] : operatorCheckRunners.map((run) => run());
const liveChecks = localOnly ? [] : liveCheckRunners.map((run) => run());

const checks = localOnly
  ? localChecks
  : [...operatorChecks, ...localChecks, ...liveChecks];

const deployBlockers = checks.filter(
  (check) => check.requiredForDeploy && check.status !== "pass",
);
const localSourceBlockers = localChecks.filter(
  (check) => check.requiredForDeploy && check.status !== "pass",
);
const runtimeWarnings = checks.filter(
  (check) => !check.requiredForDeploy && check.status !== "pass",
);
const liveRouteMatrix = checks.find((check) => check.id === "live-public-route-matrix");
const liveIntegrationSmoke = checks.find((check) => check.id === "live-public-integration-smoke");
const livePublicPacket = checks.find((check) => check.id === "live-nest-public-coaching-packet");
const liveRouteMatrixPayload = liveRouteMatrix ? checkPayload(liveRouteMatrix) : null;
const liveIntegrationSmokePayload = liveIntegrationSmoke ? checkPayload(liveIntegrationSmoke) : null;
const livePublicPacketPayload = livePublicPacket ? checkPayload(livePublicPacket) : null;
const livePublicIntegrationProven =
  livePublicPacket?.status === "pass" &&
  liveRouteMatrix?.status === "pass" &&
  liveIntegrationSmoke?.status === "pass" &&
  livePublicPacketPayload?.ok === true &&
  liveRouteMatrixPayload?.ok === true &&
  liveIntegrationSmokePayload?.ok === true;
const semanticRuntimeWarnings = checks.filter((check) => {
  if (check.requiredForDeploy) return false;
  const payload = checkPayload(check);
  return payload && payload.ok === false;
});
const livePublicDrift = {
  publicPacketOk: livePublicPacketPayload?.ok === true,
  routeMatrixOk: liveRouteMatrixPayload?.ok === true,
  integrationSmokeOk: liveIntegrationSmokePayload?.ok === true,
  failingPublicPacketChecks: Array.isArray(livePublicPacketPayload?.checks)
    ? livePublicPacketPayload.checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          name: check.name,
          summary: check.summary,
          details: check.details,
        }))
    : [],
  failingRouteMatrixChecks: Array.isArray(liveRouteMatrixPayload?.checks)
    ? liveRouteMatrixPayload.checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          id: check.id,
          owner: check.owner,
          url: check.url,
          httpStatus: check.httpStatus,
          missingMarkers: check.missingMarkers,
          presentStaleMarkers: check.presentStaleMarkers,
          failureSummary: check.failureSummary,
          likelyCause: check.likelyCause,
          nextAction: check.nextAction,
          fixLane: check.fixLane,
          note: check.note,
        }))
    : [],
  failingIntegrationChecks: Array.isArray(liveIntegrationSmokePayload?.checks)
    ? liveIntegrationSmokePayload.checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          name: check.name,
          summary: check.summary,
          details: check.details,
        }))
    : [],
};
const publicDriftWarnings = [
  ...livePublicDrift.failingPublicPacketChecks.map((check) => check.name),
  ...livePublicDrift.failingRouteMatrixChecks.map((check) => check.id),
  ...livePublicDrift.failingIntegrationChecks.map((check) => check.name),
];
const allRuntimeWarnings = [...runtimeWarnings, ...semanticRuntimeWarnings].filter(
  (check, index, warnings) => warnings.findIndex((candidate) => candidate.id === check.id) === index,
);

const localSourceReady = localSourceBlockers.length === 0;
const previewDeployReady = !localOnly && deployBlockers.length === 0;
const liveChecksSkipped = localOnly || (
  !livePublicPacket &&
  !liveRouteMatrix &&
  !liveIntegrationSmoke
);
const liveDriftPresent = !livePublicIntegrationProven && !liveChecksSkipped;
const sourceReadyButLiveUnproven = localSourceReady && !livePublicIntegrationProven;

const readinessState = localOnly
  ? localSourceReady
    ? "source-contract-ready"
    : "source-contract-blocked"
  : deployBlockers.length > 0
    ? "deploy-blocked"
    : livePublicIntegrationProven
      ? "live-public-loop-proven"
      : "preview-deploy-ready-live-drift-present";

const currentTruth = localOnly
  ? localSourceReady
    ? "Local source contracts and builds can be ready, but this local-only run does not prove the public websites."
    : "Local source contracts are blocked; fix those before preview deploy."
  : deployBlockers.length > 0
    ? "Preview deploy is blocked by required deploy checks. Live public state may still be stale."
    : livePublicIntegrationProven
      ? "Local checks, deploy readiness, and live public loop proof agree."
      : "Preview deploy checks pass, but live public routes still need preview/promotion or drift repair before the public loop is proven.";

const nextSafeAction = localOnly
  ? "Run the full release readiness check with operator auth, then preview deploy only if it passes."
  : deployBlockers.length > 0
    ? "Refresh operator credentials, rerun readiness, and do not promote stale services."
    : livePublicIntegrationProven
      ? "Keep receipts and monitor drift; the public loop is currently proven."
      : "Deploy tagged previews, smoke preview URLs, then promote Nest and HGO only after preview smokes pass.";

const promotionPlan = [
  {
    step: "reauth",
    why: "Cloud Build, Cloud Run, Firebase, and live preview smokes all depend on fresh operator and ADC credentials.",
    command: "gcloud auth login --update-adc --brief && bash scripts/release/quipsly-gcloud-auth-check.sh",
  },
  {
    step: "local-contract",
    why: "Prove the local HGO doorway, Nest packet route, shared coaching packet contract, production route tables, and app-owned schema are still aligned before spending Cloud Build time.",
    command: "node scripts/hgo-quipsly-release-readiness.mjs --json",
  },
  {
    step: "nest-preview",
    why: "Deploy Nest/apps/quipsly without moving live traffic so /api/coaching/public, mobile capture readiness, and review digest routes can be smoked on a tagged revision first.",
    command:
      "PROJECT_ID=high-ground-odyssey PREVIEW_TAG=quipsly-web-preview SOURCE_REF=HEAD bash scripts/release/quipsly-deploy-preview.sh",
  },
  {
    step: "hgo-preview",
    why: "Deploy HighGroundOdyssey/apps/web without moving live traffic so /coaching can prove the Quipsly operational handoff before public traffic moves.",
    command:
      "WEB_CLOUD_RUN_PROJECT=high-ground-odyssey WEB_CLOUD_RUN_SERVICE=web node scripts/web-cloud-run-deploy.mjs",
  },
  {
    step: "preview-smoke",
    why: "Resolve the tagged preview URLs and run the Nest packet smoke plus the HGO/Quipsly/Nest integration contract against previews before promotion.",
    command:
      "node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=<nest-preview-url> --json && node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json",
  },
  {
    step: "promote-nest",
    why: "Move Nest traffic only after the Nest preview packet, capture readiness, and review digest route checks pass.",
    command:
      "gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-tags=quipsly-web-preview=100 --quiet",
  },
  {
    step: "promote-hgo",
    why: "Move HGO traffic only after the HGO preview shows the Quipsly coaching handoff.",
    command:
      "gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-tags=web-preview=100 --quiet",
  },
  {
    step: "live-smoke",
    why: "Prove live public state after promotion: HGO teaches/routes, Quipsly.com educates/funnels, and Nest owns operational packet truth.",
    command:
      "node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json && node scripts/hgo-quipsly-public-route-matrix.mjs --json && node scripts/hgo-quipsly-public-integration-smoke.mjs --json",
  },
];

const report = {
  ok: localOnly ? localSourceBlockers.length === 0 : deployBlockers.length === 0,
  mode: localOnly ? "local-only" : "release-readiness",
  readinessState,
  currentTruth,
  nextSafeAction,
  sourceReadyButLiveUnproven,
  liveChecksSkipped,
  liveDriftPresent,
  localSourceReady,
  previewDeployReady,
  livePublicIntegrationProven,
  checkedAt: new Date().toISOString(),
  invariant:
    "HighGroundOdyssey.com teaches and routes. Quipsly.com educates and funnels. Nest owns operational coaching/capture truth.",
  deployBlocked: deployBlockers.length > 0,
  deployBlockers: deployBlockers.map((check) => check.id),
  localSourceBlockers: localSourceBlockers.map((check) => check.id),
  runtimeWarnings: allRuntimeWarnings.map((check) => check.id),
  publicDriftWarnings: [...new Set(publicDriftWarnings)],
  livePublicDrift,
  promotionPlan,
  nextCommands:
    localOnly
      ? [
          "node scripts/hgo-quipsly-release-readiness.mjs --json",
          "gcloud auth login --update-adc --brief",
          "bash scripts/release/quipsly-gcloud-auth-check.sh",
        ]
      : deployBlockers.length > 0
      ? [
          "gcloud auth login --update-adc --brief",
          "bash scripts/release/quipsly-gcloud-auth-check.sh",
          "node scripts/hgo-quipsly-release-readiness.mjs --json",
        ]
      : [
          "PROJECT_ID=high-ground-odyssey PREVIEW_TAG=quipsly-web-preview SOURCE_REF=HEAD bash scripts/release/quipsly-deploy-preview.sh",
          "WEB_CLOUD_RUN_PROJECT=high-ground-odyssey WEB_CLOUD_RUN_SERVICE=web node scripts/web-cloud-run-deploy.mjs",
          "node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json",
        ],
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const headline = localOnly
    ? report.localSourceReady
      ? "LOCAL SOURCE READY"
      : "LOCAL SOURCE BLOCKED"
    : report.deployBlocked
    ? "BLOCKED"
    : report.livePublicIntegrationProven
      ? "PREVIEW-DEPLOY READY / LIVE PROVEN"
      : "PREVIEW-DEPLOY READY / LIVE DRIFT PRESENT";
  console.log(`HGO/Quipsly release readiness: ${headline}`);
  for (const check of checks) {
    const marker = check.status === "pass" ? "PASS" : "FAIL";
    console.log(`${marker} ${check.id}: ${check.summary}`);
  }
  if (report.deployBlocked) {
    console.log("Deploy blocked by:");
    for (const blocker of report.deployBlockers) console.log(`- ${blocker}`);
  }
  if (report.runtimeWarnings.length > 0) {
    console.log("Runtime warnings:");
    for (const warning of report.runtimeWarnings) console.log(`- ${warning}`);
  }
  if (!report.livePublicIntegrationProven) {
    console.log(report.currentTruth);
    console.log(`Next safe action: ${report.nextSafeAction}`);
    const failures = [
      ...report.livePublicDrift.failingPublicPacketChecks.map((check) => check.name),
      ...report.livePublicDrift.failingRouteMatrixChecks.map((check) => check.id),
      ...report.livePublicDrift.failingIntegrationChecks.map((check) => check.name),
    ];
    if (failures.length > 0) {
      console.log(`Live drift checks: ${[...new Set(failures)].join(", ")}`);
    }
  }
  console.log("Next commands:");
  for (const command of report.nextCommands) console.log(`  ${command}`);
}

process.exitCode = report.ok ? 0 : 1;
