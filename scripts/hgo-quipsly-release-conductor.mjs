#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const jsonOutput = args.get("json") === "1";
const deployPreviews = args.get("deploy-previews") === "1";
const smokePreviews = args.get("smoke-previews") === "1" || deployPreviews;
const promoteLive = args.get("promote-live") === "1";
const confirmPromote = args.get("confirm-promote-hgo-quipsly") === "1";
const strictLiveSmoke = args.get("strict-live-smoke") === "1" || promoteLive;
const projectId = args.get("project") || process.env.PROJECT_ID || "high-ground-odyssey";
const region = args.get("region") || process.env.REGION || "us-central1";
const nestService = args.get("nest-service") || process.env.NEST_SERVICE_NAME || "studio";
const hgoService = args.get("hgo-service") || process.env.HGO_SERVICE_NAME || "web";
const nestPreviewTag = args.get("nest-tag") || process.env.NEST_PREVIEW_TAG || "quipsly-web-preview";
const hgoPreviewTag = args.get("hgo-tag") || process.env.HGO_PREVIEW_TAG || "web-preview";
const nestImageTag = args.get("nest-image-tag") || process.env.NEST_IMAGE_TAG || `quipsly-web-${stamp()}`;
const hgoImageTag = args.get("hgo-image-tag") || process.env.WEB_IMAGE_TAG || `web-${stamp()}`;
const allowDirtyWebDeploy = args.get("allow-dirty-web-deploy") === "1" || process.env.ALLOW_DIRTY_DEPLOY === "1";
const skipLocalChecks = args.get("skip-local-checks") === "1";
const runPublicIntegrationSmokeDuringNestDeploy = args.get("nest-deploy-public-smoke") === "1";

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function run(step, command, commandArgs, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
  });

  return {
    step,
    ok: result.status === 0,
    exitCode: result.status,
    command: [command, ...commandArgs].join(" "),
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: (result.stdout || "").trim().slice(0, options.maxOutput || 10000),
    stderr: (result.stderr || "").trim().slice(0, options.maxOutput || 10000),
    required: options.required !== false,
    mutatesCloud: options.mutatesCloud === true,
    movesTraffic: options.movesTraffic === true,
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarize(stepResult) {
  if (stepResult.ok) return "pass";
  if (stepResult.movesTraffic) return "traffic-change-failed";
  if (stepResult.mutatesCloud) return "cloud-mutation-failed";
  return "fail";
}

function addPlanCommand(plan, label, command, { mutatesCloud = false, movesTraffic = false, requiresFlag = null } = {}) {
  plan.push({ label, command, mutatesCloud, movesTraffic, requiresFlag });
}

const plan = [];
addPlanCommand(plan, "Check operator auth and local contracts", "node scripts/hgo-quipsly-release-readiness.mjs --json");
addPlanCommand(
  plan,
  "Deploy Nest no-traffic preview",
  `PROJECT_ID=${projectId} LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=${nestPreviewTag} IMAGE_TAG=${nestImageTag} scripts/quipsly-web-deploy.sh`,
  { mutatesCloud: true, requiresFlag: "--deploy-previews" },
);
addPlanCommand(
  plan,
  "Deploy HGO no-traffic preview",
  `WEB_CLOUD_RUN_PROJECT=${projectId} WEB_CLOUD_RUN_REGION=${region} WEB_CLOUD_RUN_SERVICE=${hgoService} WEB_IMAGE_TAG=${hgoImageTag} node scripts/web-cloud-run-deploy.mjs`,
  { mutatesCloud: true, requiresFlag: "--deploy-previews" },
);
addPlanCommand(
  plan,
  "Smoke tagged previews together",
  `node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json --project=${projectId} --region=${region} --nest-service=${nestService} --nest-tag=${nestPreviewTag} --hgo-service=${hgoService} --hgo-tag=${hgoPreviewTag}`,
  { requiresFlag: "--smoke-previews" },
);
addPlanCommand(
  plan,
  "Promote Nest preview to live",
  `gcloud run services update-traffic ${nestService} --project=${projectId} --region=${region} --to-tags=${nestPreviewTag}=100 --quiet`,
  { mutatesCloud: true, movesTraffic: true, requiresFlag: "--promote-live --confirm-promote-hgo-quipsly" },
);
addPlanCommand(
  plan,
  "Promote HGO preview to live",
  `gcloud run services update-traffic ${hgoService} --project=${projectId} --region=${region} --to-tags=${hgoPreviewTag}=100 --quiet`,
  { mutatesCloud: true, movesTraffic: true, requiresFlag: "--promote-live --confirm-promote-hgo-quipsly" },
);
addPlanCommand(plan, "Smoke live public integration", "node scripts/hgo-quipsly-public-route-matrix.mjs --json && node scripts/hgo-quipsly-public-integration-smoke.mjs --json");

const steps = [];
steps.push(
  run("release-readiness", "node", ["scripts/hgo-quipsly-release-readiness.mjs", "--json"], {
    maxOutput: 18000,
  }),
);

const readiness = parseJson(steps.at(-1)?.stdout || "");
const readinessBlocked = !steps.at(-1)?.ok || readiness?.deployBlocked === true;

if (!readinessBlocked && deployPreviews) {
  steps.push(
    run("deploy-nest-preview", "scripts/quipsly-web-deploy.sh", [nestImageTag], {
      mutatesCloud: true,
      maxOutput: 24000,
      env: {
        PROJECT_ID: projectId,
        REGION: region,
        SERVICE_NAME: nestService,
        LOCAL_VALIDATE: skipLocalChecks ? "0" : "1",
        NO_TRAFFIC: "1",
        PREVIEW_TAG: nestPreviewTag,
        IMAGE_TAG: nestImageTag,
        RUN_PUBLIC_INTEGRATION_SMOKE: runPublicIntegrationSmokeDuringNestDeploy ? "1" : "0",
        RUN_PREVIEW_SMOKE: "1",
      },
    }),
  );
}

const nestDeployOk = !deployPreviews || steps.find((step) => step.step === "deploy-nest-preview")?.ok === true;
if (!readinessBlocked && nestDeployOk && deployPreviews) {
  steps.push(
    run("deploy-hgo-preview", "node", ["scripts/web-cloud-run-deploy.mjs"], {
      mutatesCloud: true,
      maxOutput: 24000,
      env: {
        WEB_CLOUD_RUN_PROJECT: projectId,
        WEB_CLOUD_RUN_REGION: region,
        WEB_CLOUD_RUN_SERVICE: hgoService,
        WEB_IMAGE_TAG: hgoImageTag,
        SKIP_LOCAL_CHECKS: skipLocalChecks ? "1" : "0",
        ALLOW_DIRTY_DEPLOY: allowDirtyWebDeploy ? "1" : "0",
      },
    }),
  );
}

const previewDeploysOk =
  !deployPreviews ||
  (steps.find((step) => step.step === "deploy-nest-preview")?.ok === true &&
    steps.find((step) => step.step === "deploy-hgo-preview")?.ok === true);

if (!readinessBlocked && previewDeploysOk && smokePreviews) {
  steps.push(
    run(
      "smoke-previews",
      "node",
      [
        "scripts/hgo-quipsly-coaching-release-runway.mjs",
        "--smoke-previews",
        "--json",
        `--project=${projectId}`,
        `--region=${region}`,
        `--nest-service=${nestService}`,
        `--nest-tag=${nestPreviewTag}`,
        `--hgo-service=${hgoService}`,
        `--hgo-tag=${hgoPreviewTag}`,
      ],
      { maxOutput: 24000 },
    ),
  );
}

const previewSmokeOk = !smokePreviews || steps.find((step) => step.step === "smoke-previews")?.ok === true;

if (promoteLive && !confirmPromote) {
  steps.push({
    step: "promotion-confirmation",
    ok: false,
    exitCode: 2,
    command: "--promote-live requires --confirm-promote-hgo-quipsly",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    stdout: "",
    stderr:
      "Refusing to move public traffic without --confirm-promote-hgo-quipsly. This is an intentional guardrail, not a technical failure.",
    required: true,
    mutatesCloud: false,
    movesTraffic: true,
  });
}

if (!readinessBlocked && previewDeploysOk && previewSmokeOk && promoteLive && confirmPromote) {
  steps.push(
    run(
      "promote-nest-live",
      "gcloud",
      [
        "run",
        "services",
        "update-traffic",
        nestService,
        `--project=${projectId}`,
        `--region=${region}`,
        `--to-tags=${nestPreviewTag}=100`,
        "--quiet",
      ],
      { mutatesCloud: true, movesTraffic: true, maxOutput: 12000 },
    ),
  );

  if (steps.at(-1)?.ok) {
    steps.push(
      run(
        "promote-hgo-live",
        "gcloud",
        [
          "run",
          "services",
          "update-traffic",
          hgoService,
          `--project=${projectId}`,
          `--region=${region}`,
          `--to-tags=${hgoPreviewTag}=100`,
          "--quiet",
        ],
        { mutatesCloud: true, movesTraffic: true, maxOutput: 12000 },
      ),
    );
  }
}

const promotionOk =
  !promoteLive ||
  (steps.find((step) => step.step === "promote-nest-live")?.ok === true &&
    steps.find((step) => step.step === "promote-hgo-live")?.ok === true);

if (!readinessBlocked && promotionOk && (promoteLive || args.get("live-smoke") === "1")) {
  steps.push(
    run("live-route-matrix", "node", ["scripts/hgo-quipsly-public-route-matrix.mjs", "--json"], {
      maxOutput: 18000,
      required: strictLiveSmoke,
    }),
  );
  steps.push(
    run("live-integration-smoke", "node", ["scripts/hgo-quipsly-public-integration-smoke.mjs", "--json"], {
      maxOutput: 18000,
      required: strictLiveSmoke,
    }),
  );
}

const requiredFailures = steps.filter((step) => step.required !== false && !step.ok);
const report = {
  ok: requiredFailures.length === 0,
  checkedAt: new Date().toISOString(),
  mode: {
    deployPreviews,
    smokePreviews,
    promoteLive,
    confirmPromote,
    strictLiveSmoke,
  },
  invariant:
    "HighGroundOdyssey.com teaches and routes. Quipsly.com educates and funnels. Nest owns operational coaching/capture truth through shared side-effect-free contracts.",
  projectId,
  region,
  tags: {
    nestPreviewTag,
    hgoPreviewTag,
    nestImageTag,
    hgoImageTag,
  },
  plan,
  steps: steps.map((step) => ({ ...step, summary: summarize(step) })),
  nextAction: nextAction({ readinessBlocked, deployPreviews, smokePreviews, promoteLive, requiredFailures }),
};

function nextAction({ readinessBlocked, deployPreviews, smokePreviews, promoteLive, requiredFailures }) {
  if (readinessBlocked) {
    return {
      label: "Fix release readiness first",
      command: "gcloud auth login --update-adc --brief && bash scripts/release/quipsly-gcloud-auth-check.sh",
    };
  }
  if (!deployPreviews) {
    return {
      label: "Deploy both no-traffic previews",
      command: `node scripts/hgo-quipsly-release-conductor.mjs --deploy-previews --json`,
    };
  }
  if (!smokePreviews) {
    return {
      label: "Smoke both preview revisions together",
      command: "node scripts/hgo-quipsly-release-conductor.mjs --smoke-previews --json",
    };
  }
  if (!promoteLive) {
    return {
      label: "Promote only after preview evidence is clean",
      command:
        "node scripts/hgo-quipsly-release-conductor.mjs --smoke-previews --promote-live --confirm-promote-hgo-quipsly --json",
    };
  }
  if (requiredFailures.length > 0) {
    return {
      label: "Inspect failed release conductor step",
      command: requiredFailures[0].command,
    };
  }
  return {
    label: "Release conductor completed",
    command: "node scripts/hgo-quipsly-public-route-matrix.mjs --json && node scripts/hgo-quipsly-public-integration-smoke.mjs --json",
  };
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`HGO/Quipsly release conductor: ${report.ok ? "PASS" : "NOT READY"}`);
  console.log(report.invariant);
  for (const step of report.steps) {
    console.log(`${step.ok ? "PASS" : "FAIL"} ${step.step}: ${step.command}`);
    if (!step.ok && step.stderr) console.log(`  ${step.stderr.split("\n")[0]}`);
  }
  console.log(`Next: ${report.nextAction.label}`);
  console.log(`  ${report.nextAction.command}`);
}

process.exit(report.ok ? 0 : 1);
