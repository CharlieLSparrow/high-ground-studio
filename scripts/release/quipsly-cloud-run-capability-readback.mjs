#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CAPABILITY_READBACK_SCHEMA =
  "quipsly-cloud-run-capability-readback-v1";

const booleanValue = (entry) =>
  String(entry?.value ?? "").trim().toLowerCase() === "true"
    || String(entry?.value ?? "").trim() === "1";

const presentValue = (entry) =>
  typeof entry?.value === "string" && entry.value.trim().length > 0;

const secretReference = (entry) =>
  entry?.valueFrom?.secretKeyRef?.name
  ?? entry?.valueSource?.secretKeyRef?.secret
  ?? "";

const hasSecret = (environment, name) => Boolean(secretReference(environment[name]));

const hasPlain = (environment, name) => presentValue(environment[name]);

const all = (values) => values.every(Boolean);

function environmentMap(serviceDocument) {
  const container = serviceDocument?.spec?.template?.spec?.containers?.[0]
    ?? serviceDocument?.template?.containers?.[0]
    ?? {};
  return Object.fromEntries(
    (container.env ?? [])
      .filter((entry) => typeof entry?.name === "string")
      .map((entry) => [entry.name, entry]),
  );
}

function runtimeShape(serviceDocument) {
  const template = serviceDocument?.spec?.template ?? serviceDocument?.template ?? {};
  const spec = template?.spec ?? template;
  const metadata = template?.metadata ?? {};
  const annotations = metadata?.annotations ?? {};
  const container = spec?.containers?.[0] ?? {};
  return {
    serviceAccount: spec?.serviceAccountName ?? spec?.serviceAccount ?? "",
    minInstances: Number(
      annotations["autoscaling.knative.dev/minScale"]
      ?? serviceDocument?.scaling?.minInstanceCount
      ?? 0,
    ),
    maxInstances: Number(
      annotations["autoscaling.knative.dev/maxScale"]
      ?? serviceDocument?.scaling?.maxInstanceCount
      ?? 0,
    ),
    concurrency: Number(spec?.containerConcurrency ?? container?.maxInstanceRequestConcurrency ?? 0),
    timeoutSeconds: Number(spec?.timeoutSeconds ?? String(container?.timeout ?? "0").replace(/s$/, "") ?? 0),
    image: container?.image ?? "",
  };
}

function productionTraffic(serviceDocument) {
  const traffic = serviceDocument?.status?.traffic ?? serviceDocument?.trafficStatuses ?? [];
  return traffic.map((entry) => ({
    revision: entry?.revisionName ?? entry?.revision ?? "",
    percent: Number(entry?.percent ?? 0),
    tag: entry?.tag ?? "",
  }));
}

export function summarizeCloudRunCapabilities(
  serviceDocument,
  {
    project = "high-ground-odyssey",
    region = "us-central1",
    service = "studio",
    auditedAt = new Date().toISOString(),
  } = {},
) {
  const environment = environmentMap(serviceDocument);
  const runtime = runtimeShape(serviceDocument);
  const traffic = productionTraffic(serviceDocument);
  const production = traffic.filter((entry) => entry.percent > 0 && !entry.tag);
  const sourceSha = environment.QUIPSLY_SOURCE_SHA?.value ?? "";
  const releaseChannel = environment.QUIPSLY_RELEASE_CHANNEL?.value ?? "";

  const liveConversation = all([
    hasSecret(environment, "LIVEKIT_URL"),
    hasSecret(environment, "LIVEKIT_API_KEY"),
    hasSecret(environment, "LIVEKIT_API_SECRET"),
  ]);
  const egressConfigured = all([
    hasSecret(environment, "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON"),
    hasSecret(environment, "LIVEKIT_EGRESS_GCS_BUCKET"),
  ]);
  const calendar = all([
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_ID"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_STATE_SECRET"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY"),
    hasPlain(environment, "GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT"),
    hasPlain(environment, "GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE"),
  ]);
  const drive = all([
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_STATE_SECRET"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY"),
    hasSecret(environment, "GOOGLE_DRIVE_PICKER_API_KEY"),
    hasSecret(environment, "GOOGLE_DRIVE_PICKER_APP_ID"),
  ]);
  const invitationEmail = all([
    hasSecret(environment, "QUIPSLY_SESSION_INVITATION_RESEND_API_KEY"),
    hasSecret(environment, "QUIPSLY_RESEND_WEBHOOK_SECRET"),
    hasPlain(environment, "QUIPSLY_SESSION_INVITATION_EMAIL_FROM"),
  ]);
  const transcriptDispatch = all([
    booleanValue(environment.QUIPSLY_TRANSCRIPT_WORKER_ENABLED),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_REGION"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_JOB"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_PROVIDER"),
  ]);
  const accountDeletion = all([
    booleanValue(environment.QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED),
    hasPlain(environment, "QUIPSLY_ACCOUNT_DELETION_WORKER_URL"),
    hasSecret(environment, "QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET"),
  ]);
  const subscriptions = all([
    booleanValue(environment.QUIPSLY_ALLOW_LIVE_STRIPE_SAAS),
    booleanValue(environment.QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT),
    hasSecret(environment, "STRIPE_SECRET_KEY"),
    hasSecret(environment, "QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID"),
    hasSecret(environment, "QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID"),
  ]);
  const analytics = /^G-[A-Z0-9]+$/.test(
    environment.QUIPSLY_GA_MEASUREMENT_ID?.value ?? "",
  ) && /^[0-9]{6,20}$/.test(
    environment.QUIPSLY_GA_PROPERTY_ID?.value ?? "",
  );
  const releaseIdentity = /^[0-9a-f]{40}$/.test(sourceSha)
    && Boolean(runtime.image)
    && Boolean(serviceDocument?.status?.latestReadyRevisionName);

  const warnings = [];
  if (production.length !== 1 || production[0]?.percent !== 100) {
    warnings.push("Production traffic is not pinned 100% to one untagged revision.");
  }
  if (!releaseIdentity) {
    warnings.push("The ready revision is missing an exact committed source identity or image.");
  }
  if (runtime.maxInstances < 2) {
    warnings.push("The service cannot scale to two instances during replacement or load.");
  }
  if (booleanValue(environment.LIVEKIT_EGRESS_ENABLED) && !egressConfigured) {
    warnings.push("LiveKit egress is enabled without both protected destination bindings.");
  }

  return {
    schema: CAPABILITY_READBACK_SCHEMA,
    auditedAt,
    target: { project, region, service },
    revision: {
      latestReady: serviceDocument?.status?.latestReadyRevisionName ?? "",
      latestCreated: serviceDocument?.status?.latestCreatedRevisionName ?? "",
      traffic,
    },
    release: {
      exactSourceIdentity: releaseIdentity,
      sourceSha,
      releaseChannel,
      image: runtime.image,
    },
    runtime: {
      serviceAccountConfigured: Boolean(runtime.serviceAccount),
      minInstances: runtime.minInstances,
      maxInstances: runtime.maxInstances,
      concurrency: runtime.concurrency,
      timeoutSeconds: runtime.timeoutSeconds,
    },
    capabilities: {
      liveConversation: { ready: liveConversation },
      providerEgress: {
        configured: egressConfigured,
        enabled: booleanValue(environment.LIVEKIT_EGRESS_ENABLED),
      },
      googleCalendar: { ready: calendar },
      googleDrive: { ready: drive },
      invitationEmail: { ready: invitationEmail },
      transcriptDispatch: { ready: transcriptDispatch },
      accountDeletion: { ready: accountDeletion },
      subscriptions: { ready: subscriptions },
      analytics: { ready: analytics },
      appStoreReceiptChecks: {
        ready: all([
          hasPlain(environment, "APP_STORE_BUNDLE_ID"),
          hasPlain(environment, "APP_STORE_APP_APPLE_ID"),
          booleanValue(environment.APP_STORE_ENABLE_ONLINE_CHECKS),
        ]),
      },
    },
    warnings,
  };
}

export function parseArguments(argv) {
  const options = {
    project: "high-ground-odyssey",
    region: "us-central1",
    service: "studio",
    serviceJson: "",
    output: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--project" && next) options.project = next;
    else if (value === "--region" && next) options.region = next;
    else if (value === "--service" && next) options.service = next;
    else if (value === "--service-json" && next) options.serviceJson = next;
    else if (value === "--output" && next) options.output = next;
    else throw new Error(`Unknown or incomplete argument: ${value}`);
    index += 1;
  }
  return options;
}

function readServiceDocument(options) {
  if (options.serviceJson) {
    return JSON.parse(readFileSync(options.serviceJson, "utf8"));
  }
  const output = execFileSync(
    process.env.GCLOUD_BIN || "gcloud",
    [
      "run",
      "services",
      "describe",
      options.service,
      `--project=${options.project}`,
      `--region=${options.region}`,
      "--format=json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(output);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = summarizeCloudRunCapabilities(readServiceDocument(options), options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    writeFileSync(options.output, serialized, { encoding: "utf8", mode: 0o600 });
    chmodSync(options.output, 0o600);
  } else {
    process.stdout.write(serialized);
  }
  if (report.warnings.length > 0) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
