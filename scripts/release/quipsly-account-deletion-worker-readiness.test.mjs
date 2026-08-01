import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  summarizeReadiness,
} from "./quipsly-account-deletion-worker-readiness.mjs";

const options = parseArguments([]);
const sourceSha = "a".repeat(40);
const member = `serviceAccount:${options.workerServiceAccount}`;
const nestMember = `serviceAccount:${options.nestServiceAccount}`;

function fixture() {
  const secrets = [options.databaseSecret, options.resendSecret, options.senderSecret, options.sharedSecret];
  return {
    options,
    sourceSha,
    imageDocument: { image_summary: { digest: `sha256:${"b".repeat(64)}` } },
    serviceDocument: {
      spec: {
        template: {
          metadata: { annotations: {
            "autoscaling.knative.dev/minScale": "0",
            "autoscaling.knative.dev/maxScale": "1",
          } },
          spec: {
            serviceAccountName: options.workerServiceAccount,
            containerConcurrency: 1,
            timeoutSeconds: 900,
            containers: [{
              image: `${options.imageRepository}:source-${sourceSha}`,
              env: [
                { name: "QUIPSLY_ACCOUNT_DELETION_WORKER_MODE", value: "true" },
                { name: "QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED", value: "true" },
                { name: "QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS", value: options.bucket },
                { name: "FIREBASE_PROJECT_ID", value: options.firebaseProject },
                ...[
                  ["DATABASE_URL", options.databaseSecret],
                  ["RESEND_API_KEY", options.resendSecret],
                  ["HGO_EMAIL_FROM", options.senderSecret],
                  ["QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET", options.sharedSecret],
                ].map(([name, secret]) => ({
                  name,
                  valueFrom: { secretKeyRef: { name: secret, key: "latest" } },
                })),
              ],
            }],
          },
        },
      },
      status: { traffic: [{ revisionName: "worker-00001", percent: 100 }] },
    },
    servicePolicy: { bindings: [{ role: "roles/run.invoker", members: [nestMember] }] },
    projectPolicy: { bindings: [{ role: "roles/cloudsql.client", members: [member] }] },
    firebasePolicy: { bindings: [{ role: "roles/firebaseauth.admin", members: [member] }] },
    bucketPolicy: { bindings: [{ role: "roles/storage.objectUser", members: [member] }] },
    secretDocuments: Object.fromEntries(secrets.map((name) => [name, { state: "ENABLED" }])),
    secretPolicies: Object.fromEntries(secrets.map((name) => [name, {
      bindings: [{
        role: "roles/secretmanager.secretAccessor",
        members: name === options.sharedSecret ? [member, nestMember] : [member],
      }],
    }])),
    publicPages: [
      { url: "https://quipsly.com/privacy/account-deletion", status: 200, ok: true },
      { url: "https://nest.quipsly.com/privacy/account-deletion", status: 200, ok: true },
    ],
    auditedAt: "2026-08-02T00:00:00.000Z",
  };
}

test("readiness operator rejects mutation flags", () => {
  assert.throws(() => parseArguments(["--apply"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--grant"]), /Unknown argument/);
});

test("complete machine state still preserves schema and real deletion proof", () => {
  const receipt = summarizeReadiness(fixture());
  assert.equal(receipt.machineChecksPassed, true);
  assert.equal(receipt.productionReady, false);
  assert.deepEqual(receipt.blockers.map(({ code }) => code), [
    "production-schema-status-proof",
    "disposable-account-deletion-proof",
  ]);
  assert.equal(receipt.externalMutation, false);
});

test("current-style absent worker fails on exact provider and IAM boundaries", () => {
  const current = fixture();
  current.imageDocument = null;
  current.serviceDocument = null;
  current.servicePolicy = null;
  current.projectPolicy = { bindings: [] };
  current.firebasePolicy = { bindings: [] };
  current.bucketPolicy = { bindings: [{ role: "roles/storage.objectViewer", members: [member] }] };
  current.secretDocuments = Object.fromEntries(
    Object.keys(current.secretDocuments).map((name) => [name, null]),
  );
  current.secretPolicies = Object.fromEntries(
    Object.keys(current.secretPolicies).map((name) => [name, null]),
  );
  const codes = new Set(summarizeReadiness(current).blockers.map(({ code }) => code));
  for (const expected of [
    "source-image-missing",
    "worker-service-missing",
    "provider-secrets-missing",
    "worker-secret-access-missing",
    "worker-cloudsql-access-missing",
    "worker-firebase-access-missing",
    "worker-storage-delete-access-missing",
    "nest-shared-secret-access-missing",
  ]) assert.equal(codes.has(expected), true, expected);
});

test("receipt redacts provider secret values", () => {
  const serialized = JSON.stringify(summarizeReadiness(fixture()));
  assert.doesNotMatch(serialized, /database-password|resend-api-value|shared-secret-value/);
  assert.equal(JSON.parse(serialized).secretsPrinted, false);
});

test("worker must be serial, single-instance, and long-running enough for deletion", () => {
  const current = fixture();
  current.serviceDocument.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"] = "2";
  current.serviceDocument.spec.template.spec.timeoutSeconds = 300;
  const receipt = summarizeReadiness(current);
  assert.equal(receipt.machineChecksPassed, false);
  assert.equal(receipt.checks.maximumOneInstance, false);
  assert.equal(receipt.checks.workerTimeoutSufficient, false);
  assert.deepEqual(
    receipt.blockers.filter(({ code }) => code.includes("instance") || code.includes("timeout")).map(({ code }) => code),
    ["worker-instance-count-unbounded", "worker-timeout-insufficient"],
  );
});
