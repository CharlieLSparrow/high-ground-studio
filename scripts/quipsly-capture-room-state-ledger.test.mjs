#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  activeCaptureIdsFromReceiptLedger,
  captureRoomActionAuthorizationDecision,
  captureRoomReceiptApplicationDecision,
  captureRoomStatusAfterReceipt,
  isRetryableCaptureRoomTransactionError,
  normalizedCaptureReceiptOccurredAt,
  shouldApplyCaptureRoomReceipt,
} = await import("../apps/quipsly/src/lib/server/capture-room-state-ledger.ts");

const start = (receiptId, captureId, occurredAt, stateApplied = true, actorUserId = "actor-a") => ({
  receiptId,
  captureId,
  action: "START_RECORDING",
  stateApplied,
  actorUserId,
  occurredAt,
});
const stop = (receiptId, captureId, occurredAt, stateApplied = true, actorUserId = "actor-a") => ({
  receiptId,
  captureId,
  action: "STOP_RECORDING",
  stateApplied,
  actorUserId,
  occurredAt,
});
const end = (receiptId, occurredAt, stateApplied = true) => ({
  receiptId,
  captureId: null,
  action: "END",
  stateApplied,
  occurredAt,
});

const t0 = new Date("2026-07-18T12:00:00.000Z");
const t1 = new Date("2026-07-18T12:01:00.000Z");
const t2 = new Date("2026-07-18T12:02:00.000Z");
const t3 = new Date("2026-07-18T12:03:00.000Z");

const monthsOld = "2026-03-01T08:00:00.000Z";
assert.equal(
  normalizedCaptureReceiptOccurredAt(monthsOld, t3).toISOString(),
  monthsOld,
  "a valid protected outbox timestamp must survive replay after more than 30 days",
);
assert.equal(
  normalizedCaptureReceiptOccurredAt("2026-07-18T13:00:00.000Z", t3).toISOString(),
  t3.toISOString(),
  "implausible future clock skew is clamped to server receipt time",
);

assert.deepEqual(
  [...activeCaptureIdsFromReceiptLedger([start("start-a", "capture-a", t0)])],
  ["capture-a"],
  "an applied START creates one active take",
);

const ownerStart = [start("owner-start", "capture-owned", t0, true, "actor-owner")];
const baseStopAuthorization = {
  action: "STOP_RECORDING",
  actorIsRoomOwner: false,
  actorIsBookingCoach: false,
  participantRole: "CLIENT",
  captureId: "capture-owned",
  priorReceipts: ownerStart,
  staffCrashCompensationRequested: false,
};
assert.equal(captureRoomActionAuthorizationDecision({
  ...baseStopAuthorization,
  actorUserId: "actor-owner",
  actorIsStaff: false,
}).allowed, true, "the START owner may STOP their capture");
assert.deepEqual(captureRoomActionAuthorizationDecision({
  ...baseStopAuthorization,
  actorUserId: "actor-other",
  actorIsStaff: false,
}), {
  allowed: false,
  errorCode: "CAPTURE_STOP_OWNER_REQUIRED",
  errorMessage: "Only the participant who started this capture may stop it; staff must use the audited crash-compensation path.",
  captureOwnerUserId: "actor-owner",
  staffCrashCompensation: false,
}, "another participant cannot STOP a capture they do not own");
assert.equal(captureRoomActionAuthorizationDecision({
  ...baseStopAuthorization,
  actorUserId: "staff-user",
  actorIsStaff: true,
}).allowed, false, "staff do not receive an implicit cross-actor STOP override");
assert.deepEqual(captureRoomActionAuthorizationDecision({
  ...baseStopAuthorization,
  actorUserId: "staff-user",
  actorIsStaff: true,
  staffCrashCompensationRequested: true,
}), {
  allowed: true,
  errorCode: null,
  errorMessage: null,
  captureOwnerUserId: "actor-owner",
  staffCrashCompensation: true,
}, "staff may use the explicit audited crash-compensation path");

assert.equal(captureRoomActionAuthorizationDecision({
  action: "END",
  actorUserId: "guest-user",
  actorIsStaff: false,
  actorIsRoomOwner: false,
  actorIsBookingCoach: false,
  participantRole: "GUEST",
  captureId: null,
  priorReceipts: [],
  staffCrashCompensationRequested: false,
}).allowed, false, "guests cannot apply room-control END");
assert.equal(captureRoomActionAuthorizationDecision({
  action: "END",
  actorUserId: "host-user",
  actorIsStaff: false,
  actorIsRoomOwner: false,
  actorIsBookingCoach: false,
  participantRole: "HOST",
  captureId: null,
  priorReceipts: [],
  staffCrashCompensationRequested: false,
}).allowed, true, "hosts may apply room-control END");

const rejectedStopCannotClaim = captureRoomActionAuthorizationDecision({
  action: "START_RECORDING",
  actorUserId: "real-owner",
  actorIsStaff: false,
  actorIsRoomOwner: false,
  actorIsBookingCoach: false,
  participantRole: "CLIENT",
  captureId: "capture-poison-attempt",
  priorReceipts: [stop(
    "rejected-observer-stop",
    "capture-poison-attempt",
    t0,
    false,
    "observer-attacker",
  )],
  staffCrashCompensationRequested: false,
});
assert.equal(rejectedStopCannotClaim.allowed, true,
  "a rejected STOP must never claim capture UUID ownership");
assert.equal(rejectedStopCannotClaim.captureOwnerUserId, "real-owner");

const rejectedPolicyStop = {
  ...stop(
    "rejected-cross-actor-stop",
    "capture-still-active",
    t1,
    false,
    "actor-other",
  ),
  outcome: "REJECTED",
};
assert.deepEqual(
  [...activeCaptureIdsFromReceiptLedger([
    start("active-owner-start", "capture-still-active", t0, true, "actor-owner"),
    rejectedPolicyStop,
  ])],
  ["capture-still-active"],
  "a rejected cross-actor STOP cannot clear the capture owner's active take",
);
assert.equal(
  shouldApplyCaptureRoomReceipt({
    action: "START_RECORDING",
    captureId: "capture-rejected-stop-only",
    occurredAt: t2,
    priorReceipts: [{
      ...rejectedPolicyStop,
      captureId: "capture-rejected-stop-only",
    }],
  }),
  true,
  "a policy-rejected STOP cannot poison an otherwise unused capture UUID",
);

const twoTakes = [
  start("start-a", "capture-a", t0),
  start("start-b", "capture-b", t1),
  stop("stop-a", "capture-a", t2),
];
assert.deepEqual(
  [...activeCaptureIdsFromReceiptLedger(twoTakes)],
  ["capture-b"],
  "stopping one concurrent take must not clear another",
);
assert.deepEqual(
  captureRoomReceiptApplicationDecision({
    action: "START_RECORDING",
    captureId: "capture-a",
    occurredAt: t1,
    priorReceipts: [start("first-start", "capture-a", t0)],
  }),
  { stateApplied: false, outcome: "IGNORED_DUPLICATE_START" },
  "a second receipt cannot create another applied START owner for one capture UUID",
);
assert.equal(
  captureRoomStatusAfterReceipt({
    action: "STOP_RECORDING",
    currentStatus: "RECORDING",
    stateApplied: true,
    activeCaptureIds: activeCaptureIdsFromReceiptLedger(twoTakes),
  }),
  "RECORDING",
);

const terminalStopFirst = [stop("stop-first", "capture-crash", t1)];
assert.deepEqual(
  captureRoomReceiptApplicationDecision({
    action: "START_RECORDING",
    captureId: "capture-crash",
    occurredAt: t0,
    priorReceipts: terminalStopFirst,
  }),
  { stateApplied: false, outcome: "IGNORED_TERMINAL_STOP" },
  "a delayed START cannot resurrect a take after its durable STOP",
);

const endedLedger = [
  start("start-before-end", "capture-before-end", t0),
  end("end-room", t2),
  { receiptId: "open-room", captureId: null, action: "OPEN", stateApplied: true, occurredAt: t3 },
];
assert.equal(
  shouldApplyCaptureRoomReceipt({
    action: "START_RECORDING",
    captureId: "capture-delayed",
    occurredAt: t1,
    priorReceipts: endedLedger,
  }),
  false,
  "a delayed pre-END START must stay ignored after the room is reopened",
);
assert.deepEqual(
  captureRoomReceiptApplicationDecision({
    action: "START_RECORDING",
    captureId: "capture-new",
    occurredAt: new Date("2026-07-18T12:04:00.000Z"),
    priorReceipts: endedLedger,
  }),
  { stateApplied: true, outcome: "APPLIED" },
  "a genuinely new post-reopen START must still apply",
);

assert.deepEqual(
  [...activeCaptureIdsFromReceiptLedger([
    ...endedLedger,
    start("start-after-reopen", "capture-new", new Date("2026-07-18T12:04:00.000Z")),
  ])],
  ["capture-new"],
  "END clears old active takes without blocking a later new take",
);

assert.equal(
  captureRoomStatusAfterReceipt({
    action: "STOP_RECORDING",
    currentStatus: "PLANNED",
    stateApplied: true,
    activeCaptureIds: new Set(),
  }),
  "PLANNED",
  "STOP-only crash compensation records the boundary without inventing OPEN",
);
assert.equal(
  captureRoomStatusAfterReceipt({
    action: "STOP_RECORDING",
    currentStatus: "RECORDING",
    stateApplied: true,
    activeCaptureIds: new Set(),
  }),
  "OPEN",
  "the last STOP transitions a genuinely recording room back to OPEN",
);
assert.equal(
  shouldApplyCaptureRoomReceipt({
    action: "START_RECORDING",
    captureId: "capture-after-rejected-stop",
    occurredAt: t2,
    priorReceipts: [stop("rejected-stop", "capture-after-rejected-stop", t1, false)],
  }),
  false,
  "every durable STOP is a factual terminal boundary even when room state was already closed",
);
assert.equal(
  captureRoomStatusAfterReceipt({
    action: "STOP_RECORDING",
    currentStatus: "CANCELED",
    stateApplied: true,
    activeCaptureIds: new Set(["another-stale-capture"]),
  }),
  "CANCELED",
  "closed-room STOP evidence must never promote a canceled room back to RECORDING",
);

for (const code of ["P2002", "P2034", "23505", "40001", "40P01"]) {
  assert.equal(isRetryableCaptureRoomTransactionError({ code }), true, `${code} must retry`);
}
assert.equal(isRetryableCaptureRoomTransactionError({ code: "P2025" }), false);

const [schema, route, additiveSql, schemaSync, swiftClient, receiptStore, captureModel, browserRecorder] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../apps/quipsly/src/app/api/mobile/capture/rooms/state/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../ops/quipsly-coaching-capture-additive.sql", import.meta.url), "utf8"),
  readFile(new URL("./quipsly-coaching-capture-schema-sync.mjs", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureRoomReceiptStore.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/quipsly/src/components/browser-source-recorder.tsx", import.meta.url), "utf8"),
]);

assert.match(schema, /model CaptureRoomStateReceipt \{/);
assert.match(schema, /receiptId\s+String\s+@id @db\.Uuid/);
assert.match(schema, /sequence\s+BigInt\s+@unique @default\(autoincrement\(\)\)/);
assert.match(schema, /stateReceipts\s+CaptureRoomStateReceipt\[\]/);
assert.match(schema, /captureOwnerUserId\s+String\?/);
assert.match(schema, /consentVersion\s+String\?/);
assert.match(schema, /staffCrashCompensation\s+Boolean\s+@default\(false\)/);
assert.match(additiveSql, /CREATE TABLE IF NOT EXISTS "CaptureRoomStateReceipt"/);
assert.match(additiveSql, /PRIMARY KEY \("receiptId"\)/);
assert.match(additiveSql, /ON CONFLICT \("receiptId"\) DO NOTHING/);
assert.match(additiveSql, /historical_receipt->>'occurredAt'/);
assert.match(additiveSql, /historical_receipt->>'receivedAt'/);
assert.match(additiveSql, /EXCEPTION WHEN OTHERS THEN/);
assert.match(schemaSync, /"CaptureRoomStateReceipt"/);

assert.match(route, /Capture receiptId is required for every room-state action/);
assert.match(route, /isolationLevel: "ReadCommitted"/);
assert.match(route, /CallRoom" WHERE "id" = \$1 FOR UPDATE/);
assert.match(route, /captureRoomStateReceipt\.create/);
assert.match(route, /receiptId is already bound to a different immutable room-state request/);
assert.match(route, /outcome: "REJECTED"/);
assert.match(route, /captureRoomActionAuthorizationDecision/);
assert.match(route, /staffCrashCompensationReason\.length < 12/);
assert.match(route, /allPartyConsentVersions/);
assert.doesNotMatch(route, /mobileCaptureRoomReceipts:\s*\[\.\.\./);
assert.doesNotMatch(route, /slice\(-50\)/);
assert.match(
  browserRecorder,
  /const reopenRoom = useCallback[\s\S]*postRoomReceipt\(\{\s*callRoomId,\s*action:\s*"OPEN"/,
  "the explicit room-control OPEN receipt must remain inside the named reopen flow",
);
assert.match(
  browserRecorder,
  /canControlRoom \? \([\s\S]*onClick=\{\(\) => void reopenRoom\(\)\}/,
  "only a room controller may see the reopen control",
);
assert.match(
  browserRecorder,
  /postRoomReceipt\(\{\s*callRoomId,\s*action:\s*"START_RECORDING"/,
  "the browser source must begin with its participant-owned START receipt",
);

assert.match(swiftClient, /"receiptId": roomStateReceipt\.receiptID\.uuidString\.lowercased\(\)/);
assert.match(swiftClient, /"captureId"\] = captureID\.uuidString\.lowercased\(\)/);
assert.match(swiftClient, /payload\.receiptPersisted == true, !payload\.ok/);
assert.match(swiftClient, /\.terminallyRejected\(message: message, errorCode: payload\.errorCode\)/);
assert.match(receiptStore, /case rejectedByNest/);
assert.match(receiptStore, /func markRejectedByNest/);
assert.match(captureModel, /case let \.terminallyRejected\(message, errorCode\)/);

console.log("PASS: capture room receipts are required, append-only, room-serialized, replay-safe, and ordering-safe.");
