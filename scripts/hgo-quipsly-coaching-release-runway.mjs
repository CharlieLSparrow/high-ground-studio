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
const smokePreviews = args.get("smoke-previews") === "1";
const projectId = args.get("project") || process.env.PROJECT_ID || "high-ground-odyssey";
const region = args.get("region") || process.env.REGION || "us-central1";
const nestService = args.get("nest-service") || process.env.NEST_SERVICE_NAME || "studio";
const nestTag = args.get("nest-tag") || process.env.NEST_PREVIEW_TAG || "quipsly-web-preview";
const hgoService = args.get("hgo-service") || process.env.HGO_SERVICE_NAME || "web";
const hgoTag = args.get("hgo-tag") || process.env.HGO_PREVIEW_TAG || "web-preview";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
  });

  return {
    ok: result.status === 0,
    exitCode: result.status,
    command: [command, ...commandArgs].join(" "),
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || "",
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findTaggedUrl(serviceName, tagName) {
  const result = run("gcloud", [
    "run",
    "services",
    "describe",
    serviceName,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json(status.traffic)",
  ]);

  const payload = parseJson(result.stdout);
  const traffic = payload?.status?.traffic || payload?.traffic || [];
  const tagged = Array.isArray(traffic)
    ? traffic.find((entry) => entry?.tag === tagName && entry?.url)
    : null;

  return {
    ok: result.ok && Boolean(tagged?.url),
    serviceName,
    tagName,
    url: tagged?.url || null,
    command: result.command,
    error: result.ok
      ? tagged?.url
        ? null
        : `Tag ${tagName} was not found on ${serviceName}.`
      : result.stderr || result.stdout || `Could not inspect ${serviceName}.`,
  };
}

function smokePreviewPair(hgoPreviewUrl, nestPreviewUrl) {
  if (!hgoPreviewUrl || !nestPreviewUrl) {
    return {
      ok: false,
      skipped: true,
      reason: "Both HGO and Nest preview URLs are required before preview integration smoke can run.",
    };
  }

  return run("node", [
    "scripts/hgo-quipsly-public-integration-smoke.mjs",
    "--json",
    `--hgo-base-url=${hgoPreviewUrl}`,
    `--quipsly-base-url=${nestPreviewUrl}`,
    "--quipsly-coaching-path=/public/coaching",
    `--nest-base-url=${nestPreviewUrl}`,
  ]);
}

const nestPreview = findTaggedUrl(nestService, nestTag);
const hgoPreview = findTaggedUrl(hgoService, hgoTag);
const previewSmoke = smokePreviews
  ? smokePreviewPair(hgoPreview.url, nestPreview.url)
  : { ok: true, skipped: true, reason: "Preview smoke not requested. Pass --smoke-previews to run it." };

const plan = [
  {
    label: "Fresh operator auth",
    command: "gcloud auth login --update-adc --brief && bash scripts/release/quipsly-gcloud-auth-check.sh",
  },
  {
    label: "Local contract readiness",
    command: "node scripts/hgo-quipsly-release-readiness.mjs --json",
  },
  {
    label: "Deploy Nest no-traffic preview",
    command:
      "PROJECT_ID=high-ground-odyssey LOCAL_VALIDATE=1 NO_TRAFFIC=1 PREVIEW_TAG=quipsly-web-preview scripts/quipsly-web-deploy.sh",
  },
  {
    label: "Deploy HGO no-traffic preview",
    command:
      "WEB_CLOUD_RUN_PROJECT=high-ground-odyssey WEB_CLOUD_RUN_SERVICE=web node scripts/web-cloud-run-deploy.mjs",
  },
  {
    label: "Smoke both previews",
    command: "node scripts/hgo-quipsly-coaching-release-runway.mjs --smoke-previews --json",
  },
  {
    label: "Promote Nest",
    command:
      "gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-tags=quipsly-web-preview=100 --quiet",
  },
  {
    label: "Promote HGO",
    command:
      "gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-tags=web-preview=100 --quiet",
  },
  {
    label: "Smoke live public integration",
    command:
      "node scripts/hgo-quipsly-public-route-matrix.mjs --json && node scripts/hgo-quipsly-public-integration-smoke.mjs --json",
  },
];

const report = {
  ok: nestPreview.ok && hgoPreview.ok && previewSmoke.ok,
  checkedAt: new Date().toISOString(),
  invariant:
    "HighGroundOdyssey.com teaches and routes. Quipsly.com educates and funnels. Nest owns operational coaching/capture truth.",
  projectId,
  region,
  previews: {
    nest: nestPreview,
    hgo: hgoPreview,
  },
  previewSmoke: previewSmoke.ok
    ? {
        ok: true,
        skipped: previewSmoke.skipped === true,
        reason: previewSmoke.reason || null,
        command: previewSmoke.command || null,
        report: parseJson(previewSmoke.stdout) || previewSmoke.stdout || null,
      }
    : {
        ok: false,
        skipped: previewSmoke.skipped === true,
        reason: previewSmoke.reason || null,
        command: previewSmoke.command || null,
        stdout: previewSmoke.stdout || "",
        stderr: previewSmoke.stderr || "",
      },
  plan,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`HGO/Quipsly coaching release runway: ${report.ok ? "READY" : "NOT READY"}`);
  console.log(`Nest preview: ${nestPreview.url || nestPreview.error}`);
  console.log(`HGO preview: ${hgoPreview.url || hgoPreview.error}`);
  if (previewSmoke.skipped) {
    console.log(`Preview smoke: skipped (${previewSmoke.reason})`);
  } else {
    console.log(`Preview smoke: ${previewSmoke.ok ? "pass" : "fail"}`);
  }
  console.log("\nRunway:");
  for (const [index, item] of plan.entries()) {
    console.log(`${index + 1}. ${item.label}`);
    console.log(`   ${item.command}`);
  }
}

process.exit(report.ok ? 0 : 1);
