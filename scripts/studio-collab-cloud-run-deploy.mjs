#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "studio-collab";
const DEFAULT_ARTIFACT_REPOSITORY = "high-ground-studio";
const DEFAULT_IMAGE_NAME = "studio-collab";
const DEFAULT_MIN_INSTANCES = "1";
const DEFAULT_MAX_INSTANCES = "1";
const DEFAULT_CONCURRENCY = "80";
const DEFAULT_TIMEOUT_SECONDS = "3600";

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

function buildImageWithCloudBuild() {
  run("gcloud", [
    "builds",
    "submit",
    "--project",
    project,
    "--config",
    "cloudbuild.studio-collab.yaml",
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
  run("docker", [
    "build",
    "--file",
    "apps/studio-collab/Dockerfile",
    "--tag",
    imageUri,
    ".",
  ]);
  run("docker", ["push", imageUri]);
}

function buildImage() {
  const strategy =
    process.env.STUDIO_COLLAB_IMAGE_BUILD_STRATEGY || "cloud-build";

  if (strategy === "cloud-build") {
    buildImageWithCloudBuild();
    return;
  }

  if (strategy === "docker") {
    buildImageWithDocker();
    return;
  }

  throw new Error(
    `Unsupported STUDIO_COLLAB_IMAGE_BUILD_STRATEGY: ${strategy}. Use cloud-build or docker.`,
  );
}

async function assertHttpOk(url, matcher) {
  const response = await fetch(url, { redirect: "manual" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  if (matcher && !matcher(body)) {
    throw new Error(`${url} did not return the expected body`);
  }

  console.log(`passed smoke: ${url}`);
}

function getServiceContainer(serviceJson) {
  return serviceJson?.spec?.template?.spec?.containers?.[0] ?? null;
}

function getServiceTemplateAnnotations(serviceJson) {
  return serviceJson?.spec?.template?.metadata?.annotations ?? {};
}

const project = requireValue(
  "GCP project",
  process.env.STUDIO_COLLAB_CLOUD_RUN_PROJECT ||
    process.env.STUDIO_CLOUD_RUN_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    getConfigValue("project"),
);
const region =
  process.env.STUDIO_COLLAB_CLOUD_RUN_REGION ||
  process.env.STUDIO_CLOUD_RUN_REGION ||
  getConfigValue("run/region") ||
  DEFAULT_REGION;
const service = process.env.STUDIO_COLLAB_CLOUD_RUN_SERVICE || DEFAULT_SERVICE;
const artifactRepository =
  process.env.STUDIO_COLLAB_ARTIFACT_REPOSITORY || DEFAULT_ARTIFACT_REPOSITORY;
const imageName = process.env.STUDIO_COLLAB_IMAGE_NAME || DEFAULT_IMAGE_NAME;
const imageTag =
  process.env.STUDIO_COLLAB_IMAGE_TAG ||
  read("git", ["rev-parse", "--short", "HEAD"]);
const imageUri = `${region}-docker.pkg.dev/${project}/${artifactRepository}/${imageName}:${imageTag}`;
const minInstances =
  process.env.STUDIO_COLLAB_MIN_INSTANCES || DEFAULT_MIN_INSTANCES;
const maxInstances =
  process.env.STUDIO_COLLAB_MAX_INSTANCES || DEFAULT_MAX_INSTANCES;
const concurrency =
  process.env.STUDIO_COLLAB_CONCURRENCY || DEFAULT_CONCURRENCY;
const timeoutSeconds =
  process.env.STUDIO_COLLAB_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS;

const dirtyStatus = getDeployBlockingDirtyStatus();

if (dirtyStatus && process.env.ALLOW_DIRTY_DEPLOY !== "1") {
  throw new Error(
    "Working tree is dirty. Commit first, or set ALLOW_DIRTY_DEPLOY=1 for an intentional operator deploy.",
  );
}

const serviceBeforeJson = readOptional("gcloud", [
  "run",
  "services",
  "describe",
  service,
  "--project",
  project,
  "--region",
  region,
  "--format=json",
]);
const serviceBefore = serviceBeforeJson ? JSON.parse(serviceBeforeJson) : null;

if (!serviceBefore && process.env.STUDIO_COLLAB_CREATE_SERVICE !== "1") {
  throw new Error(
    `Cloud Run service ${service} was not found. Create it deliberately or set STUDIO_COLLAB_CREATE_SERVICE=1 with the required runtime config.`,
  );
}

const previousRevision =
  serviceBefore?.status?.latestReadyRevisionName ||
  serviceBefore?.status?.latestCreatedRevisionName ||
  "";
const previousImage = getServiceContainer(serviceBefore)?.image || "";
const serviceAccount =
  process.env.STUDIO_COLLAB_SERVICE_ACCOUNT ||
  serviceBefore?.spec?.template?.spec?.serviceAccountName ||
  `studio-cloud-run@${project}.iam.gserviceaccount.com`;
const cloudSqlInstances =
  process.env.STUDIO_COLLAB_CLOUDSQL_INSTANCE ||
  getServiceTemplateAnnotations(serviceBefore)["run.googleapis.com/cloudsql-instances"] ||
  "";

console.log("\nStudio Collab Cloud Run deploy");
console.log(`project: ${project}`);
console.log(`region: ${region}`);
console.log(`service: ${service}`);
console.log(`image: ${imageUri}`);
console.log(`min instances: ${minInstances}`);
console.log(`max instances: ${maxInstances}`);
console.log(`timeout seconds: ${timeoutSeconds}`);

if (previousRevision) {
  console.log(`previous ready revision: ${previousRevision}`);
}

if (previousImage) {
  console.log(`previous image: ${previousImage}`);
}

if (process.env.SKIP_LOCAL_CHECKS !== "1") {
  run("node", ["--check", "apps/studio-collab/server.mjs"]);
  run("pnpm", ["studio:cloudrun:test"]);
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
  "--timeout",
  `${timeoutSeconds}s`,
  "--min-instances",
  minInstances,
  "--max-instances",
  maxInstances,
  "--concurrency",
  concurrency,
  "--service-account",
  serviceAccount,
  "--no-invoker-iam-check",
  "--quiet",
];

if (cloudSqlInstances) {
  deployArgs.push("--add-cloudsql-instances", cloudSqlInstances);
}

run("gcloud", deployArgs);

const serviceAfterJson = read("gcloud", [
  "run",
  "services",
  "describe",
  service,
  "--project",
  project,
  "--region",
  region,
  "--format=json",
]);
const serviceAfter = JSON.parse(serviceAfterJson);
const serviceUrl = serviceAfter.status?.url;
const templateAnnotations = getServiceTemplateAnnotations(serviceAfter);
const deployedTimeout = serviceAfter.spec?.template?.spec?.timeoutSeconds;

if (deployedTimeout !== Number(timeoutSeconds)) {
  throw new Error(
    `Expected timeoutSeconds ${timeoutSeconds}, got ${deployedTimeout}.`,
  );
}

if (templateAnnotations["autoscaling.knative.dev/minScale"] !== minInstances) {
  throw new Error(
    `Expected minScale ${minInstances}, got ${templateAnnotations["autoscaling.knative.dev/minScale"]}.`,
  );
}

if (templateAnnotations["autoscaling.knative.dev/maxScale"] !== maxInstances) {
  throw new Error(
    `Expected maxScale ${maxInstances}, got ${templateAnnotations["autoscaling.knative.dev/maxScale"]}.`,
  );
}

await assertHttpOk(`${serviceUrl}/health`, (body) => {
  try {
    const parsed = JSON.parse(body);
    return parsed.ok === true && parsed.service === "high-ground-studio-collab";
  } catch {
    return false;
  }
});

console.log("\nDeploy complete");
console.log(`url: ${serviceUrl}`);

if (previousRevision) {
  console.log("\nRollback command");
  console.log(
    `gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-revisions=${previousRevision}=100`,
  );
}
