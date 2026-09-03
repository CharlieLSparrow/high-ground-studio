#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packetBuilder = readFileSync(
  new URL(
    "../apps/quipsly/src/lib/server/coaching-packets.ts",
    import.meta.url,
  ),
  "utf8",
);
const packetRoute = [
  readFileSync(
    new URL(
      "../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFileSync(
    new URL(
      "../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts",
      import.meta.url,
    ),
    "utf8",
  ),
].join("\n");
const actionReviewRoute = readFileSync(
  new URL(
    "../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/actions/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const goalReviewRoute = readFileSync(
  new URL(
    "../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/goals/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const noteMaterializationRoute = readFileSync(
  new URL(
    "../apps/quipsly/src/app/api/mobile/capture/transcripts/notes/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const sessionAccess = readFileSync(
  new URL("../apps/quipsly/src/lib/server/session-access.ts", import.meta.url),
  "utf8",
);
const collaborationDogfood = readFileSync(
  new URL("./quipsly-local-session-collaboration-dogfood.mjs", import.meta.url),
  "utf8",
);

assert.match(packetBuilder, /mobileCaptureTranscriptProcessingGate/);
assert.match(packetBuilder, /actionCandidates/);
assert.match(packetBuilder, /packetCreatesOrdinarySessionWork/);
assert.match(packetBuilder, /reviewRequired: false/);
assert.match(packetBuilder, /automaticallyCreated: true/);
assert.match(packetBuilder, /editableAfterCreation: true/);
assert.match(packetBuilder, /removableInProduct: true/);
assert.match(packetBuilder, /externalSideEffects: false/);
assert.match(packetBuilder, /prisma\.actionItem\.create/);
assert.match(packetBuilder, /prisma\.goal\.create/);
assert.match(packetBuilder, /generatedFollowThroughCanRefresh/);
assert.match(packetBuilder, /generatedFollowThroughCanRemove/);
assert.doesNotMatch(packetBuilder, /actionCandidateReviewBoundary/);
assert.match(packetBuilder, /packetBuildId = randomUUID\(\)/);
assert.match(packetBuilder, /selectLatestCorrelatedPacketNotes/);
assert.ok(
  packetBuilder.indexOf(
    "const transcriptGate = await mobileCaptureTranscriptProcessingGate",
  ) < packetBuilder.indexOf('if (job.status !== "COMPLETED")'),
  "packet creation and existing-packet reuse must follow the normalized transcript gate",
);
assert.match(packetRoute, /TRANSCRIPT_HELD/);
assert.match(packetRoute, /Await reviewed transcript release/);
assert.match(packetRoute, /explicitReleaseRequired: true/);
assert.match(
  packetRoute,
  /packetTranscriptJobIdSet\.has\(text\(source\.transcriptJobId\)\)/,
);
assert.match(
  packetRoute,
  /isAutomaticTranscriptWorkForJob\(\s*item\.sourceJson,\s*packetTranscriptJobIds,?\s*\)/,
);
assert.match(packetRoute, /allPacketActionItems\s*=\s*transcriptProcessingAllowed/);
assert.match(packetRoute, /isUnreviewedTranscriptActionItem/);
assert.match(packetRoute, /legacyCandidateCompatibility/);
assert.match(packetRoute, /selectLatestCorrelatedPacketNotes\(packetNotes\)/);
assert.match(packetRoute, /correlationMode/);
assert.match(packetRoute, /taskMaterialization/);
assert.match(packetRoute, /buildPacketNoteCandidates/);
assert.match(packetRoute, /noteCandidates/);
assert.match(packetRoute, /transcriptPacketNoteCandidateId/);
assert.match(packetRoute, /selectedForSession/);
assert.match(packetRoute, /ownerChoices: \["ACTOR", "UNASSIGNED"\]/);
assert.match(packetRoute, /mergedIntoTagId: null/);
assert.match(packetBuilder, /TRANSCRIPT_PACKET_SEGMENT_ORDER_BY/);
assert.match(packetBuilder, /startSeconds: "asc"/);
assert.match(packetBuilder, /id: "asc"/);
assert.doesNotMatch(
  [packetBuilder, packetRoute, actionReviewRoute, goalReviewRoute].join("\n"),
  /segmentIndex/,
  "packet mutations must order canonical TranscriptSegment fields instead of a nonexistent segmentIndex",
);
for (const immutableEvidenceField of [
  "checksum",
  "byteSize",
  "storageBucket",
  "storageObjectPath",
]) {
  assert.match(
    packetRoute,
    new RegExp(`${immutableEvidenceField}: true`),
    `packet reads must load RecordingAsset.${immutableEvidenceField} before applying the immutable upload gate`,
  );
}
assert.match(
  packetRoute,
  /Packet review requires bound transcript and recording asset evidence/,
);
assert.match(packetRoute, /PACKET_REVIEW_LANE_EMPTY/);
assert.ok(
  packetRoute.indexOf(
    "const transcriptGate = await mobileCaptureTranscriptProcessingGate",
    packetRoute.indexOf("export async function PATCH"),
  ) <
    packetRoute.indexOf(
      "await tx.coachingNote.update",
      packetRoute.indexOf("export async function PATCH"),
    ),
  "packet lane review must re-check source release before mutating review projections",
);
assert.match(actionReviewRoute, /getQuipslySessionFromRequest/);
assert.match(actionReviewRoute, /sessionMutationAccessWhere/);
assert.match(actionReviewRoute, /SESSION_ACCESS_REVOKED/);
assert.match(actionReviewRoute, /mobileCaptureTranscriptProcessingGate/);
assert.match(actionReviewRoute, /FOR UPDATE/);
assert.match(actionReviewRoute, /actionCandidateReviewReceipts/);
assert.match(actionReviewRoute, /assignedUserId: assignToMe \? userId : null/);
assert.match(actionReviewRoute, /TRANSCRIPT_DERIVED_TASK_SCHEMA/);
assert.match(actionReviewRoute, /playbackSourceId/);
assert.match(actionReviewRoute, /ACTION_CANDIDATE_IDEMPOTENCY_CONFLICT/);
assert.match(actionReviewRoute, /actionItemTagLink\.createMany/);
assert.match(actionReviewRoute, /ACTION_CANDIDATE_TAG_SELECTION_STALE/);
assert.match(actionReviewRoute, /materializationIntent/);
assert.match(actionReviewRoute, /candidate: false/);
assert.match(actionReviewRoute, /ACCEPT/);
assert.match(actionReviewRoute, /EDIT/);
assert.match(actionReviewRoute, /REJECT/);
assert.match(actionReviewRoute, /DEFER/);
assert.match(goalReviewRoute, /getQuipslySessionFromRequest/);
assert.match(goalReviewRoute, /sessionMutationAccessWhere/);
assert.match(goalReviewRoute, /SESSION_ACCESS_REVOKED/);
assert.match(goalReviewRoute, /mobileCaptureTranscriptProcessingGate/);
assert.match(goalReviewRoute, /FOR UPDATE/);
assert.match(goalReviewRoute, /goalCandidateReviewReceipts/);
assert.match(goalReviewRoute, /createTranscriptDerivedGoalInTransaction/);
assert.match(goalReviewRoute, /ACCEPT/);
assert.match(goalReviewRoute, /EDIT/);
assert.match(goalReviewRoute, /REJECT/);
assert.match(goalReviewRoute, /DEFER/);
assert.match(goalReviewRoute, /taskCreated: false/);
assert.match(goalReviewRoute, /calendarMutated: false/);
assert.match(noteMaterializationRoute, /getQuipslySessionFromRequest/);
assert.match(noteMaterializationRoute, /sessionMutationAccessWhere/);
assert.match(noteMaterializationRoute, /SESSION_MUTATION_ACCESS_REQUIRED/);
assert.match(noteMaterializationRoute, /mobileCaptureTranscriptProcessingGate/);
assert.match(noteMaterializationRoute, /FOR UPDATE/);
assert.match(noteMaterializationRoute, /packetSnapshotMatches/);
assert.match(noteMaterializationRoute, /transcriptPacketNoteCandidateId/);
assert.match(noteMaterializationRoute, /packetCandidateReviewed/);
assert.match(noteMaterializationRoute, /packetSnapshotRechecked/);
assert.match(noteMaterializationRoute, /created-from-transcript-packet/);
assert.match(
  noteMaterializationRoute,
  /No task, message, delivery, calendar event, or publication was created/,
);
assert.match(packetRoute, /sessionActorAccessWhere/);
assert.match(packetRoute, /sessionMutationActorAccessWhere/);
assert.match(packetRoute, /sessionMutationAccessWhere/);
assert.match(packetRoute, /SESSION_ACCESS_REVOKED/);
assert.match(sessionAccess, /projectGrant === "mutate"/);
assert.match(sessionAccess, /SESSION_MUTATION_PROJECT_ROLES/);
assert.match(collaborationDogfood, /activeProjectGrantUsed: true/);
assert.match(collaborationDogfood, /outsiderDenied: true/);
assert.match(collaborationDogfood, /projectViewerMutationDenied: true/);
assert.match(collaborationDogfood, /projectViewerLaneReviewDenied: true/);
assert.match(collaborationDogfood, /emptyLaneReviewDenied: true/);
assert.match(collaborationDogfood, /actionableLaneReviewPersisted: true/);
assert.match(collaborationDogfood, /revokedGrantDeniedImmediately: true/);
assert.match(collaborationDogfood, /actionItemsCreated: actionCount/);
assert.match(collaborationDogfood, /packetNoteCandidateProjected: true/);
assert.match(collaborationDogfood, /packetNoteCandidateMaterialized: true/);
assert.match(collaborationDogfood, /packetNoteCandidateSnapshotRechecked: true/);
assert.match(collaborationDogfood, /packetNoteCandidateProjectedCommittedIdentity: true/);
assert.match(collaborationDogfood, /transcriptNoteChangedIntentRejected: true/);
assert.match(collaborationDogfood, /externalSideEffects: false/);
assert.match(collaborationDogfood, /assertLoopbackUrl/);

console.log(
  "PASS: packet build, read, and review quarantine held transcript projections.",
);
