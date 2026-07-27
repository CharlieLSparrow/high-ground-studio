#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  authorizeIngestMediaSource,
  buildMobileCaptureResumableManifestObjectName,
  isSafeMobileCaptureUploadSessionId,
  mobileCaptureManifestBindingMismatch,
  mobileCaptureResumableBindingMismatch,
  normalizeMobileCaptureUploadIdentity,
  normalizeMobileCaptureSha256,
  resolveMobileCaptureUploadSessionDirectory,
} from "../apps/quipsly/src/lib/server/mobile-capture-security.ts";

const validSessionId = "9d8c0c81-847f-4e16-96d0-26b494c890aa";
const sharedCaptureId = "11111111-1111-4111-8111-111111111111";

test("mobile upload session IDs are UUID-shaped and stay inside the ingest root", () => {
  const root = path.resolve("/tmp/quipsly-mobile-chunk-ingest-test");
  assert.equal(isSafeMobileCaptureUploadSessionId(validSessionId), true);
  assert.equal(
    resolveMobileCaptureUploadSessionDirectory(root, validSessionId),
    path.join(root, validSessionId),
  );

  for (const unsafe of [
    "../../",
    "../manifest",
    "/tmp/escape",
    "upload-session-1",
    `${validSessionId}/../escape`,
    `${validSessionId}..`,
    "",
  ]) {
    assert.equal(isSafeMobileCaptureUploadSessionId(unsafe), false, unsafe);
    assert.throws(
      () => resolveMobileCaptureUploadSessionDirectory(root, unsafe),
      /UUID|escapes/i,
      unsafe,
    );
  }
});

test("upload manifests stay bound to their original actor and project", () => {
  const binding = {
    actorUserId: "user-a",
    actorEmail: "User-A@example.com",
    projectId: "project-a",
    projectSlug: "project-a",
  };

  assert.equal(mobileCaptureManifestBindingMismatch(binding, binding), null);
  assert.equal(
    mobileCaptureManifestBindingMismatch(
      { ...binding, actorEmail: "user-a@example.com" },
      binding,
    ),
    null,
  );
  assert.match(
    mobileCaptureManifestBindingMismatch({ ...binding, actorUserId: "user-b" }, binding) || "",
    /different signed-in user/i,
  );
  assert.match(
    mobileCaptureManifestBindingMismatch({ ...binding, projectId: "project-b" }, binding) || "",
    /different Nest project/i,
  );
  assert.match(
    mobileCaptureManifestBindingMismatch({ ...binding, projectSlug: "project-b" }, binding) || "",
    /project changed/i,
  );
});

test("resumable manifests use a private deterministic control path and strict SHA-256", () => {
  assert.equal(
    buildMobileCaptureResumableManifestObjectName(validSessionId),
    `media-vault/control/mobile-capture-resumable/${validSessionId}.json`,
  );
  assert.throws(
    () => buildMobileCaptureResumableManifestObjectName("../another-user"),
    /UUID/i,
  );

  const uppercaseDigest = "A".repeat(64);
  assert.equal(normalizeMobileCaptureSha256(uppercaseDigest), "a".repeat(64));
  assert.equal(normalizeMobileCaptureSha256("a".repeat(63)), null);
  assert.equal(normalizeMobileCaptureSha256(`${"a".repeat(64)}/escape`), null);
});

test("one capture identity can bind multiple independent upload sessions", () => {
  assert.deepEqual(
    normalizeMobileCaptureUploadIdentity({
      uploadSessionId: validSessionId.toUpperCase(),
    }),
    {
      uploadSessionId: validSessionId,
      captureId: validSessionId,
      captureGroupId: validSessionId,
    },
    "legacy clients retain one-source identity defaults",
  );
  assert.deepEqual(
    normalizeMobileCaptureUploadIdentity({
      uploadSessionId: validSessionId,
      captureId: sharedCaptureId,
    }),
    {
      uploadSessionId: validSessionId,
      captureId: sharedCaptureId,
      captureGroupId: sharedCaptureId,
    },
    "new clients may give a source upload the shared take identity",
  );
});

test("resumable upload recovery rejects any mutation to consent, session, bytes, or checksum", () => {
  const binding = {
    uploadSessionId: validSessionId,
    captureId: sharedCaptureId,
    actorUserId: "user-a",
    actorEmail: "user-a@example.com",
    projectId: "project-a",
    projectSlug: "project-a",
    fileName: "capture.m4a",
    contentType: "audio/mp4",
    sourceType: "audio",
    expectedSizeBytes: 4096,
    sha256: "b".repeat(64),
    episodeSlug: "episode-4",
    trackId: "homer",
    callRoomId: "room-a",
    participantId: "participant-a",
    recordingConsentId: "consent-a",
    recordingAssetId: null,
    capturePurpose: "podcast",
    captureGroupId: sharedCaptureId,
    sourceProfileJson: "{\"codec\":\"aac-lc\",\"container\":\"m4a\"}",
    startedAt: "2026-07-18T01:00:00.000Z",
    stoppedAt: "2026-07-18T01:10:00.000Z",
    recordingSegmentsJson: "[]",
  };

  assert.equal(mobileCaptureResumableBindingMismatch(binding, binding), null);
  for (const [field, value] of [
    ["recordingConsentId", "consent-b"],
    ["captureId", "22222222-2222-4222-8222-222222222222"],
    ["callRoomId", "room-b"],
    ["expectedSizeBytes", 4097],
    ["sha256", "c".repeat(64)],
    ["recordingSegmentsJson", "[{\"start\":1}]"],
    ["captureGroupId", "22222222-2222-4222-8222-222222222222"],
    ["sourceProfileJson", "{\"codec\":\"pcm\",\"container\":\"wav\"}"],
  ]) {
    assert.match(
      mobileCaptureResumableBindingMismatch({ ...binding, [field]: value }, binding) || "",
      new RegExp(field, "i"),
      field,
    );
  }
});

test("ingest media refuses unauthenticated requests before loading source bytes", async () => {
  let sourceLoaded = false;
  const decision = await authorizeIngestMediaSource({
    actor: null,
    sourceId: "source-private",
    loadSource: async () => {
      sourceLoaded = true;
      return { id: "source-private", providerSourceId: "gcs://bucket/private.m4a", url: null };
    },
    loadScopes: async () => [{ isGlobal: false, projectSlugs: ["private-project"] }],
    canReadProject: async () => true,
  });

  assert.deepEqual(decision, {
    allowed: false,
    status: 401,
    error: "Sign in before opening Quipsly media.",
  });
  assert.equal(sourceLoaded, false, "unauthenticated media requests must not resolve source storage");
});

test("ingest media requires project read access for private assets", async () => {
  const source = { id: "source-private", providerSourceId: "gcs://bucket/private.m4a", url: null };
  const base = {
    actor: { id: "user-a", email: "user-a@example.com", isStaff: false },
    sourceId: source.id,
    loadSource: async () => source,
    loadScopes: async () => [{ isGlobal: false, projectSlugs: ["private-project"] }],
  };

  const denied = await authorizeIngestMediaSource({
    ...base,
    canReadProject: async () => false,
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);

  const allowed = await authorizeIngestMediaSource({
    ...base,
    canReadProject: async (slug, email) => slug === "private-project" && email === "user-a@example.com",
  });
  assert.deepEqual(allowed, { allowed: true, source });
});
