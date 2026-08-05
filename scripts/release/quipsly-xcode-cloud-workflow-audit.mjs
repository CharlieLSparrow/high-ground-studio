#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_CREDENTIAL_PATH = path.join(
  os.homedir(),
  ".config/quipsly/credentials/app-store-connect/quipsly-release-automation.json",
);

function parseArgs(argv) {
  const input = {
    appId: "6780995957",
    credentialPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || DEFAULT_CREDENTIAL_PATH,
    strict: false,
    expectDisabled: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--") continue;
    else if (arg === "--app-id") input.appId = value, index += 1;
    else if (arg === "--credential-path") input.credentialPath = value, index += 1;
    else if (arg === "--strict") input.strict = true;
    else if (arg === "--expect-disabled") input.expectDisabled = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return input;
}

function createToken(credentials) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "ES256", kid: credentials.key_id, typ: "JWT" });
  const payload = encode({ iss: credentials.issuer_id, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: credentials.key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

async function getJson(path, token) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`App Store Connect ${path} failed (${response.status}): ${body.errors?.[0]?.detail || "unknown"}`);
  }
  return body;
}

function analyzeWorkflow(attributes, { expectDisabled = false } = {}) {
  const automaticStarts = [
    ["branch", attributes.branchStartCondition],
    ["tag", attributes.tagStartCondition],
    ["pull-request", attributes.pullRequestStartCondition],
    ["schedule", attributes.scheduledStartCondition],
  ].filter(([, condition]) => condition !== null && condition !== undefined).map(([name]) => name);
  const actionPlatforms = (attributes.actions || []).map((action) => action.platform);
  const nonIosPlatforms = actionPlatforms.filter((platform) => platform !== "IOS");
  const findings = [];
  if (automaticStarts.length > 0) findings.push(`automatic-starts:${automaticStarts.join(",")}`);
  if (nonIosPlatforms.length > 0) findings.push(`non-ios-archives:${[...new Set(nonIosPlatforms)].join(",")}`);
  if ((attributes.actions || []).length !== 1) findings.push(`action-count:${(attributes.actions || []).length}`);
  if (expectDisabled && attributes.isEnabled) findings.push("workflow-enabled-during-hold");
  return {
    passed: findings.length === 0,
    findings,
    name: attributes.name,
    isEnabled: attributes.isEnabled,
    clean: attributes.clean,
    automaticStarts,
    manualBranchEnabled: Boolean(attributes.manualBranchStartCondition),
    actionPlatforms,
  };
}

async function main() {
  const input = parseArgs(process.argv);
  const credentials = JSON.parse(fs.readFileSync(input.credentialPath, "utf8"));
  const token = createToken(credentials);
  const productResponse = await getJson(
    `/v1/ciProducts?filter%5Bapp%5D=${encodeURIComponent(input.appId)}&limit=50`,
    token,
  );
  if (productResponse.data.length !== 1) {
    throw new Error(`Expected one Xcode Cloud product for app ${input.appId}; found ${productResponse.data.length}.`);
  }
  const product = productResponse.data[0];
  const [workflowsResponse, buildsResponse] = await Promise.all([
    getJson(`/v1/ciProducts/${product.id}/workflows?limit=50`, token),
    getJson(`/v1/ciProducts/${product.id}/buildRuns?limit=200&sort=-number`, token),
  ]);
  const workflows = [];
  for (const workflowRef of workflowsResponse.data) {
    const workflow = await getJson(`/v1/ciWorkflows/${workflowRef.id}`, token);
    workflows.push({
      id: workflowRef.id,
      ...analyzeWorkflow(workflow.data.attributes, { expectDisabled: input.expectDisabled }),
    });
  }
  const buildRuns = buildsResponse.data || [];
  const started = buildRuns.filter((run) => Boolean(run.attributes?.startedDate));
  const canceledBeforeStart = buildRuns.filter((run) =>
    !run.attributes?.startedDate && run.attributes?.completionStatus === "CANCELED");
  const receipt = {
    ok: workflows.every((workflow) => workflow.passed),
    operation: "quipsly-xcode-cloud-workflow-audit-v1",
    appId: input.appId,
    product: { id: product.id, name: product.attributes.name },
    workflows,
    recentBuildWindow: {
      inspected: buildRuns.length,
      newestNumber: buildRuns[0]?.attributes?.number ?? null,
      oldestNumber: buildRuns.at(-1)?.attributes?.number ?? null,
      started: started.length,
      canceledBeforeStart: canceledBeforeStart.length,
      lastStarted: started[0] ? {
        number: started[0].attributes.number,
        startedDate: started[0].attributes.startedDate,
        completionStatus: started[0].attributes.completionStatus,
      } : null,
    },
    credentialHandling: "The private key was read only to sign an in-memory API token and was not printed.",
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (input.strict && !receipt.ok) process.exitCode = 2;
}

export { analyzeWorkflow, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`QUIPSLY_XCODE_CLOUD_WORKFLOW_AUDIT_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
