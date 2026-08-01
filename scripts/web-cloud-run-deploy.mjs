#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "web";
const DEFAULT_ARTIFACT_REPOSITORY = "high-ground-studio";
const DEFAULT_IMAGE_NAME = "web";
const DEFAULT_PUBLIC_SITE_URL = "https://highgroundodyssey.com";
const DEFAULT_CLOUD_SQL_INSTANCE = "studio-postgres";
const DEFAULT_RUNTIME_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/high_ground_studio";

const WEB_REQUIRED_SECRET_BINDINGS = [
  ["DATABASE_URL", "web-cloudsql-database-url"],
  ["AUTH_SECRET", "web-auth-secret"],
  ["GOOGLE_CLIENT_ID", "web-google-client-id"],
  ["GOOGLE_CLIENT_SECRET", "web-google-client-secret"],
  ["HGO_OWNER_EMAILS", "web-owner-emails"],
  ["HGO_TEAM_SCHEDULER_EMAILS", "web-team-scheduler-emails"],
  ["HGO_COACH_EMAILS", "web-coach-emails"],
];
const WEB_OPTIONAL_SECRET_BINDINGS = [
  ["STRIPE_SECRET_KEY", "web-stripe-secret-key"],
  ["STRIPE_WEBHOOK_SECRET", "web-stripe-webhook-secret"],
  ["STRIPE_PUBLISHABLE_KEY", "web-stripe-publishable-key"],
  ["STRIPE_COACHING_PRICE_ID", "web-stripe-coaching-price-id"],
  ["STRIPE_SUPPORTER_PRICE_ID", "web-stripe-supporter-price-id"],
  ["STRIPE_SUCCESS_URL", "web-stripe-success-url"],
  ["STRIPE_CANCEL_URL", "web-stripe-cancel-url"],
  ["PATREON_CLIENT_ID", "web-patreon-client-id"],
  ["PATREON_CLIENT_SECRET", "web-patreon-client-secret"],
  ["PATREON_WEBHOOK_SECRET", "web-patreon-webhook-secret"],
  ["PATREON_CAMPAIGN_ID", "web-patreon-campaign-id"],
  ["PATREON_CREATOR_ACCESS_TOKEN", "web-patreon-creator-access-token"],
  ["GOOGLE_CALENDAR_ID", "web-google-calendar-id"],
  ["GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "web-google-calendar-service-account-json"],
  ["GOOGLE_CALENDAR_REFRESH_TOKEN", "web-google-calendar-refresh-token"],
  ["GOOGLE_CALENDAR_IMPERSONATION_EMAIL", "web-google-calendar-impersonation-email"],
  ["GOOGLE_CALENDAR_SYNC_CLIENT_ID", "web-google-calendar-sync-client-id"],
  ["GOOGLE_CALENDAR_SYNC_CLIENT_SECRET", "web-google-calendar-sync-client-secret"],
  ["GOOGLE_CALENDAR_SEND_UPDATES", "web-google-calendar-send-updates"],
  ["HGO_GA_MEASUREMENT_ID", "web-hgo-ga-measurement-id"],
  ["GOOGLE_ANALYTICS_PROPERTY_ID", "web-google-analytics-property-id"],
  ["GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON", "web-google-analytics-service-account-json"],
  ["GOOGLE_ANALYTICS_REFRESH_TOKEN", "web-google-analytics-refresh-token"],
  ["GOOGLE_ANALYTICS_SYNC_CLIENT_ID", "web-google-analytics-sync-client-id"],
  ["GOOGLE_ANALYTICS_SYNC_CLIENT_SECRET", "web-google-analytics-sync-client-secret"],
  ["GOOGLE_SEARCH_CONSOLE_SITE_URL", "web-google-search-console-site-url"],
  ["GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON", "web-google-search-console-service-account-json"],
  ["GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN", "web-google-search-console-refresh-token"],
  ["GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_ID", "web-google-search-console-sync-client-id"],
  ["GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_SECRET", "web-google-search-console-sync-client-secret"],
  ["GOOGLE_ADSENSE_CLIENT", "web-google-adsense-client"],
  ["GOOGLE_ADSENSE_ADS_TXT_ACCOUNT", "web-google-adsense-ads-txt-account"],
  ["GOOGLE_ADSENSE_ADS_TXT_AUTHORITY", "web-google-adsense-ads-txt-authority"],
  ["GOOGLE_ADSENSE_ADS_TXT_RELATIONSHIP", "web-google-adsense-ads-txt-relationship"],
  ["HGO_ADSENSE_AUTO_ADS_ENABLED", "web-hgo-adsense-auto-ads-enabled"],
  ["AMAZON_ASSOCIATES_TAG", "web-amazon-associates-tag"],
  ["BOOKSHOP_AFFILIATE_ID", "web-bookshop-affiliate-id"],
  ["HGO_AFFILIATE_DISCLOSURE_TEXT", "web-hgo-affiliate-disclosure-text"],
  ["HGO_SPONSOR_INQUIRY_URL", "web-hgo-sponsor-inquiry-url"],
  ["HGO_SPONSOR_MEDIA_KIT_URL", "web-hgo-sponsor-media-kit-url"],
  ["HGO_MERCH_PROVIDER", "web-hgo-merch-provider"],
  ["SHOPIFY_ADMIN_ACCESS_TOKEN", "web-shopify-admin-access-token"],
  ["SHOPIFY_STORE_DOMAIN", "web-shopify-store-domain"],
  ["FOURTHWALL_API_KEY", "web-fourthwall-api-key"],
  ["FOURTHWALL_SHOP_URL", "web-fourthwall-shop-url"],
  ["PRINTFUL_API_KEY", "web-printful-api-key"],
  ["PRINTFUL_STORE_ID", "web-printful-store-id"],
  ["PRINTIFY_API_KEY", "web-printify-api-key"],
  ["PRINTIFY_SHOP_ID", "web-printify-shop-id"],
  ["GELATO_API_KEY", "web-gelato-api-key"],
  ["GELATO_STORE_ID", "web-gelato-store-id"],
  ["RESEND_API_KEY", "web-resend-api-key"],
  ["HGO_EMAIL_FROM", "web-hgo-email-from"],
  ["RESEND_WEBHOOK_SECRET", "web-resend-webhook-secret"],
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

function getLatestCreatedRevision(service) {
  return service?.status?.latestCreatedRevisionName || "";
}

function getCurrentImage(service) {
  return service?.spec?.template?.spec?.containers?.[0]?.image || "";
}

function getServiceUrl(service) {
  return service?.status?.url || service?.status?.address?.url || "";
}

function getServiceEnvValue(service, envName) {
  const entries = service?.spec?.template?.spec?.containers?.[0]?.env ?? [];
  const entry = entries.find((item) => item.name === envName);

  return entry?.value || "";
}

function getTrafficPercentForRevision(service, revisionName) {
  return (service?.status?.traffic ?? [])
    .filter((entry) => entry.revisionName === revisionName)
    .reduce((total, entry) => total + (entry.percent ?? 0), 0);
}

function materializeWebReleaseContext(sourceRef, expectedSourceSha) {
  const explicitContext = process.env.WEB_RELEASE_CONTEXT || "";
  const releaseContext = explicitContext
    ? path.resolve(explicitContext)
    : read("bash", [
        "scripts/release/materialize-release-context.sh",
        "hgo-web",
        sourceRef,
      ]);
  const markerPath = path.join(releaseContext, ".quipsly-release-context");
  const receiptPath = path.join(releaseContext, "hgo-web-release-source.json");
  if (!existsSync(markerPath) || !existsSync(receiptPath)) {
    throw new Error(
      `HGO web release context is missing its marker or receipt: ${releaseContext}`,
    );
  }
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (
    receipt.releaseId !== "hgo-web"
    || receipt.sourceSha !== expectedSourceSha
    || receipt.releaseManifest !== "release/manifests/hgo-web.json"
  ) {
    throw new Error(
      `HGO web release context provenance does not match ${expectedSourceSha}.`,
    );
  }
  return {
    path: releaseContext,
    owned: !explicitContext,
  };
}

function removeOwnedReleaseContext(releaseContext) {
  if (
    !releaseContext
    || path.parse(releaseContext).root === releaseContext
    || !existsSync(path.join(releaseContext, ".quipsly-release-context"))
    || !existsSync(path.join(releaseContext, "hgo-web-release-source.json"))
  ) {
    console.error(
      `Refusing to remove unmarked HGO web release context: ${releaseContext}`,
    );
    return;
  }
  rmSync(releaseContext, { recursive: true });
}

function secretExists(secretName) {
  return Boolean(
    readOptional("gcloud", [
      "secrets",
      "describe",
      secretName,
      "--project",
      project,
      "--format=value(name)",
    ]),
  );
}

function secretHasEnabledVersion(secretName) {
  const raw = readOptional("gcloud", [
    "secrets",
    "versions",
    "list",
    secretName,
    "--project",
    project,
    "--format=json",
    "--limit=20",
  ]);

  if (!raw) {
    return false;
  }

  const versions = JSON.parse(raw);

  return versions.some((version) => version.state === "ENABLED");
}

function getMountableOptionalSecretBindings() {
  return WEB_OPTIONAL_SECRET_BINDINGS.filter(([, secretName]) =>
    secretExists(secretName) && secretHasEnabledVersion(secretName),
  );
}

function buildSecretArg(bindings) {
  return bindings.map(
    ([envName, secretName]) => `${envName}=${secretName}:latest`,
  ).join(",");
}

function buildEnvArg({ authUrl, siteUrl }) {
  const env = [
    ["AUTH_TRUST_HOST", "true"],
    ["HGO_SITE_URL", siteUrl],
    ["NEXT_PUBLIC_SITE_URL", siteUrl],
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
    path.join(releaseContext.path, "cloudbuild.web.yaml"),
    "--substitutions",
    `_REGION=${region},_ARTIFACT_REPOSITORY=${artifactRepository},_IMAGE_NAME=${imageName},_IMAGE_TAG=${imageTag},_SOURCE_SHA=${sourceSha}`,
    releaseContext.path,
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
    path.join(releaseContext.path, "apps/web/Dockerfile"),
    "--build-arg",
    `HGO_BUILD_ID=${sourceSha}`,
    "--tag",
    imageUri,
    releaseContext.path,
  ]);
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

function inspectImageDigest() {
  const result = spawnSync("gcloud", [
    "artifacts",
    "docker",
    "images",
    "describe",
    imageUri,
    "--project",
    project,
    "--format=value(image_summary.digest)",
  ], { encoding: "utf8" });
  if (result.status === 0) {
    const digest = (result.stdout || "").trim();
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`Artifact Registry returned an invalid digest for ${imageUri}.`);
    }
    return { state: "available", digest };
  }
  const diagnostic = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (/NOT_FOUND|not found|does not exist|was not found/i.test(diagnostic)) {
    return { state: "missing", digest: "" };
  }
  throw new Error(
    `Artifact Registry readback failed before the HGO image cost decision. ${diagnostic.trim().slice(0, 500)}`,
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
const sourceRef = process.env.WEB_SOURCE_REF || "HEAD";
const sourceSha = read("git", ["rev-parse", "--verify", `${sourceRef}^{commit}`]);
const imageTag = process.env.WEB_IMAGE_TAG || sourceSha;
const reuseExistingImage = process.env.WEB_REUSE_EXISTING_IMAGE ?? "1";
if (!["0", "1"].includes(reuseExistingImage)) {
  throw new Error("WEB_REUSE_EXISTING_IMAGE must be 0 or 1.");
}
const serviceAccount =
  process.env.WEB_CLOUD_RUN_SERVICE_ACCOUNT ||
  `web-cloud-run@${project}.iam.gserviceaccount.com`;
const cloudSqlInstance =
  process.env.WEB_CLOUD_SQL_INSTANCE ||
  `${project}:${region}:${DEFAULT_CLOUD_SQL_INSTANCE}`;
const imageUri = `${region}-docker.pkg.dev/${project}/${artifactRepository}/${imageName}:${imageTag}`;

const releaseContext = materializeWebReleaseContext(sourceRef, sourceSha);
if (releaseContext.owned) {
  process.on("exit", () => removeOwnedReleaseContext(releaseContext.path));
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
const existingAuthUrl = getServiceEnvValue(serviceBefore, "AUTH_URL");
const existingSiteUrl = getServiceEnvValue(serviceBefore, "HGO_SITE_URL");
const requestedAuthUrl = process.env.WEB_AUTH_URL || existingAuthUrl || existingUrl;
const requestedSiteUrl =
  process.env.WEB_HGO_SITE_URL ||
  DEFAULT_PUBLIC_SITE_URL ||
  existingSiteUrl ||
  requestedAuthUrl ||
  DEFAULT_PUBLIC_SITE_URL;
const optionalSecretBindings = getMountableOptionalSecretBindings();
const deploySecretBindings = [
  ...WEB_REQUIRED_SECRET_BINDINGS,
  ...optionalSecretBindings,
];

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
console.log(`source: ${sourceSha}`);
console.log(`release context: ${releaseContext.path}`);
console.log(
  `optional provider secrets mounted: ${optionalSecretBindings.length}`,
);

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
  run("pnpm", ["install", "--frozen-lockfile"], {
    cwd: releaseContext.path,
  });
  run("pnpm", ["web:release-context:test"], {
    cwd: releaseContext.path,
  });
  run("pnpm", ["--filter", "web", "exec", "next", "build", "--webpack"], {
    cwd: releaseContext.path,
    env: {
      ...process.env,
      DATABASE_URL: process.env.WEB_LOCAL_DATABASE_URL || DEFAULT_RUNTIME_DATABASE_URL,
    },
  });
}

const imageBefore = inspectImageDigest();
if (imageBefore.state === "available" && reuseExistingImage === "1") {
  console.log(`Reusing exact-source HGO image ${imageUri} (${imageBefore.digest}).`);
  console.log("Cloud Build skipped: this committed source already has a verified image.");
} else if (imageBefore.state === "available") {
  throw new Error(
    "Refusing to replace an existing immutable HGO image tag. Use a new explicit WEB_IMAGE_TAG for a diagnostic rebuild.",
  );
} else {
  buildImage();
}

const verifiedImage = inspectImageDigest();
if (verifiedImage.state !== "available") {
  throw new Error(`Could not verify the HGO release image after the build/reuse decision: ${imageUri}.`);
}
console.log(`HGO release image digest: ${verifiedImage.digest}`);

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
  "--no-traffic",
  "--tag",
  "web-preview",
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
    buildSecretArg(deploySecretBindings),
    "--set-env-vars",
    buildEnvArg({
      authUrl: requestedAuthUrl,
      siteUrl: requestedSiteUrl,
    }),
  );
} else {
  deployArgs.push(
    "--update-secrets",
    buildSecretArg(deploySecretBindings),
    "--update-env-vars",
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

const deployedRevision =
  getLatestCreatedRevision(serviceAfter) || getLatestRevision(serviceAfter);

let previewUrl = "";
if (serviceAfter.status && serviceAfter.status.traffic) {
  const previewTraffic = serviceAfter.status.traffic.find(t => t.tag === "web-preview");
  if (previewTraffic && previewTraffic.url) {
    previewUrl = previewTraffic.url;
  }
}

const targetSmokeUrl = previewUrl || serviceUrl;
console.log(`\nSmoke testing against: ${targetSmokeUrl}`);

await assertHttpOk(`${targetSmokeUrl}/api/health`, (body) => {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed.ok === true &&
      parsed.service === "high-ground-studio" &&
      parsed.app === "web" &&
      parsed.sourceSha === sourceSha
    );
  } catch {
    return false;
  }
});

await assertHttpOk(`${targetSmokeUrl}/`, (body) =>
  body.includes("High Ground Odyssey"),
);

await assertHttpOk(`${targetSmokeUrl}/projection-stage/import`, (body) =>
  body.includes("Projection or Content Studio packet JSON"),
);

await assertTeamRedirect(`${targetSmokeUrl}/team/progress`);
await assertTeamRedirect(`${targetSmokeUrl}/team/hgo-publish-queue`);

console.log("\nDeploy complete");
console.log(`Live url: ${serviceUrl}`);
console.log(`Preview url: ${previewUrl}`);

console.log("\nPromote command:");
console.log(`gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-tags=web-preview=100`);

const rollbackRevision = previousRevision || getLatestRevision(serviceBefore);

if (rollbackRevision) {
  console.log("\nRollback command:");
  console.log(
    `gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-revisions=${rollbackRevision}=100`,
  );
} else {
  console.log("\nRollback note:");
  console.log(
    `This was the first ${service} deploy. To remove it, route traffic away or delete the Cloud Run service after confirming no DNS points at it.`,
  );
}
