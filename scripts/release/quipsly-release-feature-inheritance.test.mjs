import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveReleaseFeatureFlags,
  RELEASE_FEATURE_KEYS,
  serializeReleaseFeatureFlags,
} from "./quipsly-release-feature-inheritance.mjs";

const secret = (name) => ({
  name,
  valueFrom: { secretKeyRef: { name: `secret-for-${name}`, key: "latest" } },
});
const plain = (name, value) => ({ name, value });

function serviceWith(environment) {
  return {
    spec: {
      template: {
        spec: {
          containers: [{
            image: `example.invalid/studio@sha256:${"b".repeat(64)}`,
            env: environment,
          }],
        },
      },
    },
    status: {
      latestReadyRevisionName: "studio-1",
      traffic: [{ revisionName: "studio-1", percent: 100 }],
    },
  };
}

test("inherits every complete live capability as an enabled release flag", () => {
  const flags = deriveReleaseFeatureFlags(serviceWith([
    secret("LIVEKIT_URL"), secret("LIVEKIT_API_KEY"), secret("LIVEKIT_API_SECRET"),
    secret("LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON"), secret("LIVEKIT_EGRESS_GCS_BUCKET"),
    plain("LIVEKIT_EGRESS_ENABLED", "true"),
    secret("GOOGLE_CALENDAR_OAUTH_CLIENT_ID"), secret("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
    secret("GOOGLE_CALENDAR_OAUTH_STATE_SECRET"), secret("GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY"),
    plain("GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT", "calendar@example.invalid"),
    plain("GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE", "https://studio.example.invalid"),
    secret("GOOGLE_DRIVE_OAUTH_CLIENT_ID"), secret("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"),
    secret("GOOGLE_DRIVE_OAUTH_STATE_SECRET"), secret("GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY"),
    secret("GOOGLE_DRIVE_PICKER_API_KEY"), secret("GOOGLE_DRIVE_PICKER_APP_ID"),
    secret("QUIPSLY_SESSION_INVITATION_RESEND_API_KEY"), secret("QUIPSLY_RESEND_WEBHOOK_SECRET"),
    plain("QUIPSLY_SESSION_INVITATION_EMAIL_FROM", "invites@example.invalid"),
    plain("QUIPSLY_SITE_URL", "https://nest.quipsly.com"),
    plain("QUIPSLY_TRANSCRIPT_WORKER_ENABLED", "1"),
    plain("QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID", "project"),
    plain("QUIPSLY_TRANSCRIPT_WORKER_REGION", "region"),
    plain("QUIPSLY_TRANSCRIPT_WORKER_JOB", "job"),
    plain("QUIPSLY_TRANSCRIPT_PROVIDER", "deepgram"),
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED", "true"),
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_URL", "https://delete.example.invalid"),
    secret("QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET"),
    plain("QUIPSLY_ALLOW_LIVE_STRIPE_SAAS", "true"),
    plain("QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT", "true"),
    secret("STRIPE_SECRET_KEY"), secret("QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID"),
    secret("QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID"),
  ]));
  assert.deepEqual(Object.keys(flags), RELEASE_FEATURE_KEYS);
  assert.ok(Object.values(flags).every((value) => value === "1"));
  assert.equal(serializeReleaseFeatureFlags(flags).trim().split("\n").length, 9);
});

test("inherits absent optional capabilities as disabled", () => {
  const flags = deriveReleaseFeatureFlags(serviceWith([]));
  assert.ok(Object.values(flags).every((value) => value === "0"));
});

test("inherits deliberately disabled staged capabilities without an override", () => {
  const flags = deriveReleaseFeatureFlags(serviceWith([
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED", "false"),
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_URL", "https://delete.example.invalid"),
    secret("QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET"),
    plain("QUIPSLY_ALLOW_LIVE_STRIPE_SAAS", "false"),
    plain("QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT", "false"),
    secret("STRIPE_SECRET_KEY"),
  ]));
  assert.equal(flags.ENABLE_ACCOUNT_DELETION_WORKER, "0");
  assert.equal(flags.ENABLE_STRIPE_SAAS, "0");
});

test("fails closed instead of disabling a partially configured live capability", () => {
  assert.throws(
    () => deriveReleaseFeatureFlags(serviceWith([
      secret("GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
    ])),
    /partially configured Google Drive/,
  );
  assert.throws(
    () => deriveReleaseFeatureFlags(serviceWith([
      plain("LIVEKIT_EGRESS_ENABLED", "true"),
    ])),
    /enabled LiveKit egress/,
  );
});

test("an explicit feature choice bypasses only that capability's partial-state inheritance", () => {
  const service = serviceWith([
    secret("GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED", "true"),
    plain("QUIPSLY_ACCOUNT_DELETION_WORKER_URL", "https://delete.example.invalid"),
  ]);
  assert.throws(
    () => deriveReleaseFeatureFlags(service),
    /partially configured Google Drive/,
  );
  assert.throws(
    () => deriveReleaseFeatureFlags(service, {
      explicitFeatureKeys: ["ENABLE_GOOGLE_DRIVE_OAUTH"],
    }),
    /partially configured account deletion/,
  );
  const flags = deriveReleaseFeatureFlags(service, {
    explicitFeatureKeys: [
      "ENABLE_GOOGLE_DRIVE_OAUTH",
      "ENABLE_ACCOUNT_DELETION_WORKER",
    ],
  });
  assert.equal(flags.ENABLE_GOOGLE_DRIVE_OAUTH, "0");
  assert.equal(flags.ENABLE_ACCOUNT_DELETION_WORKER, "0");
});

test("rejects unknown explicit feature keys", () => {
  assert.throws(
    () => deriveReleaseFeatureFlags(serviceWith([]), {
      explicitFeatureKeys: ["ENABLE_MYSTERY_SERVICE"],
    }),
    /Unknown explicit release feature key/,
  );
});
