#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const checks = [];

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, "utf8");
}

function addCheck(id, condition, summary, details = {}) {
  checks.push({
    id,
    status: condition ? "pass" : "fail",
    summary,
    details,
  });
}

function includesAll(text, markers) {
  return markers.every((marker) => text.includes(marker));
}

const files = {
  schema: "prisma/schema.prisma",
  runwayRoute: "apps/quipsly/src/app/api/coaching/runway/route.ts",
  runwayPage: "apps/quipsly/src/app/(app)/coaching/page.tsx",
  calendarAdapter: "apps/quipsly/src/lib/server/coaching-google-calendar.ts",
  lifecycle: "packages/quipsly-domain/src/coaching-lifecycle.ts",
  spineDoc: "docs/quipsly/ios-capture-app-store-readiness.md",
};

const texts = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, value] of Object.entries(texts)) {
  addCheck(
    `sourcePresent:${key}`,
    Boolean(value),
    `${files[key]} is present for scheduling contract inspection.`,
    { path: files[key] },
  );
}

const schema = texts.schema || "";
const route = texts.runwayRoute || "";
const page = texts.runwayPage || "";
const calendarAdapter = texts.calendarAdapter || "";
const lifecycle = texts.lifecycle || "";
const spineDoc = texts.spineDoc || "";

addCheck(
  "schemaHasSchedulingTruth",
  includesAll(schema, [
    "model BookingHold ",
    "model CoachingBooking ",
    "model CallRoom ",
    "model CalendarEventLink ",
    "enum CoachingBookingStatus",
    "enum BookingHoldStatus",
    "enum CallRoomStatus",
    "calendarEventId",
    "calendarLinks",
    "CalendarEventLink[]",
  ]),
  "Prisma can represent holds, bookings, rooms, calendar evidence slots, and scheduling state without external calendar ownership.",
);

addCheck(
  "runwaySupportsSchedulingActions",
  includesAll(route, [
    '"create-booking-hold"',
    '"convert-booking-hold"',
    '"release-booking-hold"',
    '"reschedule-booking"',
    '"cancel-booking"',
    '"attach-calendar-receipt"',
    '"sync-google-calendar-event"',
    '"cancel-google-calendar-event"',
  ]),
  "Coaching runway supports hold, convert, release, reschedule, cancel, provider calendar receipt attachment, and explicit Google Calendar sync/cancel actions.",
);

addCheck(
  "runwayReturnsCalendarReadiness",
  includesAll(route, [
    "getCoachingCalendarReadiness",
    "const calendarReadiness = getCoachingCalendarReadiness()",
    "calendarReadiness,",
  ]),
  "Coaching runway response exposes calendar readiness beside Stripe and LiveKit readiness.",
);

addCheck(
  "runwayUsesSharedPacificDefault",
  includesAll(route, [
    "getCoachingDefaultTimezone",
    "text(body.timezone) || getCoachingDefaultTimezone()",
    "text(body.timezone) || booking.timezone || getCoachingDefaultTimezone()",
  ]) && !route.includes('"America/Los_Angeles"'),
  "Coaching runway uses the shared default timezone helper instead of reintroducing local-machine or route-level timezone literals.",
);

addCheck(
  "calendarReadinessAvoidsFalseGreen",
  includesAll(calendarAdapter, [
    "credentialConfigured",
    "metadataTokenCandidate",
    "configurationStatus",
    "verificationRecommended",
    "metadata-token-candidate",
    "Run the staff read-only calendar verification before promising external calendar sync.",
    "Verify on the deployed runtime before promising external calendar sync.",
  ]),
  "Calendar readiness distinguishes configured credentials, deployed metadata-token candidates, and verification-before-sync instead of returning a fake provider green light.",
);

addCheck(
  "runwayRequiresStaffOrCoachForMutations",
  includesAll(route, [
    "Sign in before changing the coaching runway.",
    "Set up your coach profile before changing coaching sessions from this runway.",
    "actingCoachProfile",
    "if (!session.user.isStaff && !actingCoachProfile)",
    "Only the assigned coach, room creator, or Quipsly staff can reschedule this booking.",
    "Only the assigned coach, room creator, or Quipsly staff can cancel this booking.",
    "Only the assigned coach, room creator, or Quipsly staff can attach calendar evidence here.",
  ]),
  "Scheduling mutations require authenticated Quipsly staff access or a configured coach profile.",
);

addCheck(
  "calendarProviderWritesAreIdempotentAndActorScoped",
  includesAll(calendarAdapter, [
    "deterministicGoogleCalendarEventId",
    "response.status === 409",
    "latestLinkMatchesCalendar",
    "canManageCoachingCalendarEvidence",
    "Only the assigned coach or Quipsly staff can sync this booking",
    "prisma.$transaction",
    "deterministicProviderEventId",
  ]),
  "Google event creation uses stable calendar-scoped identity, recovers post-provider/local-receipt retries without duplicates, checks booking ownership, and commits local receipts together.",
);

addCheck(
  "calendarCancellationIsExplicitAndReceiptBacked",
  includesAll(calendarAdapter, [
    "cancelCoachingBookingGoogleCalendar",
    "Cancel the Quipsly booking first",
    "deleteGoogleCalendarEvent",
    "response.status === 404 || response.status === 410",
    'status: providerReceipt.alreadyAbsent ? "canceled-already-absent" : "canceled"',
    'action: "cancel-google-calendar-event"',
  ]) && includesAll(route, [
    '"cancel-google-calendar-event"',
    "cancelCoachingBookingGoogleCalendar",
    "externalCalendarEventExists",
  ]) && includesAll(page, [
    "cancelGoogleCalendar",
    "Cancel external event",
  ]),
  "Provider cancellation is a separately confirmed action after Quipsly cancellation, treats absent events idempotently, and attaches provider evidence without deleting booking history.",
);

addCheck(
  "rescheduleAndCancelAreQuipslyFirst",
  includesAll(route, [
    "status: \"reschedule-planned\"",
    "externalCalendarUpdated: false",
    "Booking rescheduled in Quipsly. Update external calendar/invite evidence",
    "status: \"cancel-planned\"",
    "externalCalendarCanceled: false",
    "Booking canceled in Quipsly. Cancel external calendar/invite/payment evidence separately",
  ]),
  "Reschedule/cancel update app-owned booking and room truth first, then create external-calendar work-to-do evidence.",
);

addCheck(
  "calendarReceiptAttachmentIsEvidenceOnly",
  includesAll(route, [
    "Attach at least one calendar evidence field",
    "action: \"attach-calendar-receipt\"",
    "externalCalendarMutatedByQuipsly: false",
    "calendarReadyPacket({",
    "Calendar receipt attached. Keep Quipsly booking truth and provider evidence together",
  ]),
  "Calendar receipt attachment stores provider evidence without mutating external calendars or sending invites.",
);

addCheck(
  "uiShowsSchedulingRunwayAndCalendarPackets",
  includesAll(page, [
    "Scheduling runway",
    "Booking holds",
    "CalendarPacketPanel",
    "Calendar evidence boundary",
    "calendarReadinessDetail",
    "verify first",
    "Verify calendar access before promising external sync.",
    "Reschedule or cancel Quipsly truth first. External calendar/payment evidence remains separate.",
    "Open calendar receipt",
  ]),
  "Coaching runway UI explains holds, packets, and the Quipsly-truth-before-provider-evidence boundary.",
);

addCheck(
  "lifecycleKeepsCalendarReceiptSeparate",
  includesAll(lifecycle, [
    '"calendar-receipt"',
    "calendarReceiptExists",
    "No external calendar receipt is attached yet. This is a visibility gap, not proof the session is invalid.",
  ]),
  "Lifecycle contract treats calendar receipts as separate evidence, not as the booking source of truth.",
);

addCheck(
  "docsDescribeReviewerAndReceiptBoundaries",
  includesAll(spineDoc, [
    "The reviewer login and reviewer session are two separate pieces of evidence.",
    "Scheduling evidence follows the same rule.",
    "External calendars are evidence providers.",
    "the app must not imply that a calendar invitation was created, updated, or",
    "canceled unless that receipt is present.",
  ]),
  "App Store readiness docs distinguish reviewer setup and external side effects.",
);

const failed = checks.filter((check) => check.status !== "pass");
const report = {
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  invariant:
    "Scheduling is Quipsly-owned. Calendar providers are evidence slots and receipts, not hidden owners of booking or capture truth.",
  files,
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
