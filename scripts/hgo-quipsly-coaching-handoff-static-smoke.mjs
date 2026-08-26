#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  handoff: "apps/web/src/lib/hgo/coaching-handoff.ts",
  page: "apps/web/src/app/coaching/page.tsx",
  dashboardPage: "apps/web/src/app/dashboard/page.tsx",
  bookingRoute: "apps/web/src/app/api/coaching/bookings/route.ts",
  checkoutRoute: "apps/web/src/app/api/coaching/checkout/route.ts",
  customerPortalRoute: "apps/web/src/app/api/coaching/customer-portal/route.ts",
  stripeWebhookRoute: "apps/web/src/app/api/coaching/webhooks/stripe/route.ts",
  quipslyPublicPacket: "apps/quipsly/src/app/api/coaching/public/route.ts",
  quipslyPublicOfferings: "apps/quipsly/src/lib/server/public-coaching-offerings.ts",
  quipslyBookingRequests: "apps/quipsly/src/app/api/coaching/booking-requests/route.ts",
  quipslyPublicContract: "packages/quipsly-domain/src/coaching-public.ts",
  quipslyLifecycleContract: "packages/quipsly-domain/src/coaching-lifecycle.ts",
  quipslyCheckoutRoute: "apps/quipsly/src/app/api/coaching/checkout/route.ts",
  quipslyCustomerPortalRoute: "apps/quipsly/src/app/api/coaching/customer-portal/route.ts",
  quipslyStripeWebhookRoute: "apps/quipsly/src/app/api/coaching/webhooks/stripe/route.ts",
  quipslyStripeServer: "apps/quipsly/src/lib/server/coaching-stripe.ts",
  quipslyMarketingHome: "apps/quipsly/src/app/(marketing)/page.tsx",
  quipslyProxy: "apps/quipsly/src/proxy.ts",
  quipslyMarketingCoaching: "apps/quipsly/src/app/(marketing)/public/coaching/page.tsx",
  mobileCaptureReadiness: "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts",
  mobileCaptureReviewDigest: "apps/quipsly/src/app/api/mobile/capture/review-digest/route.ts",
  quipslyCoachingRunway: "apps/quipsly/src/app/api/coaching/runway/route.ts",
  quipslyCoachingPage: "apps/quipsly/src/app/(app)/coaching/page.tsx",
  prismaSchema: "prisma/schema.prisma",
};

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...details }, null, 2));
  process.exit(1);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) fail("Required HGO/Quipsly coaching handoff file is missing.", { file: relativePath });
  return fs.readFileSync(fullPath, "utf8");
}

function requireIncludes(text, needle, label, file) {
  const compact = (value) => String(value).replace(/\s+/g, " ").trim();
  if (!compact(text).includes(compact(needle))) {
    fail("Required HGO/Quipsly coaching handoff invariant is missing.", { label, file, missing: needle });
  }
}

function requireNotIncludes(text, needle, label, file) {
  if (text.includes(needle)) {
    fail("Retired HGO/Quipsly coaching handoff pattern is still present.", { label, file, retired: needle });
  }
}

const texts = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

for (const [label, needle] of [
  ["handoff kind", "hgo-to-quipsly-coaching-handoff-v1"],
  ["legacy flag", "HGO_LEGACY_COACHING_API_ENABLED"],
  ["quipsly packet contract import", "@high-ground/quipsly-domain/coaching-public"],
  ["shared quipsly packet contract", "@high-ground/quipsly-domain/coaching-public"],
  ["hgo fetch adapter", "getQuipslyPublicCoachingPacket"],
  ["hgo fetch fallback", "hgo-fallback"],
  ["public offerings normalizer", "normalizeQuipslyPublicCoachingOfferings"],
  ["hgo doorway copy", "High Ground Odyssey is the public coaching doorway"],
  ["quipsly operational truth", "Quipsly Nest owns booking, payment evidence, consent, capture, transcript, packet, and review state"],
  ["quipsly marketing base url", "getQuipslyMarketingBaseUrl"],
  ["product education href", "productEducationHref"],
  ["primary booking href", "primaryBookingHref"],
  ["public packet href", "publicPacketHref"],
]) {
  requireIncludes(texts.handoff, needle, label, files.handoff);
}

for (const [label, needle] of [
  ["quipsly packet kind", "quipsly-public-coaching-handoff-v1"],
  ["public offering kinds", "QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS"],
  ["packet type", "QuipslyPublicCoachingPacket"],
  ["shared native capture constant", "QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["native capture type", "QuipslyPublicNativeCapture"],
  ["scheduling type", "QuipslyPublicCoachingScheduling"],
  ["scheduling constant", "QUIPSLY_PUBLIC_COACHING_SCHEDULING"],
  ["scheduling pacific timezone", "America/Los_Angeles"],
  ["scheduling pacific label", "Pacific time"],
  ["scheduling operator default", "Homer is in Orange County"],
  ["scheduling calendar evidence boundary", "Google Calendar is scheduling evidence and convenience"],
  ["scheduling external calendar receipt boundary", "provider event ID, calendar ID, or event link receipt"],
  ["native capture primary call path type", "primaryCallPath: string"],
  ["native capture native presentation type", "nativeCallPresentation: string"],
  ["native capture fallback import type", "fallbackCallImport: string"],
  ["native capture phone boundary type", "phoneCallBoundary: string"],
  ["native capture pstn bridge type", "pstnBridgeCandidate: string"],
  ["capture mode type", "QuipslyPublicCaptureMode"],
  ["positioning type", "QuipslyPublicCoachingPositioning"],
  ["positioning constant", "QUIPSLY_PUBLIC_COACHING_POSITIONING"],
  ["packet guard", "isQuipslyPublicCoachingPacket"],
  ["public offerings normalizer", "normalizeQuipslyPublicCoachingOfferings"],
  ["public handoff actions", "QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS"],
  ["public handoff action type", "QuipslyPublicCoachingResolvedHandoffAction"],
  ["public loop status type", "QuipslyPublicLoopStatus"],
  ["public loop owner type", "QuipslyPublicLoopOwner"],
  ["public loop proof state type", "QuipslyPublicLoopProofState"],
  ["public loop safe action type", "QuipslyPublicLoopSafeNextAction"],
  ["shared public loop status", "QUIPSLY_PUBLIC_LOOP_STATUS"],
  ["shared public loop generated for readiness", "public-loop-readiness"],
  ["shared public loop hgo doorway marker", "Public coaching, story, and business doorway"],
  ["shared public loop quipsly education marker", "Product education funnel for Research, Studio, Tower, and coaching capture"],
  ["shared public loop nest truth marker", "Operational source of truth for users, booking, consent"],
  ["shared public loop native capture marker", "Local-first recorder. Local recordings remain source truth"],
  ["shared native capture in-app call path", "Quipsly-owned in-app session rooms are the production call path"],
  ["shared native capture callkit boundary", "Start CallKit integration from the first native-room workflow"],
  ["shared native capture phone fallback", "Normal Phone or FaceTime calls are fallback/import sources only"],
  ["shared native capture phone truth boundary", "Starting a regular phone call is not the same as joining a Quipsly capture room"],
  ["shared native capture pstn candidate", "A Twilio or similar PSTN bridge can be evaluated later"],
  ["shared public loop hgo owner", "HighGroundOdyssey.com teaches and routes"],
  ["shared public loop quipsly owner", "Quipsly.com educates and funnels"],
  ["shared public loop nest owner", "Nest owns operational truth"],
  ["shared public loop native capture owner", "Native capture stays local-first"],
  ["shared public loop source ready", "source-ready"],
  ["shared public loop preview required", "preview-required"],
  ["shared public loop live required", "live-required"],
  ["shared public loop device required", "device-required"],
  ["shared public loop reviewer setup boundary", "must not charge, invite, publish, create an external calendar event, or start recording"],
  ["shared public loop safe next actions", "safeNextActions"],
]) {
  requireIncludes(texts.quipslyPublicContract, needle, label, files.quipslyPublicContract);
}

for (const [key, action] of [
  ["bookingRoute", "create-booking-draft"],
  ["checkoutRoute", "create-stripe-checkout"],
  ["customerPortalRoute", "create-customer-portal"],
  ["stripeWebhookRoute", "stripe-webhook"],
]) {
  const file = files[key];
  const text = texts[key];
  requireIncludes(text, "isHgoLegacyCoachingApiEnabled", "legacy guard", file);
  requireIncludes(text, "getHgoCoachingApiHandoff", "handoff response", file);
  requireIncludes(text, action, "route action label", file);
  requireIncludes(text, "status: 409", "disabled by default response", file);
}

for (const [label, needle] of [
  ["checkout route service", "createQuipslyCoachingCheckoutSession"],
  ["checkout route auth", "getQuipslySessionFromRequest"],
  ["checkout sign-in boundary", "Sign in before creating coaching checkout evidence."],
  ["checkout booking id boundary", "bookingId is required before creating coaching checkout evidence."],
  ["checkout actor user", "actorUserId: session.user.id"],
  ["checkout staff boundary", "actorIsStaff: session.user.isStaff"],
]) {
  requireIncludes(texts.quipslyCheckoutRoute, needle, label, files.quipslyCheckoutRoute);
}

for (const [label, needle] of [
  ["customer portal route service", "createQuipslyCoachingCustomerPortalSession"],
  ["customer portal route auth", "getQuipslySessionFromRequest"],
  ["customer portal sign-in boundary", "Sign in before opening coaching billing evidence."],
  ["customer portal actor user", "actorUserId: session.user.id"],
  ["customer portal staff boundary", "actorIsStaff: session.user.isStaff"],
]) {
  requireIncludes(texts.quipslyCustomerPortalRoute, needle, label, files.quipslyCustomerPortalRoute);
}

for (const [label, needle] of [
  ["stripe webhook raw body", "request.text()"],
  ["stripe webhook signature header", "stripe-signature"],
  ["stripe webhook recorder", "recordQuipslyCoachingStripeWebhook"],
]) {
  requireIncludes(texts.quipslyStripeWebhookRoute, needle, label, files.quipslyStripeWebhookRoute);
}

for (const [label, needle] of [
  ["live stripe launch guard", "QUIPSLY_ALLOW_LIVE_STRIPE"],
  ["live stripe disabled by default", "Live coaching Stripe is disabled"],
  ["checkout limited to paid one-to-one policy", "booking.paymentPolicy !== \"PAID_ONE_TO_ONE\""],
  ["checkout limited to one-to-one offering kind", "booking.offering.kind !== \"ONE_TO_ONE_COACHING\""],
  ["no groups courses libraries saas through coaching checkout", "not groups, courses, libraries, or SaaS"],
  ["checkout creates pending payment record", "status: \"PENDING\""],
  ["checkout pending until webhook evidence", "Payment remains pending until webhook evidence arrives"],
  ["portal feature gate", "COACHING_CUSTOMER_PORTAL_ENABLED"],
  ["portal needs existing customer evidence", "Stripe Customer Portal requires existing Stripe customer evidence"],
  ["stripe signature verification", "verifyStripeSignature"],
  ["stripe webhook event ledger", "stripeWebhookEvent.upsert"],
  ["checkout completed event", "checkout.session.completed"],
  ["checkout expired event", "checkout.session.expired"],
  ["unmatched webhook evidence preserved", "processed_unmatched"],
  ["payment record updated from webhook", "paymentRecord.update"],
  ["paid only after completed webhook", "status: event.type === \"checkout.session.completed\" ? \"PAID\" : \"CANCELED\""],
  ["booking confirmed only after completed webhook", "status: event.type === \"checkout.session.completed\" ? \"CONFIRMED\" : \"CANCELED\""],
  ["stripe customer link evidence", "stripeCustomerLink.upsert"],
]) {
  requireIncludes(texts.quipslyStripeServer, needle, label, files.quipslyStripeServer);
}

for (const [label, needle] of [
  ["coach profile model", "model CoachProfile"],
  ["service offering model", "model ServiceOffering"],
  ["availability window model", "model AvailabilityWindow"],
  ["booking hold model", "model BookingHold"],
  ["booking hold status enum", "enum BookingHoldStatus"],
  ["booking hold converted status", "CONVERTED"],
  ["coaching booking model", "model CoachingBooking"],
  ["coaching booking status enum", "enum CoachingBookingStatus"],
  ["booking holding payment status", "HOLDING_PAYMENT"],
  ["booking confirmed status", "CONFIRMED"],
  ["payment record model", "model PaymentRecord"],
  ["payment record status enum", "enum PaymentRecordStatus"],
  ["payment pending status", "PENDING"],
  ["stripe checkout ledger model", "model StripeCheckoutSessionLedger"],
  ["stripe webhook event model", "model StripeWebhookEvent"],
  ["call room model", "model CallRoom"],
  ["call participant model", "model CallParticipant"],
  ["recording consent model", "model RecordingConsent"],
  ["recording asset model", "model RecordingAsset"],
  ["transcript job model", "model TranscriptJob"],
  ["transcript segment model", "model TranscriptSegment"],
  ["coaching note model", "model CoachingNote"],
  ["action item model", "model ActionItem"],
  ["one-to-one offering enum", "ONE_TO_ONE_COACHING"],
  ["paid one-to-one payment policy", "PAID_ONE_TO_ONE"],
  ["public booking safe default", "publicBookingEnabled Boolean"],
]) {
  requireIncludes(texts.prismaSchema, needle, label, files.prismaSchema);
}

for (const [label, needle] of [
  ["page handoff import", "getHgoCoachingHandoff"],
  ["page packet import", "getQuipslyPublicCoachingPacket"],
  ["page packet panel", "Quipsly live packet"],
  ["page inspect packet link", "Inspect packet"],
  ["page fallback language", "Quipsly packet fallback"],
  ["page opens Quipsly", "Open Quipsly Booking"],
  ["page links Quipsly education", "Public handoff actions"],
  ["page uses product education href", "productEducationHref"],
  ["page says HGO public role", "High Ground"],
  ["page says front porch", "front porch"],
  ["page says Quipsly operational role", "Quipsly Nest"],
  ["page says workbench", "workbench"],
  ["page native production capture", "Native production capture"],
  ["page scheduling truth panel", "Scheduling truth"],
  ["page scheduling default timezone", "defaultTimezoneLabel"],
  ["page scheduling evidence boundary", "calendarEvidenceBoundary"],
  ["page source-safe capture", "source-safe"],
  ["page local source truth", "localSourceTruth"],
  ["page research studio tower packet", "Research, Studio, Tower"],
  ["page positioning promise", "positioning.promise"],
  ["page systems anxiety line", "systemsAnxietyLine"],
  ["page public handoff actions", "Public handoff actions"],
  ["page action boundary", "Boundary:"],
  ["page public loop map", "Public loop map"],
  ["page public loop hgo doorway", "Public coaching, story, and business doorway"],
  ["page public loop quipsly education", "Product education funnel for Research, Studio, Tower, and"],
  ["page public loop nest truth", "Operational source of truth for users, booking, consent"],
  ["page public loop native capture", "Local-first recorder. Local files stay source truth"],
]) {
  requireIncludes(texts.page, needle, label, files.page);
}

for (const [label, retired] of [
  ["old hgo dashboard intake path in active handoff", "fallbackRequestHref: \"/dashboard?intent=coaching\""],
  ["old hgo dashboard signin path in active handoff", "fallbackSignInHref"],
  ["old hgo request cta", "Send Simple Request"],
  ["old hgo dashboard callback import", "buildSignInHref(\"/dashboard?intent=coaching\")"],
  ["old hgo public booking cta", "Book a Session"],
  ["old hgo donation-supported marker", "Donation-supported"],
  ["old hgo donation-supported sentence", "donation-supported"],
]) {
  requireNotIncludes(
    label.includes("handoff") ? texts.handoff : texts.page,
    retired,
    label,
    label.includes("handoff") ? files.handoff : files.page,
  );
}

for (const [label, needle] of [
  ["dashboard flexible contribution copy", "Flexible coaching contribution"],
  ["dashboard paid one-to-one boundary", "paid one-to-one"],
  ["dashboard stripe evidence boundary", "Stripe is payment evidence"],
  ["dashboard quipsly truth boundary", "Quipsly keeps the booking, consent, recording, and transcript truth"],
]) {
  requireIncludes(texts.dashboardPage, needle, label, files.dashboardPage);
}

for (const [label, retired] of [
  ["old dashboard donation heading", "Donation-supported coaching"],
  ["old dashboard donation sentence", "Coaching can be donation-supported"],
]) {
  requireNotIncludes(texts.dashboardPage, retired, label, files.dashboardPage);
}

for (const [label, needle] of [
  ["quipsly public packet constant", "QUIPSLY_PUBLIC_COACHING_PACKET_KIND"],
  ["quipsly public packet type", "QuipslyPublicCoachingPacket"],
  ["quipsly shared native capture import", "QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["free account boundary", "free Quipsly account"],
  ["public offerings", "offerings"],
  ["public handoff action import", "QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS"],
  ["public loop status import", "QUIPSLY_PUBLIC_LOOP_STATUS"],
  ["public handoff actions packet", "handoffActions"],
  ["no side effects", "does not create bookings, charge cards, publish content, send messages, or start recordings"],
  ["public positioning", "positioning: QUIPSLY_PUBLIC_COACHING_POSITIONING"],
  ["public scheduling", "scheduling:"],
  ["public scheduling import", "QUIPSLY_PUBLIC_COACHING_SCHEDULING"],
  ["public scheduling imports calendar readiness", "getCoachingCalendarReadiness"],
  ["public scheduling uses default timezone", "defaultTimezone: calendarReadiness.defaultTimezone"],
  ["native capture packet", "nativeCapture: QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["public loop packet", "publicLoop: QUIPSLY_PUBLIC_LOOP_STATUS"],
]) {
  requireIncludes(texts.quipslyPublicPacket, needle, label, files.quipslyPublicPacket);
}

for (const [label, needle] of [
  ["public offerings database source", "quipsly-database"],
  ["public offerings safe fallback", "unavailable"],
  ["public offerings safe slot derivation", "deriveCoachingBookableSlots"],
  ["public offerings booking path", "/coaching/book/"],
  ["public offerings explicit publish filter", "publicBookingEnabled: true"],
]) {
  requireIncludes(texts.quipslyPublicOfferings, needle, label, files.quipslyPublicOfferings);
}

for (const [label, needle] of [
  ["client request auth", "getQuipslySessionFromRequest"],
  ["client request role", 'role: "CLIENT"'],
  ["client request canonical availability", "assertCoachingScheduleAvailable"],
  ["client request explicit public offering boundary", "publicBookingEnabled: true"],
  ["client request retry safety", "repeated: true"],
  ["client request limit", "COACHING_REQUEST_LIMIT"],
  ["client request no calendar side effect", "externalCalendarCreated: false"],
  ["client request no invite side effect", "externalInviteSent: false"],
  ["client request no payment side effect", "paymentCreated: false"],
  ["client-owned request cancellation", "export async function DELETE"],
  ["client cancellation owner scope", "clientUserId: session.user.id"],
]) {
  requireIncludes(texts.quipslyBookingRequests, needle, label, files.quipslyBookingRequests);
}

for (const [label, needle] of [
  ["runway public booking action", '"update-public-booking"'],
  ["runway public booking owner scope", "coachProfileId: actingCoachProfile?.id"],
  ["runway public booking explicit flag", "publicBookingEnabled: enabled"],
  ["runway client role projection", 'isClient: session.user.roles.includes("CLIENT")'],
  ["hold conversion coach authorization", "Only the assigned coach can confirm this time request."],
  ["hold release coach authorization", "Only the assigned coach can release this time request."],
]) {
  requireIncludes(texts.quipslyCoachingRunway, needle, label, files.quipslyCoachingRunway);
}

for (const [label, needle] of [
  ["client request home", "My time requests"],
  ["client request cancellation affordance", "cancelClientBookingRequest"],
  ["client coaching plain heading", "Your coaching, without the admin maze."],
  ["coach incoming request home", "Incoming time requests"],
  ["coach request confirmation affordance", "Confirm Session"],
]) {
  requireIncludes(texts.quipslyCoachingPage, needle, label, files.quipslyCoachingPage);
}

for (const [label, needle] of [
  ["quipsly marketing home coaches card", "title: \"Coaches\""],
  ["quipsly marketing home coaching link", "href: \"/coaching\""],
  ["quipsly marketing home coaching CTA", "Explore coaching capture"],
  ["quipsly marketing home research pillar", "Quipsly Research"],
  ["quipsly marketing home studio pillar", "Quipsly Studio"],
  ["quipsly marketing home tower pillar", "Quipsly Tower"],
]) {
  requireIncludes(texts.quipslyMarketingHome, needle, label, files.quipslyMarketingHome);
}

for (const [label, needle] of [
  ["quipsly host-aware coaching rewrite", "hostname === 'quipsly.com'"],
  ["quipsly direct public marketing path", "'/public'"],
  ["quipsly coaching route host-boundary comment", "/coaching is a public product-education route on the marketing domain"],
  ["quipsly public coaching rewrite source", "url.pathname === '/coaching'"],
  ["quipsly public coaching rewrite target", "marketingCoachingUrl.pathname = '/public/coaching'"],
  ["quipsly public coaching rewrite stays on marketing host", "return NextResponse.rewrite(marketingCoachingUrl)"],
  ["nest marketing route redirects to canonical HTTPS marketing origin", "new URL(`${url.pathname}${url.search}`, 'https://quipsly.com')"],
]) {
  requireIncludes(texts.quipslyProxy, needle, label, files.quipslyProxy);
}
requireNotIncludes(
  texts.quipslyProxy,
  "marketingUrl.hostname = 'quipsly.com'",
  "host-only marketing redirect that can retain an internal port",
  files.quipslyProxy,
);

for (const [label, needle] of [
  ["quipsly coaching metadata title", "Quipsly for Coaches"],
  ["quipsly coaching hero", "Coaching conversations should become useful without becoming slippery."],
  ["quipsly coaching imports positioning", "QUIPSLY_PUBLIC_COACHING_POSITIONING"],
  ["quipsly coaching imports handoff actions", "QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS"],
  ["quipsly coaching imports native capture contract", "QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["quipsly coaching hgo doorway", "High Ground Odyssey"],
  ["quipsly coaching nest truth", "Quipsly Nest"],
  ["quipsly coaching shared pillar mapper", "QUIPSLY_PUBLIC_COACHING_POSITIONING.pillars.map"],
  ["quipsly coaching shared pillar name", "name: `Quipsly ${pillar.label}`"],
  ["quipsly coaching shared pillar copy", "copy: pillar.coachingUse"],
  ["quipsly coaching explicit consent", "explicit consent"],
  ["quipsly coaching source of truth", "source of truth"],
  ["quipsly coaching public handoff actions", "Public handoff actions"],
  ["quipsly coaching handoff boundary", "Boundary:"],
  ["quipsly coaching native capture contract", "Native capture contract"],
  ["quipsly coaching no private fallback", "High Ground opens the door. Quipsly keeps the receipts."],
  ["quipsly coaching public loop map", "Public loop map"],
  ["quipsly coaching shared public loop import", "QUIPSLY_PUBLIC_LOOP_STATUS"],
  ["quipsly coaching shared public loop mapper", "QUIPSLY_PUBLIC_LOOP_STATUS.owners.map"],
  ["quipsly coaching public loop boundary", "owner.safeBoundary"],
  ["quipsly coaching public loop truth flag", "owner.sourceOfTruth"],
]) {
  requireIncludes(texts.quipslyMarketingCoaching, needle, label, files.quipslyMarketingCoaching);
}

for (const [label, needle] of [
  ["internal proof ladder", "QUIPSLY_PUBLIC_LOOP_STATUS.proofLadder.map"],
  ["internal release actions", "QUIPSLY_PUBLIC_LOOP_STATUS.safeNextActions.map"],
  ["release proof heading", "Proof ladder"],
  ["release proof disclaimer", "Not proof:"],
  ["release action heading", "Safe next actions"],
  ["reviewer smoke copy", "Run capture reviewer smoke"],
]) {
  requireNotIncludes(
    texts.quipslyMarketingCoaching,
    needle,
    `${label} on the customer coaching page`,
    files.quipslyMarketingCoaching,
  );
}

for (const [label, needle] of [
  ["mobile readiness imports native capture contract", "QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["mobile readiness exposes native capture", "nativeCapture: QUIPSLY_NATIVE_CAPTURE_CONTRACT"],
  ["mobile readiness exposes call architecture", "callArchitecture"],
  ["mobile readiness exposes primary call path", "primaryPath: QUIPSLY_NATIVE_CAPTURE_CONTRACT.primaryCallPath"],
  ["mobile readiness exposes phone boundary", "phoneCallBoundary: QUIPSLY_NATIVE_CAPTURE_CONTRACT.phoneCallBoundary"],
  ["mobile readiness keeps explicit consent", "requiresExplicitConsent: true"],
  ["mobile readiness keeps visible recording indicator", "visibleRecordingIndicatorRequired: true"],
  ["mobile readiness keeps stripe boundary", "Stripe is scoped to eligible one-to-one coaching payment evidence"],
]) {
  requireIncludes(texts.mobileCaptureReadiness, needle, label, files.mobileCaptureReadiness);
}

for (const [label, needle] of [
  ["mobile review digest packet kind", "quipsly-mobile-capture-review-digest-v1"],
  ["mobile review digest auth boundary", "Sign in before loading the mobile capture review digest."],
  ["mobile review digest maps sessions", "mapMobileCaptureSessionsForUser"],
  ["mobile review digest side-effect free", "sideEffectFree: true"],
  ["mobile review digest no recording started", "noRecordingStarted: true"],
  ["mobile review digest no external meeting joined", "noExternalMeetingJoined: true"],
  ["mobile review digest no payment mutation", "noPaymentMutation: true"],
  ["mobile review digest ready counter", "readyToCapture"],
  ["mobile review digest consent counter", "needsConsent"],
  ["mobile review digest provider counter", "providerJoinReady"],
  ["mobile review digest transcript counter", "transcriptNeeded"],
  ["mobile review digest packet counter", "packetReady"],
  ["mobile review digest blocker summary", "blockers"],
  ["mobile review digest next actions", "nextActions"],
]) {
  requireIncludes(texts.mobileCaptureReviewDigest, needle, label, files.mobileCaptureReviewDigest);
}

for (const [label, needle] of [
  ["production-first capture", "productionFirst: true"],
  ["local source truth", "Local recording files remain source truth until Nest verifies durable server storage"],
  ["primary in-app call path", "Quipsly-owned in-app session rooms are the production call path"],
  ["callkit native presentation boundary", "Start CallKit integration from the first native-room workflow"],
  ["phone fallback import boundary", "Normal Phone or FaceTime calls are fallback/import sources only"],
  ["phone call is not room join", "Starting a regular phone call is not the same as joining a Quipsly capture room"],
  ["pstn bridge later candidate", "A Twilio or similar PSTN bridge can be evaluated later"],
  ["safe upload rule", "Uploads are resumable, receipt-backed, and recoverable"],
  ["no silent deletion rule", "Original recordings are never silently deleted"],
  ["coaching mode", "One-to-one coaching"],
  ["podcast capture mode", "Podcast capture"],
  ["research interview mode", "Research interview"],
]) {
  requireIncludes(texts.quipslyPublicContract, needle, label, files.quipslyPublicContract);
}

for (const [label, needle] of [
  ["lifecycle kind", "quipsly-coaching-capture-lifecycle-v2"],
  ["lifecycle builder", "buildQuipslyCoachingLifecycle"],
  ["capture readiness flag", "readyForCapture"],
  ["packet readiness flag", "readyForPacket"],
  ["server recording receipt", "Server recording receipt"],
  ["publication receipt slot", "Publication receipt"],
]) {
  requireIncludes(texts.quipslyLifecycleContract, needle, label, files.quipslyLifecycleContract);
}

for (const [label, needle] of [
  ["calendar packet kind", "quipsly-calendar-ready-packet-v1"],
  ["calendar packet builder", "function calendarReadyPacket"],
  ["calendar receipt boundary", "externalCalendarUpdated"],
  ["calendar next action", "Calendar-ready packet exists"],
  ["room exposes calendar packet", "calendarReadyPacket: calendarPacket"],
  ["runway imports lifecycle", "buildQuipslyCoachingLifecycle"],
  ["runway exposes lifecycle", "lifecycle,"],
  ["runway next hold action", "function nextHoldAction"],
  ["runway availability labels", "function availabilityLabel"],
  ["runway booking journey summary", "function bookingJourneySummary"],
  ["runway room journey summary", "function roomJourneySummary"],
  ["runway supports create hold", "\"create-booking-hold\""],
  ["runway supports release hold", "\"release-booking-hold\""],
  ["runway supports convert hold", "\"convert-booking-hold\""],
  ["runway supports reschedule booking", "\"reschedule-booking\""],
  ["runway supports cancel booking", "\"cancel-booking\""],
  ["hold created next action", "Hold created. Convert to a booking only when the human confirms the session."],
  ["hold released next action", "Hold released. The time is no longer reserved unless a human creates a new hold or booking."],
  ["reschedule calendar caveat", "Update external calendar/invite evidence before promising the change is on calendars."],
  ["cancel calendar caveat", "Cancel external calendar/invite/payment evidence separately before saying the outside world is updated."],
  ["reschedule planned calendar evidence", "reschedule-planned"],
  ["cancel planned calendar evidence", "cancel-planned"],
  ["payment hold blocks capture", "Payment hold. Keep this out of confirmed capture until Stripe evidence lands."],
  ["paid booking starts holding payment", "status: paymentRecord ? \"HOLDING_PAYMENT\" : \"CONFIRMED\""],
]) {
  requireIncludes(texts.quipslyCoachingRunway, needle, label, files.quipslyCoachingRunway);
}

for (const [label, needle] of [
  ["calendar packet type", "type CalendarReadyPacket"],
  ["lifecycle type", "type CoachingLifecycle"],
  ["lifecycle panel", "function LifecyclePanel"],
  ["lifecycle receipt slots", "receipt slots"],
  ["calendar packet panel", "function CalendarPacketPanel"],
  ["calendar receipt label", "receipt-backed"],
  ["booking renders lifecycle", "LifecyclePanel lifecycle={booking.lifecycle}"],
  ["room renders lifecycle", "LifecyclePanel lifecycle={room.lifecycle}"],
  ["booking renders calendar packet", "CalendarPacketPanel packet={booking.calendarReadyPacket}"],
  ["room renders calendar packet", "CalendarPacketPanel packet={room.calendarReadyPacket}"],
]) {
  requireIncludes(texts.quipslyCoachingPage, needle, label, files.quipslyCoachingPage);
}

console.log(JSON.stringify({
  ok: true,
  checked: files,
  invariant: "HighGroundOdyssey.com is the public coaching doorway; Quipsly Nest owns booking, payment evidence, consent, capture, transcript, packet, and review truth unless legacy HGO APIs are explicitly enabled for migration.",
}, null, 2));
