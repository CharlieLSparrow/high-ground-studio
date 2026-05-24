#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "web";
const DEFAULT_ARTIFACT_REPOSITORY = "high-ground-studio";
const DEFAULT_IMAGE_NAME = "web";
const DEFAULT_CLOUD_SQL_INSTANCE = "studio-postgres";
const DEFAULT_RUNTIME_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/high_ground_studio";

const WEB_SECRET_BINDINGS = [
  ["DATABASE_URL", "web-database-url"],
  ["AUTH_SECRET", "web-auth-secret"],
  ["GOOGLE_CLIENT_ID", "web-google-client-id"],
  ["GOOGLE_CLIENT_SECRET", "web-google-client-secret"],
  ["HGO_OWNER_EMAILS", "web-owner-emails"],
  ["HGO_TEAM_SCHEDULER_EMAILS", "web-team-scheduler-emails"],
  ["HGO_COACH_EMAILS", "web-coach-emails"],
];

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    ...options,
  });
}

function read(command, args) {
  return run(command, args, { capture: true }).trim();
}

function readOptional(command, args) {
  try {
    return read(command, args);
  } catch {
    return "";
  }
}

function getConfigValue(key) {
  const value = readOptional("gcloud", ["config", "get-value", key]);
  return value && value !== "(unset)" ? value : "";
}

function requireValue(label, value) {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  return value;
}

function parseService(json) {
  if (!json) {
    return null;
  }

  return JSON.parse(json);
}

function getLatestRevision(service) {
  return (
    service?.status?.latestReadyRevisionName ||
    service?.status?.latestCreatedRevisionName ||
    ""
  );
}

function getCurrentImage(service) {
  return service?.spec?.template?.spec?.containers?.[0]?.image || "";
}

function getServiceUrl(service) {
  return service?.status?.url || service?.status?.address?.url || "";
}

function getShortHead() {
  return read("git", ["rev-parse", "--short", "HEAD"]);
}

function isIgnorableGitStatusLine(line) {
  return /^\?\? gha-creds-[\w-]+\.json$/.test(line.trim());
}

function getDeployBlockingDirtyStatus() {
  return read("git", ["status", "--short"])
    .split("\n")
    .filter(Boolean)
    .filter((line) => !isIgnorableGitStatusLine(line))
    .join("\n");
}

function buildSecretArg() {
  return WEB_SECRET_BINDINGS.map(
    ([envName, secretName]) => `${envName}=${secretName}:latest`,
  ).join(",");
}

function buildEnvArg({ authUrl, siteUrl }) {
  const env = [
    ["AUTH_TRUST_HOST", "true"],
    ["HGO_SITE_URL", siteUrl],
  ];

  if (authUrl) {
    env.push(["AUTH_URL", authUrl]);
  }

  return env.map(([key, value]) => `${key}=${value}`).join(",");
}

function buildImageWithCloudBuild() {
  run("gcloud", [
    "builds",
    "submit",
    "--project",
    project,
    "--config",
    "cloudbuild.web.yaml",
    "--substitutions",
    `_REGION=${region},_ARTIFACT_REPOSITORY=${artifactRepository},_IMAGE_NAME=${imageName},_IMAGE_TAG=${imageTag}`,
    ".",
  ]);
}

function buildImageWithDocker() {
  run("gcloud", [
    "auth",
    "configure-docker",
    `${region}-docker.pkg.dev`,
    "--quiet",
  ]);
  run("docker", ["build", "--file", "apps/web/Dockerfile", "--tag", imageUri, "."]);
  run("docker", ["push", imageUri]);
}

function buildImage() {
  const strategy = process.env.WEB_IMAGE_BUILD_STRATEGY || "cloud-build";

  if (strategy === "cloud-build") {
    buildImageWithCloudBuild();
    return;
  }

  if (strategy === "docker") {
    buildImageWithDocker();
    return;
  }

  throw new Error(
    `Unsupported WEB_IMAGE_BUILD_STRATEGY: ${strategy}. Use cloud-build or docker.`,
  );
}

async function assertHttpOk(url, matcher) {
  const response = await fetch(url, {
    redirect: "manual",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  if (matcher && !matcher(body, response)) {
    throw new Error(`${url} did not return the expected body`);
  }

  console.log(`passed smoke: ${url}`);
}

async function assertTeamRedirect(url) {
  const response = await fetch(url, {
    redirect: "manual",
  });
  const location = response.headers.get("location") || "";

  if (![302, 303, 307, 308].includes(response.status)) {
    throw new Error(`${url} returned HTTP ${response.status}, expected redirect`);
  }

  if (!location.includes("/api/auth/signin")) {
    throw new Error(`${url} redirected to ${location}, expected sign-in`);
  }

  console.log(`passed smoke: ${url} redirects to sign-in`);
}

const project = requireValue(
  "GCP project",
  process.env.WEB_CLOUD_RUN_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    getConfigValue("project"),
);
const region =
  process.env.WEB_CLOUD_RUN_REGION ||
  getConfigValue("run/region") ||
  DEFAULT_REGION;
const service = process.env.WEB_CLOUD_RUN_SERVICE || DEFAULT_SERVICE;
const artifactRepository =
  process.env.WEB_ARTIFACT_REPOSITORY || DEFAULT_ARTIFACT_REPOSITORY;
const imageName = process.env.WEB_IMAGE_NAME || DEFAULT_IMAGE_NAME;
const imageTag = process.env.WEB_IMAGE_TAG || getShortHead();
const serviceAccount =
  process.env.WEB_CLOUD_RUN_SERVICE_ACCOUNT ||
  `web-cloud-run@${project}.iam.gserviceaccount.com`;
const cloudSqlInstance =
  process.env.WEB_CLOUD_SQL_INSTANCE ||
  `${project}:${region}:${DEFAULT_CLOUD_SQL_INSTANCE}`;
const imageUri = `${region}-docker.pkg.dev/${project}/${artifactRepository}/${imageName}:${imageTag}`;

const dirtyStatus = getDeployBlockingDirtyStatus();

if (dirtyStatus && process.env.ALLOW_DIRTY_DEPLOY !== "1") {
  throw new Error(
    "Working tree is dirty. Commit first, or set ALLOW_DIRTY_DEPLOY=1 for an intentional operator deploy.",
  );
}

const serviceBefore = parseService(
  readOptional("gcloud", [
    "run",
    "services",
    "describe",
    service,
    "--project",
    project,
    "--region",
    region,
    "--format=json",
  ]),
);
const serviceExists = Boolean(serviceBefore);
const createService = process.env.WEB_CLOUD_RUN_CREATE_SERVICE === "1";
const previousRevision = getLatestRevision(serviceBefore);
const previousImage = getCurrentImage(serviceBefore);
const existingUrl = getServiceUrl(serviceBefore);
const requestedAuthUrl = process.env.WEB_AUTH_URL || existingUrl;
const requestedSiteUrl =
  process.env.WEB_HGO_SITE_URL || requestedAuthUrl || "https://highgroundodyssey.com";

if (!serviceExists && !createService) {
  throw new Error(
    `${service} Cloud Run service does not exist. Set WEB_CLOUD_RUN_CREATE_SERVICE=1 for the first deploy after confirming secrets, service account, Cloud SQL attachment, and OAuth callback plan.`,
  );
}

console.log("\nWeb Cloud Run deploy");
console.log(`project: ${project}`);
console.log(`region: ${region}`);
console.log(`service: ${service}`);
console.log(`image: ${imageUri}`);

if (previousRevision) {
  console.log(`previous ready revision: ${previousRevision}`);
}

if (previousImage) {
  console.log(`previous image: ${previousImage}`);
}

if (!serviceExists) {
  console.log("first deploy: enabled");
  console.log(`service account: ${serviceAccount}`);
  console.log(`cloud sql instance: ${cloudSqlInstance}`);
}

if (process.env.SKIP_LOCAL_CHECKS !== "1") {
  run("pnpm", ["web:cloudrun:test"]);
  run("pnpm", ["--filter", "web", "exec", "next", "build", "--webpack"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.WEB_LOCAL_DATABASE_URL || DEFAULT_RUNTIME_DATABASE_URL,
    },
  });
}

buildImage();

const deployArgs = [
  "run",
  "deploy",
  service,
  "--project",
  project,
  "--region",
  region,
  "--image",
  imageUri,
  "--quiet",
];

if (createService && !serviceExists) {
  deployArgs.push(
    "--allow-unauthenticated",
    "--port",
    "8080",
    "--service-account",
    serviceAccount,
    "--add-cloudsql-instances",
    cloudSqlInstance,
    "--set-secrets",
    buildSecretArg(),
    "--set-env-vars",
    buildEnvArg({
      authUrl: requestedAuthUrl,
      siteUrl: requestedSiteUrl,
    }),
  );
}

run("gcloud", deployArgs);

let serviceAfter = parseService(
  read("gcloud", [
    "run",
    "services",
    "describe",
    service,
    "--project",
    project,
    "--region",
    region,
    "--format=json",
  ]),
);
const serviceUrl = requireValue("Cloud Run service URL", getServiceUrl(serviceAfter));

if (createService && !requestedAuthUrl) {
  run("gcloud", [
    "run",
    "services",
    "update",
    service,
    "--project",
    project,
    "--region",
    region,
    "--update-env-vars",
    `AUTH_URL=${serviceUrl},HGO_SITE_URL=${serviceUrl},AUTH_TRUST_HOST=true`,
    "--quiet",
  ]);

  serviceAfter = parseService(
    read("gcloud", [
      "run",
      "services",
      "describe",
      service,
      "--project",
      project,
      "--region",
      region,
      "--format=json",
    ]),
  );
}

if (createService) {
  run("gcloud", [
    "run",
    "services",
    "update",
    service,
    "--project",
    project,
    "--region",
    region,
    "--no-invoker-iam-check",
    "--quiet",
  ]);
}

await assertHttpOk(`${serviceUrl}/api/health`, (body) => {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed.ok === true &&
      parsed.service === "high-ground-studio" &&
      parsed.app === "web"
    );
  } catch {
    return false;
  }
});

await assertHttpOk(`${serviceUrl}/`, (body) =>
  body.includes("High Ground Odyssey"),
);

await assertTeamRedirect(`${serviceUrl}/team/progress`);

console.log("\nDeploy complete");
console.log(`url: ${serviceUrl}`);

const rollbackRevision = previousRevision || getLatestRevision(serviceBefore);

if (rollbackRevision) {
  console.log("\nRollback command");
  console.log(
    `gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-revisions=${rollbackRevision}=100`,
  );
} else {
  console.log("\nRollback note");
  console.log(
    `This was the first ${service} deploy. To remove it, route traffic away or delete the Cloud Run service after confirming no DNS points at it.`,
  );
}
