#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import dns from "node:dns/promises";

const project = process.env.WEB_CLOUD_RUN_PROJECT ?? "high-ground-odyssey";
const region = process.env.WEB_CLOUD_RUN_REGION ?? "us-central1";
const service = process.env.WEB_CLOUD_RUN_SERVICE ?? "web";
const domain = process.env.WEB_CUSTOM_DOMAIN ?? "app.highgroundodyssey.com";
const expectedCname = normalizeDnsTarget(
  process.env.WEB_CUSTOM_DOMAIN_CNAME ?? "ghs.googlehosted.com.",
);
const origin = `https://${domain}`;
const oauthCallback = `${origin}/api/auth/callback/google`;

const passed = [];
const pending = [];
const warnings = [];
const blocked = [];

function normalizeDnsTarget(value) {
  if (!value) {
    return value;
  }

  return value.endsWith(".") ? value : `${value}.`;
}

function parentDomain(hostname) {
  const parts = hostname.split(".");

  if (parts.length < 2) {
    return hostname;
  }

  return parts.slice(-2).join(".");
}

function runReadOnly(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function getJson(label, command, args) {
  const output = runReadOnly(command, args);

  if (!output) {
    warnings.push(`${label} could not be read`);
    return null;
  }

  try {
    return JSON.parse(output);
  } catch {
    warnings.push(`${label} did not return parseable JSON`);
    return null;
  }
}

function printList(title, entries) {
  console.log(`\n${title}`);

  if (entries.length === 0) {
    console.log("  none");
    return;
  }

  for (const entry of entries) {
    console.log(`  - ${entry}`);
  }
}

async function readNameservers() {
  const baseDomain = parentDomain(domain);

  try {
    const nameservers = await dns.resolveNs(baseDomain);
    passed.push(`${baseDomain} nameservers: ${nameservers.join(", ")}`);
  } catch (error) {
    warnings.push(
      `${baseDomain} nameservers could not be resolved: ${error.code ?? error.message}`,
    );
  }
}

async function readCustomDomainCname() {
  try {
    const records = (await dns.resolveCname(domain)).map(normalizeDnsTarget);

    if (records.includes(expectedCname)) {
      passed.push(`${domain} CNAME is ${expectedCname}`);
      return;
    }

    if (records.length > 0) {
      blocked.push(
        `${domain} CNAME is ${records.join(", ")}; expected ${expectedCname}`,
      );
      return;
    }
  } catch (error) {
    if (["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(error.code)) {
      blocked.push(`${domain} has no CNAME record yet`);
      return;
    }

    warnings.push(
      `${domain} CNAME could not be resolved: ${error.code ?? error.message}`,
    );
    return;
  }

  blocked.push(`${domain} has no CNAME record yet`);
}

function readCloudRunMapping() {
  const mapping = getJson("Cloud Run domain mapping", "gcloud", [
    "beta",
    "run",
    "domain-mappings",
    "describe",
    `--domain=${domain}`,
    `--region=${region}`,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!mapping) {
    return;
  }

  const routeName = mapping.spec?.routeName;
  const resourceRecords = mapping.status?.resourceRecords ?? [];
  const conditions = mapping.status?.conditions ?? [];
  const ready = conditions.find((condition) => condition.type === "Ready");
  const certificate = conditions.find(
    (condition) => condition.type === "CertificateProvisioned",
  );
  const requiredRecord = resourceRecords.find((record) => record.type === "CNAME");

  if (routeName === service) {
    passed.push(`Cloud Run domain mapping routes ${domain} to ${service}`);
  } else {
    blocked.push(
      `Cloud Run domain mapping routes ${domain} to ${routeName ?? "unknown"}; expected ${service}`,
    );
  }

  if (requiredRecord?.rrdata) {
    passed.push(
      `Cloud Run requested DNS: ${requiredRecord.name} ${requiredRecord.type} ${requiredRecord.rrdata}`,
    );
  }

  if (ready?.status === "True") {
    passed.push(`Cloud Run domain mapping is Ready`);
  } else {
    pending.push(
      `Cloud Run domain mapping is ${ready?.reason ?? "not Ready"}: ${ready?.message ?? "waiting for DNS and certificate issuance"}`,
    );
  }

  if (certificate?.status === "True") {
    passed.push(`Cloud Run managed certificate is provisioned`);
  } else {
    pending.push(
      `Cloud Run managed certificate is ${certificate?.reason ?? "pending"}: ${certificate?.message ?? "waiting for DNS propagation"}`,
    );
  }
}

function readCloudRunService() {
  const runService = getJson("Cloud Run service", "gcloud", [
    "run",
    "services",
    "describe",
    service,
    `--region=${region}`,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!runService) {
    return;
  }

  const url = runService.status?.url;
  const revision = runService.status?.latestReadyRevisionName;
  const env = runService.spec?.template?.spec?.containers?.[0]?.env ?? [];
  const plainEnv = new Map(
    env
      .filter((entry) => typeof entry.value === "string")
      .map((entry) => [entry.name, entry.value]),
  );
  const authUrl = plainEnv.get("AUTH_URL");
  const siteUrl = plainEnv.get("HGO_SITE_URL");

  if (url) {
    passed.push(`Cloud Run ${service} URL: ${url}`);
  }

  if (revision) {
    passed.push(`Cloud Run latest ready revision: ${revision}`);
  }

  if (authUrl === origin && siteUrl === origin) {
    passed.push(`AUTH_URL and HGO_SITE_URL already use ${origin}`);
  } else {
    pending.push(
      `AUTH_URL is ${authUrl ?? "unset"} and HGO_SITE_URL is ${siteUrl ?? "unset"}; keep these unchanged until DNS and Google OAuth callback are ready`,
    );
  }

  if (plainEnv.get("AUTH_TRUST_HOST") === "true") {
    passed.push("AUTH_TRUST_HOST=true");
  } else {
    pending.push("AUTH_TRUST_HOST should be true for the Cloud Run web service");
  }
}

console.log("Web custom domain readiness");
console.log("Read-only check. This script is not a deployment.");
console.log(
  "It does not change DNS, OAuth, Cloud Run, secrets, IAM, or databases.",
);
console.log(`\nTarget: ${origin}`);
console.log(`Project: ${project}`);
console.log(`Region: ${region}`);
console.log(`Service: ${service}`);

await readNameservers();
await readCustomDomainCname();
readCloudRunMapping();
readCloudRunService();

printList("Passed checks", passed);
printList("Pending work", pending);
printList("Warnings", warnings);
printList("Blocked items", blocked);

console.log("\nNext cutover steps");
console.log(`  1. In the DNS manager for ${parentDomain(domain)}, add:`);
console.log(`     ${domain} CNAME ${expectedCname}`);
console.log("  2. Wait for this command to report the CNAME and Ready certificate.");
console.log("  3. Add this Google OAuth authorized redirect URI:");
console.log(`     ${oauthCallback}`);
console.log("  4. After the callback exists, update the web runtime origin:");
console.log(
  `     gcloud run services update ${service} --project=${project} --region=${region} --update-env-vars=AUTH_URL=${origin},HGO_SITE_URL=${origin},AUTH_TRUST_HOST=true`,
);

if (blocked.length > 0) {
  console.log("\nResult: custom domain is not ready yet.");
  process.exitCode = 1;
} else {
  console.log("\nResult: no hard custom-domain blockers detected.");
}
