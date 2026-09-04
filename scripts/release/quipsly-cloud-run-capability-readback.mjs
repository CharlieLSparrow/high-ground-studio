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
const any = (values) => values.some(Boolean);

const capabilityState = (checks) => ({
  configured: any(checks),
  ready: all(checks),
});

function environmentMap(serviceDocument) {
  const container = serviceDocument?.spec?.template?.spec?.containers?.[0]
    ?? serviceDocument?.spec?.containers?.[0]
    ?? serviceDocument?.template?.containers?.[0]
    ?? {};
  return Object.fromEntries(
    (container.env ?? [])
      .filter((entry) => typeof entry?.name === "string")
      .map((entry) => [entry.name, entry]),
  );
}

function runtimeShape(serviceDocument) {
  const template = serviceDocument?.spec?.template
    ?? serviceDocument?.template
    ?? {
      metadata: serviceDocument?.metadata ?? {},
      spec: serviceDocument?.spec ?? {},
    };
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

export function servingRevisionName(serviceDocument) {
  const production = productionTraffic(serviceDocument)
    .filter((entry) => entry.percent > 0 && !entry.tag);
  return production.length === 1 && production[0]?.percent === 100
    ? production[0].revision
    : "";
}

export function summarizeCloudRunCapabilities(
  serviceDocument,
  {
    project = "high-ground-odyssey",
    region = "us-central1",
    service = "studio",
    auditedAt = new Date().toISOString(),
    runtimeDocument = serviceDocument,
    auditedRevision = "",
  } = {},
) {
  const environment = environmentMap(runtimeDocument);
  const runtime = runtimeShape(runtimeDocument);
  const traffic = productionTraffic(serviceDocument);
  const production = traffic.filter((entry) => entry.percent > 0 && !entry.tag);
  const servingRevision = servingRevisionName(serviceDocument);
  const runtimeRevision = auditedRevision
    || serviceDocument?.status?.latestReadyRevisionName
    || "";
  const sourceSha = environment.QUIPSLY_SOURCE_SHA?.value ?? "";
  const releaseChannel = environment.QUIPSLY_RELEASE_CHANNEL?.value ?? "";

  const liveConversation = capabilityState([
    hasSecret(environment, "LIVEKIT_URL"),
    hasSecret(environment, "LIVEKIT_API_KEY"),
    hasSecret(environment, "LIVEKIT_API_SECRET"),
  ]);
  const egressConfigured = all([
    hasSecret(environment, "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON"),
    hasSecret(environment, "LIVEKIT_EGRESS_GCS_BUCKET"),
  ]);
  const calendar = capabilityState([
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_ID"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_STATE_SECRET"),
    hasSecret(environment, "GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY"),
    hasPlain(environment, "GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT"),
    hasPlain(environment, "GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE"),
  ]);
  const drive = capabilityState([
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_STATE_SECRET"),
    hasSecret(environment, "GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY"),
    hasSecret(environment, "GOOGLE_DRIVE_PICKER_API_KEY"),
    hasSecret(environment, "GOOGLE_DRIVE_PICKER_APP_ID"),
  ]);
  const invitationEmail = capabilityState([
    hasSecret(environment, "QUIPSLY_SESSION_INVITATION_RESEND_API_KEY"),
    hasSecret(environment, "QUIPSLY_RESEND_WEBHOOK_SECRET"),
    hasPlain(environment, "QUIPSLY_SESSION_INVITATION_EMAIL_FROM"),
  ]);
  const transcriptDispatch = capabilityState([
    booleanValue(environment.QUIPSLY_TRANSCRIPT_WORKER_ENABLED),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_REGION"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_WORKER_JOB"),
    hasPlain(environment, "QUIPSLY_TRANSCRIPT_PROVIDER"),
  ]);
  const accountDeletion = capabilityState([
    booleanValue(environment.QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED),
    hasPlain(environment, "QUIPSLY_ACCOUNT_DELETION_WORKER_URL"),
    hasSecret(environment, "QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET"),
  ]);
  const subscriptions = capabilityState([
    booleanValue(environment.QUIPSLY_ALLOW_LIVE_STRIPE_SAAS),
    booleanValue(environment.QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT),
    hasSecret(environment, "STRIPE_SECRET_KEY"),
    hasSecret(environment, "QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID"),
    hasSecret(environment, "QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID"),
  ]);
  const analytics = capabilityState([
    /^G-[A-Z0-9]+$/.test(environment.QUIPSLY_GA_MEASUREMENT_ID?.value ?? ""),
    /^[0-9]{6,20}$/.test(environment.QUIPSLY_GA_PROPERTY_ID?.value ?? ""),
  ]);
  const appStoreReceiptChecks = capabilityState([
    hasPlain(environment, "APP_STORE_BUNDLE_ID"),
    hasPlain(environment, "APP_STORE_APP_APPLE_ID"),
    booleanValue(environment.APP_STORE_ENABLE_ONLINE_CHECKS),
  ]);
  const committedSourceIdentity = /^[0-9a-f]{40}$/.test(sourceSha);
  const immutableImageIdentity = /@sha256:[0-9a-f]{64}$/.test(runtime.image);
  const servingRevisionIdentified = Boolean(runtimeRevision)
    && runtimeRevision === servingRevision;
  const releaseIdentity = committedSourceIdentity
    && immutableImageIdentity
    && servingRevisionIdentified;

  const warnings = [];
  if (production.length !== 1 || production[0]?.percent !== 100) {
    warnings.push("Production traffic is not pinned 100% to one untagged revision.");
  }
  if (!releaseIdentity) {
    warnings.push("The serving revision is missing a committed source SHA, immutable image digest, or exact traffic identity.");
  }
  if (servingRevision && releaseChannel !== "production") {
    warnings.push("The revision serving production traffic is not labeled with the production release channel.");
  }
  if (runtime.maxInstances < 2) {
    warnings.push("The service cannot scale to two instances during replacement or load.");
  }
  if (booleanValue(environment.LIVEKIT_EGRESS_ENABLED) && !egressConfigured) {
    warnings.push("LiveKit egress is enabled without both protected destination bindings.");
  }
  for (const [label, state] of [
    ["LiveKit conversation", liveConversation],
    ["Google Calendar", calendar],
    ["Google Drive", drive],
    ["invitation email", invitationEmail],
    ["transcript dispatch", transcriptDispatch],
    ["account deletion", accountDeletion],
    ["subscriptions", subscriptions],
    ["analytics", analytics],
    ["App Store receipt checks", appStoreReceiptChecks],
  ]) {
    if (state.configured && !state.ready) {
      warnings.push(`${label} is only partially configured.`);
    }
  }

  return {
    schema: CAPABILITY_READBACK_SCHEMA,
    auditedAt,
    target: { project, region, service },
    revision: {
      latestReady: serviceDocument?.status?.latestReadyRevisionName ?? "",
      latestCreated: serviceDocument?.status?.latestCreatedRevisionName ?? "",
      serving: servingRevision,
      audited: runtimeRevision,
      traffic,
    },
    release: {
      exactSourceIdentity: releaseIdentity,
      committedSourceIdentity,
      immutableImageIdentity,
      servingRevisionIdentified,
      // Compatibility alias for existing report consumers. This now means that
      // the audited revision is the sole revision serving production traffic.
      readyRevisionIdentified: servingRevisionIdentified,
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
      liveConversation,
      providerEgress: {
        configured: egressConfigured,
        enabled: booleanValue(environment.LIVEKIT_EGRESS_ENABLED),
      },
      googleCalendar: calendar,
      googleDrive: drive,
      invitationEmail,
      transcriptDispatch,
      accountDeletion,
      subscriptions,
      analytics,
      appStoreReceiptChecks,
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

function readServingRevisionDocument(options, serviceDocument) {
  if (options.serviceJson) return null;
  const revision = servingRevisionName(serviceDocument);
  if (!revision) return null;
  const output = execFileSync(
    process.env.GCLOUD_BIN || "gcloud",
    [
      "run",
      "revisions",
      "describe",
      revision,
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
  const serviceDocument = readServiceDocument(options);
  const runtimeDocument = readServingRevisionDocument(options, serviceDocument)
    ?? serviceDocument;
  const report = summarizeCloudRunCapabilities(serviceDocument, {
    ...options,
    runtimeDocument,
    auditedRevision: runtimeDocument === serviceDocument
      ? serviceDocument?.status?.latestReadyRevisionName ?? ""
      : runtimeDocument?.metadata?.name ?? "",
  });
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
