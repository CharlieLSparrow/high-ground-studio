import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_READBACK_SCHEMA,
  parseArguments,
  summarizeCloudRunCapabilities,
} from "./quipsly-cloud-run-capability-readback.mjs";

const secret = (name) => ({
  name,
  valueFrom: { secretKeyRef: { name: `secret-for-${name}`, key: "latest" } },
});
const plain = (name, value) => ({ name, value });

function fixture() {
  const sourceSha = "a".repeat(40);
  return {
    metadata: { name: "studio" },
    spec: {
      template: {
        metadata: {
          annotations: {
            "autoscaling.knative.dev/minScale": "0",
            "autoscaling.knative.dev/maxScale": "2",
          },
        },
        spec: {
          serviceAccountName: "studio@high-ground-odyssey.iam.gserviceaccount.com",
          containerConcurrency: 8,
          timeoutSeconds: 900,
          containers: [{
            image: `us-central1-docker.pkg.dev/project/repo/studio@sha256:${"b".repeat(64)}`,
            env: [
              plain("QUIPSLY_SOURCE_SHA", sourceSha),
              plain("QUIPSLY_RELEASE_CHANNEL", "production"),
              secret("LIVEKIT_URL"), secret("LIVEKIT_API_KEY"), secret("LIVEKIT_API_SECRET"),
              secret("LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON"), secret("LIVEKIT_EGRESS_GCS_BUCKET"),
              plain("LIVEKIT_EGRESS_ENABLED", "true"),
              secret("GOOGLE_CALENDAR_OAUTH_CLIENT_ID"), secret("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
              secret("GOOGLE_CALENDAR_OAUTH_STATE_SECRET"), secret("GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY"),
              plain("GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT", "calendar@example.iam.gserviceaccount.com"),
              plain("GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE", "https://studio.example.run.app"),
              secret("GOOGLE_DRIVE_OAUTH_CLIENT_ID"), secret("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"),
              secret("GOOGLE_DRIVE_OAUTH_STATE_SECRET"), secret("GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY"),
              secret("GOOGLE_DRIVE_PICKER_API_KEY"), secret("GOOGLE_DRIVE_PICKER_APP_ID"),
              secret("QUIPSLY_SESSION_INVITATION_RESEND_API_KEY"), secret("QUIPSLY_RESEND_WEBHOOK_SECRET"),
              plain("QUIPSLY_SESSION_INVITATION_EMAIL_FROM", "invites@notify.quipsly.com"),
              plain("QUIPSLY_TRANSCRIPT_WORKER_ENABLED", "1"),
              plain("QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID", "high-ground-odyssey"),
              plain("QUIPSLY_TRANSCRIPT_WORKER_REGION", "us-central1"),
              plain("QUIPSLY_TRANSCRIPT_WORKER_JOB", "quipsly-transcript-worker"),
              plain("QUIPSLY_TRANSCRIPT_PROVIDER", "deepgram"),
              plain("QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED", "true"),
              plain("QUIPSLY_ACCOUNT_DELETION_WORKER_URL", "https://delete.example.run.app"),
              secret("QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET"),
              plain("QUIPSLY_ALLOW_LIVE_STRIPE_SAAS", "true"),
              plain("QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT", "true"),
              secret("STRIPE_SECRET_KEY"), secret("QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID"),
              secret("QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID"),
              plain("QUIPSLY_GA_MEASUREMENT_ID", "G-47PCQGW8ZB"),
              plain("QUIPSLY_GA_PROPERTY_ID", "503353241"),
              plain("APP_STORE_BUNDLE_ID", "com.highgroundodyssey.HighGroundCapture"),
              plain("APP_STORE_APP_APPLE_ID", "6780995957"),
              plain("APP_STORE_ENABLE_ONLINE_CHECKS", "true"),
            ],
          }],
        },
      },
    },
    status: {
      latestReadyRevisionName: "studio-00600-abc",
      latestCreatedRevisionName: "studio-00600-abc",
      traffic: [{ revisionName: "studio-00600-abc", percent: 100 }],
    },
  };
}

test("summarizes a fully configured runtime without exposing secret references", () => {
  const report = summarizeCloudRunCapabilities(fixture(), {
    auditedAt: "2026-09-03T20:00:00.000Z",
  });
  assert.equal(report.schema, CAPABILITY_READBACK_SCHEMA);
  assert.equal(report.release.exactSourceIdentity, true);
  assert.equal(report.release.committedSourceIdentity, true);
  assert.equal(report.release.immutableImageIdentity, true);
  assert.equal(report.release.readyRevisionIdentified, true);
  assert.equal(report.runtime.maxInstances, 2);
  assert.deepEqual(report.warnings, []);
  for (const capability of Object.values(report.capabilities)) {
    assert.equal(capability.ready ?? capability.configured, true);
  }
  assert.equal(report.capabilities.providerEgress.enabled, true);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /secret-for-/);
  assert.doesNotMatch(serialized, /valueFrom|secretKeyRef/);
});

test("reports missing integrations and unsafe traffic without leaking unknown environment values", () => {
  const service = fixture();
  service.status.traffic = [
    { revisionName: "studio-00599-old", percent: 50 },
    { revisionName: "studio-00600-abc", percent: 50 },
  ];
  service.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"] = "1";
  service.spec.template.spec.containers[0].env = [
    plain("QUIPSLY_SOURCE_SHA", "not-a-sha"),
    plain("PRIVATE_UNKNOWN_VALUE", "must-not-appear"),
    plain("LIVEKIT_EGRESS_ENABLED", "true"),
  ];
  const report = summarizeCloudRunCapabilities(service);
  assert.equal(report.release.exactSourceIdentity, false);
  assert.equal(report.capabilities.liveConversation.ready, false);
  assert.equal(report.capabilities.providerEgress.configured, false);
  assert.equal(report.warnings.length, 4);
  assert.doesNotMatch(JSON.stringify(report), /must-not-appear|PRIVATE_UNKNOWN_VALUE/);
});

test("does not call a mutable image tag an exact release identity", () => {
  const service = fixture();
  service.spec.template.spec.containers[0].image =
    "us-central1-docker.pkg.dev/project/repo/studio:source-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const report = summarizeCloudRunCapabilities(service);
  assert.equal(report.release.committedSourceIdentity, true);
  assert.equal(report.release.immutableImageIdentity, false);
  assert.equal(report.release.exactSourceIdentity, false);
  assert.match(report.warnings.join("\n"), /immutable image digest/);
});

test("distinguishes absent capabilities from dangerous partial configuration", () => {
  const service = fixture();
  service.spec.template.spec.containers[0].env = [
    plain("QUIPSLY_SOURCE_SHA", "a".repeat(40)),
    secret("GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
  ];
  const report = summarizeCloudRunCapabilities(service);
  assert.deepEqual(report.capabilities.googleCalendar, {
    configured: false,
    ready: false,
  });
  assert.deepEqual(report.capabilities.googleDrive, {
    configured: true,
    ready: false,
  });
  assert.match(report.warnings.join("\n"), /Google Drive is only partially configured/);
});

test("parses only the bounded readback arguments", () => {
  assert.deepEqual(
    parseArguments([
      "--project", "project-id",
      "--region", "us-east1",
      "--service", "nest",
      "--service-json", "/tmp/service.json",
      "--output", "/tmp/report.json",
    ]),
    {
      project: "project-id",
      region: "us-east1",
      service: "nest",
      serviceJson: "/tmp/service.json",
      output: "/tmp/report.json",
    },
  );
  assert.throws(() => parseArguments(["--unknown", "value"]));
});
