#!/usr/bin/env node

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  project: "high-ground-odyssey",
  firebaseProject: "quipsly-reef",
  region: "us-central1",
  service: "quipsly-account-deletion-worker",
  bucket: "high-ground-odyssey-media",
  workerServiceAccount:
    "quipsly-account-deletion-worker@high-ground-odyssey.iam.gserviceaccount.com",
  nestServiceAccount:
    "studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com",
  databaseSecret: "studio-database-url",
  resendSecret: "quipsly-resend-api-key",
  senderSecret: "quipsly-email-from",
  sharedSecret: "quipsly-account-deletion-worker-shared-secret",
  imageRepository:
    "us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio",
});

function fail(message) {
  throw new Error(message);
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = { ...DEFAULTS, sourceRef: "HEAD", outputPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--project": options.project = requiredValue(argv, index, argument); index += 1; break;
      case "--firebase-project": options.firebaseProject = requiredValue(argv, index, argument); index += 1; break;
      case "--region": options.region = requiredValue(argv, index, argument); index += 1; break;
      case "--service": options.service = requiredValue(argv, index, argument); index += 1; break;
      case "--bucket": options.bucket = requiredValue(argv, index, argument); index += 1; break;
      case "--worker-service-account": options.workerServiceAccount = requiredValue(argv, index, argument); index += 1; break;
      case "--nest-service-account": options.nestServiceAccount = requiredValue(argv, index, argument); index += 1; break;
      case "--database-secret": options.databaseSecret = requiredValue(argv, index, argument); index += 1; break;
      case "--resend-secret": options.resendSecret = requiredValue(argv, index, argument); index += 1; break;
      case "--sender-secret": options.senderSecret = requiredValue(argv, index, argument); index += 1; break;
      case "--shared-secret": options.sharedSecret = requiredValue(argv, index, argument); index += 1; break;
      case "--image-repository": options.imageRepository = requiredValue(argv, index, argument); index += 1; break;
      case "--source": options.sourceRef = requiredValue(argv, index, argument); index += 1; break;
      case "--output": options.outputPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-account-deletion-worker-readiness.mjs [options]

Read-only options:
  --source <commit-ish>             Exact Nest image source (default: HEAD).
  --project <id>                    Worker and media project.
  --firebase-project <id>           Firebase Authentication project.
  --region <region>                 Cloud Run region.
  --service <name>                  Dedicated private worker service.
  --bucket <name>                   Exact deletion-enabled media bucket.
  --worker-service-account <email>  Dedicated destructive worker identity.
  --nest-service-account <email>    Nest invoker identity.
  --database-secret <name>          Database URL secret.
  --resend-secret <name>            Completion-email provider secret.
  --sender-secret <name>            Verified sender secret.
  --shared-secret <name>            Defense-in-depth worker secret.
  --image-repository <uri>          Qualified Nest image repository.
  --output <path>                   Redacted mode-0600 receipt.

There is intentionally no apply, IAM grant, secret write, deploy, traffic, or
deletion mode.
`;
}

function commandJson(command, args, { optional = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    if (optional) return null;
    fail(`${command} ${args[0] ?? ""} failed with exit ${result.status}.`);
  }
  const text = result.stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    fail(`${command} returned invalid JSON.`);
  }
}

function commandText(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${command} ${args[0] ?? ""} failed with exit ${result.status}.`);
  }
  return result.stdout.trim();
}

function bindings(document) {
  return Array.isArray(document?.bindings) ? document.bindings : [];
}

function rolesFor(document, member) {
  return bindings(document)
    .filter((binding) => (binding.members || []).includes(member))
    .map((binding) => binding.role)
    .sort();
}

function hasAnyRole(roleSets, allowed) {
  return roleSets.flat().some((role) => allowed.includes(role));
}

function environmentEntries(service) {
  return service?.spec?.template?.spec?.containers?.[0]?.env ?? [];
}

function environmentMap(service) {
  return Object.fromEntries(environmentEntries(service).map((entry) => [entry.name, entry]));
}

function secretName(entry) {
  return entry?.valueFrom?.secretKeyRef?.name
    || entry?.valueSource?.secretKeyRef?.secret
    || null;
}

function serviceTrafficRevision(service) {
  return (service?.status?.traffic || []).find((entry) => entry.percent > 0)?.revisionName || null;
}

function blocker(blockers, code, message, kind = "provider") {
  blockers.push({ code, kind, message });
}

export function summarizeReadiness({
  options,
  sourceSha,
  imageDocument,
  serviceDocument,
  servicePolicy,
  projectPolicy,
  firebasePolicy,
  bucketPolicy,
  secretDocuments,
  secretPolicies,
  publicPages,
  auditedAt = new Date().toISOString(),
}) {
  const workerMember = `serviceAccount:${options.workerServiceAccount}`;
  const nestMember = `serviceAccount:${options.nestServiceAccount}`;
  const projectRoles = rolesFor(projectPolicy, workerMember);
  const nestProjectRoles = rolesFor(projectPolicy, nestMember);
  const firebaseRoles = rolesFor(firebasePolicy, workerMember);
  const bucketRoles = rolesFor(bucketPolicy, workerMember);
  const serviceInvokerRoles = rolesFor(servicePolicy, nestMember);
  const allUsersRoles = rolesFor(servicePolicy, "allUsers");
  const secretStates = Object.fromEntries(Object.entries(secretDocuments).map(
    ([name, document]) => [name, document?.state ?? null],
  ));
  const secretAccess = Object.fromEntries(Object.entries(secretPolicies).map(
    ([name, document]) => [name, hasAnyRole(
      [rolesFor(document, workerMember), projectRoles],
      ["roles/secretmanager.secretAccessor", "roles/owner"],
    )],
  ));
  const nestSharedSecretAccessReady = hasAnyRole(
    [rolesFor(secretPolicies[options.sharedSecret], nestMember), nestProjectRoles],
    ["roles/secretmanager.secretAccessor", "roles/owner"],
  );
  const env = environmentMap(serviceDocument);
  const expectedSecrets = {
    DATABASE_URL: options.databaseSecret,
    QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY: options.resendSecret,
    QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM: options.senderSecret,
    QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET: options.sharedSecret,
  };
  const secretBindingsCorrect = Object.entries(expectedSecrets).every(
    ([name, expected]) => secretName(env[name]) === expected && typeof env[name]?.value !== "string",
  );
  const expectedImage = `${options.imageRepository}:source-${sourceSha}`;
  const imageDigest = imageDocument?.image_summary?.digest
    || imageDocument?.imageSummary?.digest
    || null;
  const serviceAccount = serviceDocument?.spec?.template?.spec?.serviceAccountName || null;
  const template = serviceDocument?.spec?.template || {};
  const templateAnnotations = template?.metadata?.annotations || {};
  const templateSpec = template?.spec || {};
  const container = serviceDocument?.spec?.template?.spec?.containers?.[0] || {};
  const checks = {
    sourceImageAvailable: /^sha256:[0-9a-f]{64}$/.test(imageDigest || ""),
    workerServiceExists: Boolean(serviceDocument),
    workerUsesDedicatedIdentity: serviceAccount === options.workerServiceAccount,
    workerUsesExpectedImage: container.image === expectedImage
      || Boolean(imageDigest && container.image?.includes(`@${imageDigest}`)),
    workerModeEnabled: env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE?.value === "true",
    executorEnabled: env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED?.value === "true",
    storageAllowlistExact: env.QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS?.value === options.bucket,
    firebaseProjectExact: env.FIREBASE_PROJECT_ID?.value === options.firebaseProject,
    secretVersionsEnabled: Object.values(secretStates).every((state) => state === "ENABLED"),
    secretBindingsCorrect,
    secretAccessReady: Object.values(secretAccess).every(Boolean),
    cloudSqlAccessReady: hasAnyRole([projectRoles], ["roles/cloudsql.client", "roles/cloudsql.admin", "roles/editor", "roles/owner"]),
    firebaseDeleteAccessReady: hasAnyRole([firebaseRoles], ["roles/firebaseauth.admin", "roles/firebase.admin", "roles/editor", "roles/owner"]),
    storageDeleteAccessReady: hasAnyRole(
      [bucketRoles, projectRoles],
      ["roles/storage.objectUser", "roles/storage.objectAdmin", "roles/storage.admin", "roles/storage.legacyBucketOwner", "roles/editor", "roles/owner"],
    ),
    nestInvokerReady: hasAnyRole([serviceInvokerRoles], ["roles/run.invoker", "roles/run.admin", "roles/editor", "roles/owner"]),
    nestSharedSecretAccessReady,
    workerPrivate: allUsersRoles.length === 0,
    singleConcurrency: Number(container?.resources?.limits?.["container-concurrency"] ?? serviceDocument?.spec?.template?.spec?.containerConcurrency) === 1,
    maximumOneInstance: Number(templateAnnotations["autoscaling.knative.dev/maxScale"]) === 1,
    workerTimeoutSufficient: Number(templateSpec.timeoutSeconds) >= 900,
    zeroMinimumInstances: env.QUIPSLY_ACCOUNT_DELETION_WORKER_MIN_INSTANCES?.value !== "1"
      && templateAnnotations["autoscaling.knative.dev/minScale"] !== "1",
    publicPolicyPagesReachable: publicPages.every((page) => page.ok),
  };
  const blockers = [];
  if (!checks.sourceImageAvailable) blocker(blockers, "source-image-missing", `No qualified exact-source image exists at ${expectedImage}.`);
  if (!checks.workerServiceExists) blocker(blockers, "worker-service-missing", `Dedicated worker ${options.service} is not deployed.`);
  if (serviceDocument && !checks.workerUsesDedicatedIdentity) blocker(blockers, "worker-identity-mismatch", "Worker does not use the dedicated service account.", "security");
  if (serviceDocument && !checks.workerUsesExpectedImage) blocker(blockers, "worker-image-mismatch", "Worker does not run the exact selected source image.");
  if (serviceDocument && (!checks.workerModeEnabled || !checks.executorEnabled)) blocker(blockers, "worker-mode-disabled", "Dedicated worker mode and executor gate are not both enabled.");
  if (serviceDocument && !checks.storageAllowlistExact) blocker(blockers, "storage-allowlist-mismatch", "Worker storage allowlist is not the exact approved bucket.", "security");
  if (serviceDocument && !checks.firebaseProjectExact) blocker(blockers, "firebase-project-mismatch", "Worker Firebase project does not match Quipsly identity.", "security");
  if (!checks.secretVersionsEnabled) blocker(blockers, "provider-secrets-missing", "Database, Resend, verified sender, or worker shared-secret version is absent or disabled.", "provider");
  if (serviceDocument && !checks.secretBindingsCorrect) blocker(blockers, "worker-secret-bindings-mismatch", "Worker secret bindings are incomplete or plaintext.", "security");
  if (!checks.secretAccessReady) blocker(blockers, "worker-secret-access-missing", "Dedicated worker cannot access every required secret.", "security");
  if (!checks.cloudSqlAccessReady) blocker(blockers, "worker-cloudsql-access-missing", "Dedicated worker lacks Cloud SQL client access.", "security");
  if (!checks.firebaseDeleteAccessReady) blocker(blockers, "worker-firebase-access-missing", "Dedicated worker lacks Firebase Authentication admin access.", "security");
  if (!checks.storageDeleteAccessReady) blocker(blockers, "worker-storage-delete-access-missing", "Dedicated worker lacks object deletion access on the exact media bucket.", "security");
  if (serviceDocument && !checks.nestInvokerReady) blocker(blockers, "nest-worker-invoker-missing", "Nest cannot invoke the private worker service.", "security");
  if (!checks.nestSharedSecretAccessReady) blocker(blockers, "nest-shared-secret-access-missing", "Nest cannot access the worker defense-in-depth shared secret.", "security");
  if (serviceDocument && !checks.workerPrivate) blocker(blockers, "worker-publicly-invokable", "The destructive worker grants an allUsers role.", "security");
  if (serviceDocument && !checks.singleConcurrency) blocker(blockers, "worker-concurrency-unbounded", "The destructive worker is not constrained to concurrency 1.", "security");
  if (serviceDocument && !checks.maximumOneInstance) blocker(blockers, "worker-instance-count-unbounded", "The destructive worker is not constrained to a maximum of 1 instance.", "security");
  if (serviceDocument && !checks.workerTimeoutSufficient) blocker(blockers, "worker-timeout-insufficient", "The destructive worker does not have the required 900-second timeout.");
  if (!checks.publicPolicyPagesReachable) blocker(blockers, "public-deletion-policy-unreachable", "One or more public account-deletion policy pages failed readback.");
  blocker(blockers, "production-schema-status-proof", "Run immutable production migration status and zero-diff readback for the selected source.", "manual");
  blocker(blockers, "disposable-account-deletion-proof", "Create and delete one disposable production account, then independently prove database, Firebase, GCS, email, receipt, and outsider denial.", "manual");

  return {
    schema: "quipsly-account-deletion-worker-readiness-v1",
    auditedAt,
    mode: "read-only",
    target: {
      project: options.project,
      firebaseProject: options.firebaseProject,
      region: options.region,
      service: options.service,
      bucket: options.bucket,
      sourceSha,
      expectedImage,
      imageDigest,
      workerServiceAccount: options.workerServiceAccount,
      nestServiceAccount: options.nestServiceAccount,
      trafficRevision: serviceTrafficRevision(serviceDocument),
    },
    provider: {
      servicePresent: Boolean(serviceDocument),
      serviceAccount,
      secretStates,
      secretAccess,
      projectRoles,
      nestProjectRoles,
      firebaseRoles,
      bucketRoles,
      serviceInvokerRoles,
      publicPages,
    },
    checks,
    machineChecksPassed: Object.values(checks).every(Boolean),
    productionReady: false,
    blockers,
    externalMutation: false,
    secretsPrinted: false,
  };
}

async function readPublicPage(url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok && /account deletion/i.test(body),
    };
  } catch {
    return { url, status: null, ok: false };
  }
}

async function discover(options) {
  const sourceSha = commandText("git", ["rev-parse", "--verify", `${options.sourceRef}^{commit}`]);
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail("Selected source did not resolve to a commit SHA.");
  const imageDocument = commandJson("gcloud", [
    "artifacts", "docker", "images", "describe",
    `${options.imageRepository}:source-${sourceSha}`,
    `--project=${options.project}`,
    "--format=json",
  ], { optional: true });
  const serviceDocument = commandJson("gcloud", [
    "run", "services", "describe", options.service,
    `--project=${options.project}`, `--region=${options.region}`, "--format=json",
  ], { optional: true });
  const servicePolicy = serviceDocument ? commandJson("gcloud", [
    "run", "services", "get-iam-policy", options.service,
    `--project=${options.project}`, `--region=${options.region}`, "--format=json",
  ], { optional: true }) : null;
  const [projectPolicy, firebasePolicy, bucketPolicy] = [
    commandJson("gcloud", ["projects", "get-iam-policy", options.project, "--format=json"]),
    commandJson("gcloud", ["projects", "get-iam-policy", options.firebaseProject, "--format=json"]),
    commandJson("gcloud", ["storage", "buckets", "get-iam-policy", `gs://${options.bucket}`, "--format=json"]),
  ];
  const secretNames = [options.databaseSecret, options.resendSecret, options.senderSecret, options.sharedSecret];
  const secretDocuments = {};
  const secretPolicies = {};
  for (const name of secretNames) {
    secretDocuments[name] = commandJson("gcloud", [
      "secrets", "versions", "describe", "latest", `--secret=${name}`,
      `--project=${options.project}`, "--format=json",
    ], { optional: true });
    secretPolicies[name] = commandJson("gcloud", [
      "secrets", "get-iam-policy", name, `--project=${options.project}`, "--format=json",
    ], { optional: true });
  }
  const publicPages = await Promise.all([
    readPublicPage("https://quipsly.com/privacy/account-deletion"),
    readPublicPage("https://nest.quipsly.com/privacy/account-deletion"),
  ]);
  return {
    sourceSha,
    imageDocument,
    serviceDocument,
    servicePolicy,
    projectPolicy,
    firebasePolicy,
    bucketPolicy,
    secretDocuments,
    secretPolicies,
    publicPages,
  };
}

async function writeReceipt(outputPath, receipt) {
  if (!outputPath) return;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

export async function run(options) {
  const documents = await discover(options);
  const receipt = summarizeReadiness({ options, ...documents });
  await writeReceipt(options.outputPath, receipt);
  return receipt;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const receipt = await run(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.productionReady) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
