#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "studio";
const DEFAULT_ARTIFACT_REPOSITORY = "high-ground-studio";
const DEFAULT_IMAGE_NAME = "studio";

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
    "cloudbuild.studio.yaml",
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
    "apps/studio/Dockerfile",
    "--tag",
    imageUri,
    ".",
  ]);
  run("docker", ["push", imageUri]);
}

function buildImage() {
  const strategy = process.env.STUDIO_IMAGE_BUILD_STRATEGY || "cloud-build";

  if (strategy === "cloud-build") {
    buildImageWithCloudBuild();
    return;
  }

  if (strategy === "docker") {
    buildImageWithDocker();
    return;
  }

  throw new Error(
    `Unsupported STUDIO_IMAGE_BUILD_STRATEGY: ${strategy}. Use cloud-build or docker.`,
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

  if (matcher && !matcher(body)) {
    throw new Error(`${url} did not return the expected body`);
  }

  console.log(`passed smoke: ${url}`);
}

const project = requireValue(
  "GCP project",
  process.env.STUDIO_CLOUD_RUN_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    getConfigValue("project"),
);
const region =
  process.env.STUDIO_CLOUD_RUN_REGION ||
  getConfigValue("run/region") ||
  DEFAULT_REGION;
const service = process.env.STUDIO_CLOUD_RUN_SERVICE || DEFAULT_SERVICE;
const artifactRepository =
  process.env.STUDIO_ARTIFACT_REPOSITORY || DEFAULT_ARTIFACT_REPOSITORY;
const imageName = process.env.STUDIO_IMAGE_NAME || DEFAULT_IMAGE_NAME;
const imageTag =
  process.env.STUDIO_IMAGE_TAG || read("git", ["rev-parse", "--short", "HEAD"]);
const imageUri = `${region}-docker.pkg.dev/${project}/${artifactRepository}/${imageName}:${imageTag}`;

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
const previousRevision =
  serviceBefore?.status?.latestReadyRevisionName ||
  serviceBefore?.status?.latestCreatedRevisionName ||
  "";
const previousImage =
  serviceBefore?.spec?.template?.spec?.containers?.[0]?.image || "";

console.log("\nStudio Cloud Run deploy");
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

if (process.env.SKIP_LOCAL_CHECKS !== "1") {
  run("pnpm", ["--filter", "studio", "typecheck"]);
  run("pnpm", ["studio:cloudrun:test"]);
}

buildImage();

run("gcloud", [
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
]);

const serviceUrl = read("gcloud", [
  "run",
  "services",
  "describe",
  service,
  "--project",
  project,
  "--region",
  region,
  "--format=value(status.url)",
]);

await assertHttpOk(`${serviceUrl}/api/health`, (body) => {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed.ok === true &&
      parsed.service === "high-ground-studio" &&
      parsed.app === "studio"
    );
  } catch {
    return false;
  }
});

await assertHttpOk(`${serviceUrl}/content-studio`, (body) =>
  body.includes("Sign in to Studio") || body.includes("Content Management Studio"),
);

console.log("\nDeploy complete");
console.log(`url: ${serviceUrl}`);

if (previousRevision) {
  console.log("\nRollback command");
  console.log(
    `gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-revisions=${previousRevision}=100`,
  );
}
