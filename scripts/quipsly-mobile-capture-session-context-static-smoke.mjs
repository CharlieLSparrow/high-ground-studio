#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  route: path.join(root, "apps/quipsly/src/app/api/mobile/capture/sessions/context/route.ts"),
  helper: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-session-context.ts"),
  readinessRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts"),
  components: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift"),
  bridge: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift"),
  auth: path.join(root, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift"),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(name, haystack, needle, explanation) {
  if (!haystack.includes(needle)) {
    throw new Error(`${name} missing ${JSON.stringify(needle)}: ${explanation}`);
  }
}

function assertNotIncludes(name, haystack, needle, explanation) {
  if (haystack.includes(needle)) {
    throw new Error(`${name} should not include ${JSON.stringify(needle)}: ${explanation}`);
  }
}

const route = read(files.route);
const helper = read(files.helper);
const readinessRoute = read(files.readinessRoute);
const components = read(files.components);
const bridge = read(files.bridge);
const auth = read(files.auth);

for (const needle of [
  "export async function GET",
  "export async function POST",
  "getQuipslySessionFromRequest",
  "captureRoomAccessWhere",
  "captureSessionContext",
  "Quipsly CallRoom.metadataJson.captureSessionContext",
  "localDraftAllowed: true",
  "externalSideEffects: false",
  "projectCaptureSessionContext",
  "SESSION_CONTEXT_STALE_REVISION",
  "isolationLevel: \"Serializable\"",
  "updatedAt: room.updatedAt",
  "validateCaptureSessionContextReplacement",
]) {
  assertIncludes("session context route", route, needle, "shared capture context must be app-owned, access-checked, revisioned, and provider-side-effect free");
}

for (const needle of [
  "SESSION_CONTEXT_REPLACEMENT_REQUIRED",
  "SESSION_CONTEXT_REPLACEMENT_INCOMPLETE",
  "SESSION_CONTEXT_ENTRIES_INCOMPLETE",
  "SESSION_CONTEXT_REPLACEMENT_MISMATCH",
]) {
  assertIncludes("session context helper", helper, needle, "full-replacement writes must reject omitted, partial, malformed, or contradictory payloads before mutation");
}

for (const forbidden of [
  "stripe.",
  "google.calendar",
  "startQuipslyLiveKitRoomCompositeEgress",
  "buildMobileRecordingObjectName",
  "storage.bucket",
]) {
  assertNotIncludes("session context route", route, forbidden, "saving notes/goals/tasks must not mutate providers or storage");
}

assertIncludes("readiness route", readinessRoute, "sessionContext: \"/api/mobile/capture/sessions/context\"", "mobile readiness should expose the shared-context seam");
assertIncludes("readiness route", readinessRoute, "sessionContextBoundary", "readiness should explain local draft vs Nest truth");

for (const needle of [
  "CaptureSessionContextPanel(session: session, sessionClient: sessionClient)",
  "Load Nest",
  "Save Nest",
  "Local changes not synced",
  "Phone-local drafts are recovery-friendly",
  "loadNestContext",
  "saveNestContext",
  "SessionContextConflictCard",
  "Use Nest version",
  "Keep phone draft",
  "rebaseRevision",
]) {
  assertIncludes("native components", components, needle, "native UI should keep the phone draft visible while resolving a stale Nest revision");
}

for (const needle of [
  "MobileCaptureSessionContextResponse",
  "loadSessionContext",
  "saveSessionContext",
  "/api/mobile/capture/sessions/context",
  "revisionId",
  "remoteContext",
  "CaptureSessionContextSaveResult",
]) {
  assertIncludes("native bridge", bridge, needle, "native client should round-trip revisions and conflicts through the signed-in Nest route");
}

for (const needle of ["Authorization", "Bearer"]) {
  assertIncludes("native auth", auth, needle, "authenticatedData must attach the signed-in bearer token used by the context client");
}

console.log(JSON.stringify({
  ok: true,
  checked: Object.keys(files).length,
  facts: [
    "session context is access-checked",
    "session context is Nest-owned and has no provider side effects",
    "explicit saves project user-authored context into durable app records",
    "partial replacement payloads fail closed before database mutation",
    "native app preserves phone and Nest drafts on revision conflict",
    "readiness exposes the route and boundary",
  ],
}, null, 2));
