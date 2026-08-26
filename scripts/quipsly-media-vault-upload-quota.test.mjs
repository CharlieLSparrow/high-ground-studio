import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const policy = await import(pathToFileURL(path.join(
  root,
  "apps/quipsly/src/lib/server/media-vault-upload-reservation-policy.js",
)).href);

const limits = {
  rollingWindowHours: 24,
  issuanceWindowMinutes: 60,
  actorRollingBytes: 1_000,
  nestRollingBytes: 5_000,
  actorIssuanceLimit: 3,
  nestIssuanceLimit: 8,
  actorActiveLimit: 2,
  nestActiveLimit: 6,
  abandonAfterHours: 24,
};

const usage = (overrides = {}) => ({
  rollingBytes: 0,
  issuanceCount: 0,
  activeCount: 0,
  ...overrides,
});

test("quota policy accounts for a newly allowed reservation exactly once", () => {
  const decision = policy.evaluateMediaVaultUploadQuota({
    requestedSizeBytes: 250,
    actor: usage({ rollingBytes: 100, issuanceCount: 1, activeCount: 1 }),
    nest: usage({ rollingBytes: 1_000, issuanceCount: 2, activeCount: 3 }),
    limits,
  });
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.actor, { rollingBytes: 350, issuanceCount: 2, activeCount: 2 });
  assert.deepEqual(decision.nest, { rollingBytes: 1_250, issuanceCount: 3, activeCount: 4 });
});

for (const scenario of [
  ["actor rolling bytes", usage({ rollingBytes: 900 }), usage(), "UPLOAD_ACTOR_ROLLING_BYTES_EXCEEDED"],
  ["Nest rolling bytes", usage(), usage({ rollingBytes: 4_900 }), "UPLOAD_NEST_ROLLING_BYTES_EXCEEDED"],
  ["actor issuance rate", usage({ issuanceCount: 3 }), usage(), "UPLOAD_ACTOR_ISSUANCE_RATE_EXCEEDED"],
  ["Nest issuance rate", usage(), usage({ issuanceCount: 8 }), "UPLOAD_NEST_ISSUANCE_RATE_EXCEEDED"],
  ["actor active limit", usage({ activeCount: 2 }), usage(), "UPLOAD_ACTOR_ACTIVE_RESERVATIONS_EXCEEDED"],
  ["Nest active limit", usage(), usage({ activeCount: 6 }), "UPLOAD_NEST_ACTIVE_RESERVATIONS_EXCEEDED"],
]) {
  test(`quota policy rejects ${scenario[0]}`, () => {
    const decision = policy.evaluateMediaVaultUploadQuota({
      requestedSizeBytes: 250,
      actor: scenario[1],
      nest: scenario[2],
      limits,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, scenario[3]);
    assert.ok(decision.retryAfterSeconds > 0);
  });
}

test("exact request ID binding rejects mutation but permits byte-identical retry", () => {
  const binding = {
    lane: "MEDIA_VAULT_PRESIGNED",
    requestId: "b43ad1b9-1d64-4a8e-a0a0-b3b7ad90d401",
    actorUserId: "actor-1",
    actorEmail: "actor@example.com",
    projectId: "project-1",
    projectSlug: "nest-1",
    bucketName: "bucket",
    objectPath: "media-vault/proxy/nest-1/object.mov",
    contentType: "video/quicktime",
    expectedSizeBytes: 250,
  };
  assert.equal(policy.mediaVaultUploadReservationBindingMismatch(binding, { ...binding }), null);
  assert.equal(
    policy.mediaVaultUploadReservationBindingMismatch(binding, { ...binding, expectedSizeBytes: 251 }),
    "expectedSizeBytes",
  );
});

test("server reservation implementation is serialized, persistent, renewable, and completion-bound", () => {
  const source = read("apps/quipsly/src/lib/server/media-vault-upload-reservations.ts");
  assert.match(source, /isolationLevel: "Serializable"/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /quipsly-upload-actor:/);
  assert.match(source, /quipsly-upload-nest:/);
  assert.match(source, /status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES\.expired/);
  assert.match(source, /status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES\.abandoned/);
  assert.match(source, /existing\.lane\s*!==[\s\S]*MEDIA_VAULT_UPLOAD_RESERVATION_LANES\.mobileCaptureResumable/);
  assert.match(source, /renewalCount: \{ increment: 1 \}/);
  assert.match(source, /completionGeneration/);
  assert.match(source, /UPLOAD_RESERVATION_COMPLETION_MISMATCH/);
});

test("both upload issuance routes reserve before returning a capability", () => {
  const presigned = read("apps/quipsly/src/app/api/upload/presigned/route.ts");
  const resumable = read("apps/quipsly/src/app/api/ingest/mobile/resumable/route.ts");
  assert.doesNotMatch(presigned, /QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED/);
  assert.match(presigned, /getQuipslySessionFromRequest/);
  assert.match(presigned, /resolveStudioProjectAccess/);
  assert.match(presigned, /uploadRequestId must be a stable UUID/);
  assert.ok(presigned.indexOf("reserveMediaVaultUploadCapacity({") < presigned.indexOf("file.getSignedUrl({"));
  assert.match(presigned, /"x-goog-if-generation-match": "0"/);
  assert.match(presigned, /reservationId: reservation\.id/);
  assert.doesNotMatch(resumable, /QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED/);
  assert.match(resumable, /assertMobileCaptureUploadReferences/);
  assert.match(resumable, /evaluateMobileCaptureRoomReadiness/);
  assert.ok(resumable.indexOf("reserveMediaVaultUploadCapacity({", resumable.indexOf("const objectName")) < resumable.indexOf("createMobileCaptureResumableManifest({"));
  assert.match(resumable, /MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS/);
});

test("canonical finalization and proxy registration settle active reservations", () => {
  const finalize = read("apps/quipsly/src/app/api/ingest/mobile/resumable/finalize/route.ts");
  const proxy = read("apps/quipsly/src/app/api/media-vault/proxies/register/route.ts");
  assert.match(finalize, /completeMediaVaultUploadReservation\(\{/);
  assert.match(finalize, /generation: object\.generation/);
  assert.match(finalize, /recordingAssetId: finalization\.recordingAssetId/);
  assert.match(proxy, /if \(result\.ok\)/);
  assert.match(proxy, /completeMediaVaultUploadReservation\(\{/);
  assert.match(proxy, /generation: completedObject\?\.generation/);
  assert.match(proxy, /uploadReservation/);
});

test("legacy server-buffered ingress is terminal before reading request bytes", () => {
  const multipart = read("apps/quipsly/src/app/api/ingest/mobile/route.ts");
  const chunk = read("apps/quipsly/src/app/api/ingest/mobile/chunk/route.ts");
  for (const [source, code] of [
    [multipart, "LEGACY_MOBILE_MULTIPART_DISABLED"],
    [chunk, "LEGACY_MOBILE_CHUNK_DISABLED"],
  ]) {
    assert.match(source, new RegExp(code));
    assert.match(source, /status: 410/);
    assert.match(source, /canonicalUploadRoute: "\/api\/mobile\/capture\/uploads\/resumable"/);
    assert.doesNotMatch(source, /formData\(|arrayBuffer\(|readFile\(|writeFile\(/);
  }
});

test("schema, additive SQL, and schema verifier require the reservation ledger", () => {
  const schema = read("prisma/schema.prisma");
  const sql = read("ops/quipsly-coaching-capture-additive.sql");
  const verifier = read("scripts/quipsly-coaching-capture-schema-sync.mjs");
  const cleanup = read("scripts/quipsly-media-vault-upload-reservation-cleanup.mjs");
  assert.match(schema, /model MediaVaultUploadReservation \{/);
  assert.match(schema, /issuedAt\s+DateTime/);
  assert.match(schema, /@@unique\(\[lane, actorUserId, requestId\]\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "MediaVaultUploadReservation"/);
  assert.match(sql, /MediaVaultUploadReservation_actorUserId_issuedAt_idx/);
  assert.match(verifier, /"MediaVaultUploadReservation"/);
  assert.match(verifier, /"issuedAt"/);
  assert.match(verifier, /requiredIndexes/);
  assert.match(cleanup, /EXPIRE_UPLOAD_RESERVATIONS/);
  assert.match(cleanup, /status: "EXPIRED"/);
  assert.match(cleanup, /status: "ABANDONED"/);
  assert.match(cleanup, /deletesGcsObjects: false/);
});

test("browser upload retries retain one stable UUID and preserve generation preconditions", () => {
  const hook = read("apps/quipsly/src/hooks/useCloudStorageUpload.ts");
  assert.match(hook, /useRef<Record<string, string>>/);
  assert.match(hook, /uploadRequestIds\.current\[taskId\]/);
  assert.match(hook, /uploadRequestId,/);
  assert.match(hook, /X-Goog-If-Generation-Match/);
});
