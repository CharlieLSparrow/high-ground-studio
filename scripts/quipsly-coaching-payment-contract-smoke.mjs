#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_TIMEOUT_MS = 10_000;
const repoRoot = process.cwd();

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const baseUrl = normalizeBaseUrl(
  args.get("base-url")
    || process.env.QUIPSLY_COACHING_SMOKE_BASE_URL
    || process.env.NEXT_PUBLIC_NEST_BASE_URL
    || DEFAULT_BASE_URL,
);
const timeoutMs = Number.parseInt(
  args.get("timeout-ms")
    || process.env.QUIPSLY_COACHING_PAYMENT_TIMEOUT_MS
    || String(DEFAULT_TIMEOUT_MS),
  10,
) || DEFAULT_TIMEOUT_MS;
const jsonOutput = args.get("json") === "1" || process.env.QUIPSLY_COACHING_PAYMENT_JSON === "1";
const staticOnly = args.get("static-only") === "1" || process.env.QUIPSLY_COACHING_PAYMENT_STATIC_ONLY === "1";

const checks = [];

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function addCheck(name, status, summary, details = undefined) {
  checks.push({ name, status, summary, details });
}

function expect(condition, name, summary, details) {
  addCheck(name, condition ? "pass" : "fail", summary, details);
}

function readText(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, "utf8");
}

function includesNormalized(source, needle) {
  const compact = (value) => String(value).replace(/\s+/g, " ").trim();
  return compact(source).includes(compact(needle));
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs);
  try {
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : options.rawBody,
      redirect: "manual",
      signal: controller.signal,
    });
    const raw = await response.text();
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      raw,
      json: parseJson(raw),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      raw: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function calmJson(result) {
  return Boolean(result.ok && [400, 401, 403, 404, 409, 422, 503].includes(result.status) && isObject(result.json));
}

function protectedBoundary(result) {
  return Boolean(
    result.ok
      && result.status === 401
      && isObject(result.json)
      && result.json.ok === false
      && text(result.json.error),
  );
}

async function checkProtectedPaymentRoutes() {
  const protectedChecks = [
    {
      name: "checkoutUnauthenticatedBoundary",
      path: "/api/coaching/checkout",
      body: { bookingId: "generated-safe-missing-booking" },
      expectedSummary: "Checkout creation requires a signed-in Quipsly session.",
    },
    {
      name: "customerPortalUnauthenticatedBoundary",
      path: "/api/coaching/customer-portal",
      body: {},
      expectedSummary: "Customer Portal creation requires a signed-in Quipsly session.",
    },
  ];

  for (const check of protectedChecks) {
    const result = await request(check.path, { method: "POST", body: check.body });
    expect(
      protectedBoundary(result),
      check.name,
      check.expectedSummary,
      { status: result.status, body: result.json || result.raw.slice(0, 240) },
    );
  }
}

async function checkWebhookBoundary() {
  const result = await request("/api/coaching/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=invalid",
    },
    rawBody: JSON.stringify({ id: "evt_generated_contract_smoke", type: "checkout.session.completed" }),
  });

  expect(
    calmJson(result) && result.json.ok === false && text(result.json.error),
    "stripeWebhookControlledFailure",
    "Stripe webhook route returns calm JSON for missing config or bad signature, never HTML or an unhandled crash.",
    { status: result.status, body: result.json || result.raw.slice(0, 240) },
  );
}

function checkStaticStripeBoundaries() {
  const files = {
    helper: "apps/quipsly/src/lib/server/coaching-stripe.ts",
    mobileReadiness: "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts",
    runway: "apps/quipsly/src/app/api/coaching/runway/route.ts",
    publicRoute: "apps/quipsly/src/app/api/coaching/public/route.ts",
    runwayPage: "apps/quipsly/src/app/(app)/coaching/page.tsx",
    quipslyMarketingCoachingPage: "apps/quipsly/src/app/(marketing)/public/coaching/page.tsx",
    hgoCoachingPage: "apps/web/src/app/coaching/page.tsx",
    publicDomain: "packages/quipsly-domain/src/coaching-public.ts",
    spineDoc: "docs/quipsly/coaching-capture-production-spine.md",
  };
  const texts = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, readText(relativePath)]),
  );

  for (const [key, value] of Object.entries(texts)) {
    expect(Boolean(value), `staticFilePresent:${key}`, `${files[key]} is present for coaching payment boundary inspection.`, {
      path: files[key],
    });
  }

  if (Object.values(texts).some((value) => !value)) return;

  const combined = Object.values(texts).join("\n");
  const readsEnv = (text, name) =>
    text.includes(`process.env.${name}`) ||
    text.includes(`process.env["${name}"]`) ||
    text.includes(`process.env['${name}']`);
  expect(
    texts.helper.includes('const LIVE_STRIPE_GUARD = "QUIPSLY_ALLOW_LIVE_STRIPE"')
      && readsEnv(texts.mobileReadiness, "QUIPSLY_ALLOW_LIVE_STRIPE")
      && readsEnv(texts.runway, "QUIPSLY_ALLOW_LIVE_STRIPE")
      && texts.spineDoc.includes("`QUIPSLY_ALLOW_LIVE_STRIPE=true`"),
    "singleLiveStripeGuard",
    "Coaching payment surfaces use one explicit live Stripe guard: QUIPSLY_ALLOW_LIVE_STRIPE.",
  );
  expect(
    texts.mobileReadiness.includes("paymentBoundary")
      && texts.mobileReadiness.includes("coachingCustomerPortalEnabled")
      && texts.mobileReadiness.includes("stripeMode")
      && texts.mobileReadiness.includes("test-or-held")
      && texts.mobileReadiness.includes("Checkout is only for eligible paid one-to-one real-time coaching")
      && texts.mobileReadiness.includes("Customer Portal requires existing Stripe customer evidence"),
    "mobileReadinessPaymentBoundary",
    "Mobile capture readiness exposes Stripe mode, portal gate, and one-to-one-only checkout boundary without leaking provider secrets.",
  );
  expect(
    !combined.includes("ALLOW_LIVE_COACHING_STRIPE"),
    "noRetiredLiveStripeGuard",
    "Retired ALLOW_LIVE_COACHING_STRIPE flag is not present in active coaching payment surfaces.",
  );
  expect(
    texts.helper.includes('booking.paymentPolicy !== "PAID_ONE_TO_ONE"')
      && texts.helper.includes('offering.kind !== "ONE_TO_ONE_COACHING"')
      && /not groups, courses, libraries, or SaaS/i.test(texts.helper),
    "oneToOneOnlyCheckoutBoundary",
    "Stripe checkout stays scoped to paid one-to-one coaching, not SaaS, courses, groups, or libraries.",
  );
  expect(
    (texts.helper.includes('process.env.COACHING_CUSTOMER_PORTAL_ENABLED !== "true"')
      || texts.helper.includes('process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] !== "true"')
      || texts.helper.includes("process.env['COACHING_CUSTOMER_PORTAL_ENABLED'] !== \"true\""))
      && /requires existing Stripe customer evidence/i.test(texts.helper),
    "customerPortalEvidenceBoundary",
    "Customer Portal remains disabled by default and requires existing Stripe customer evidence.",
  );
  expect(
    texts.helper.includes("stripeWebhookEvent")
      && texts.helper.includes("processed_unmatched")
      && texts.helper.includes("Stripe webhook signature verification failed"),
    "stripeWebhookLedgerBoundary",
    "Webhook route keeps verified provider events as ledger evidence and handles unmatched checkout sessions calmly.",
  );
  expect(
    texts.runway.includes("journeySummary")
      && texts.runway.includes("bookingJourneySummary")
      && texts.runway.includes("roomJourneySummary")
      && texts.runway.includes("recordingConsentSummary"),
    "runwayJourneySummaryBoundary",
    "Coaching runway exposes app-owned journey summaries for booking, payment, room, consent, recording, transcript, and packet state.",
  );
  expect(
    texts.runway.includes("paymentReadiness")
      && texts.runway.includes("stripeMode")
      && texts.runway.includes("test-or-held")
      && texts.runway.includes("live-enabled")
      && texts.runway.includes("not-configured")
      && texts.runway.includes("Checkout is only for eligible paid one-to-one real-time coaching"),
    "runwayPaymentReadinessBoundary",
    "Coaching runway exposes explicit payment readiness without confusing Stripe configuration with permission to sell broader digital products.",
  );
  expect(
    texts.runwayPage.includes("function JourneyPanel")
      && includesNormalized(texts.runwayPage, "JourneyPanel summary={booking.journeySummary}")
      && includesNormalized(texts.runwayPage, "JourneyPanel summary={room.journeySummary}")
      && texts.runwayPage.includes("EvidenceDot"),
    "runwayJourneySummaryUi",
    "Coaching runway UI displays the journey summary and evidence checklist for bookings and capture rooms.",
  );
  expect(
    includesNormalized(texts.runwayPage, "Payment evidence boundary")
      && texts.runwayPage.includes("paymentReadiness")
      && texts.runwayPage.includes("Test/internal evidence only")
      && texts.runwayPage.includes("Live guard enabled")
      && includesNormalized(texts.runwayPage, "Customer Portal requires existing Stripe customer evidence")
      && texts.runwayPage.includes("Operations and provider diagnostics")
      && texts.runwayPage.includes("isStaff ?"),
    "runwayPaymentReadinessUi",
    "Coaching runway UI makes Stripe mode, Customer Portal gate, and eligible one-to-one boundary visible to operators.",
  );
  expect(
    texts.runway.includes('"setup-coach-profile"')
      && texts.runway.includes("userRole.upsert")
      && texts.runway.includes("role: \"COACH\"")
      && texts.runway.includes("serviceOffering.upsert")
      && texts.runway.includes("availabilityWindow")
      && texts.runway.includes('setupMode: "automatic-on-first-session"')
      && texts.runway.includes("isCoach: coachProfiles.length > 0"),
    "runwayCoachSetupBoundary",
    "Coaching runway creates durable coach defaults automatically on the first Session while retaining optional editable preferences.",
  );
  expect(
    texts.runwayPage.includes("Coaching preferences")
      && texts.runwayPage.includes("Optional · Quipsly starts with sensible defaults")
      && texts.runwayPage.includes("setupCoachProfile")
      && texts.runwayPage.includes("canScheduleCoaching")
      && includesNormalized(texts.runwayPage, "Schedule and send invite"),
    "runwayCoachSetupUi",
    "Coaching runway keeps editable preferences available without putting a setup gate before scheduling.",
  );
  expect(
    texts.publicRoute.includes("Custom quote")
      && texts.publicRoute.includes("request a booking hold or custom checkout link"),
    "publicCoachingCustomQuoteBoundary",
    "Public coaching packet can describe paid coaching as a custom-quote handoff without pretending public pages create charges.",
  );
  expect(
    texts.publicRoute.includes("clientJourney")
      && texts.publicRoute.includes("operatorJourney")
      && combined.includes("QUIPSLY_COACHING_CLIENT_JOURNEY")
      && combined.includes("QUIPSLY_COACHING_OPERATOR_JOURNEY")
      && combined.includes("What the coachee sees")
      && combined.includes("What Homer manages")
      && combined.includes("For Homer and the coachee"),
    "coachingHumanJourneyBoundary",
    "Public coaching surfaces expose a plain-English coachee path and Homer operator path instead of provider-first workflow language.",
  );
  expect(
    texts.runway.includes("payment-checkout-needed")
      && texts.runway.includes("payment-pending")
      && texts.runway.includes("ready-to-record")
      && texts.runway.includes("transcription-needed")
      && texts.runway.includes("packet-ready"),
    "runwayJourneyStages",
    "Coaching runway names the route from booking to payment evidence, recording, transcription, and packet review.",
  );
}

async function main() {
  checkStaticStripeBoundaries();
  if (!staticOnly) {
    await checkProtectedPaymentRoutes();
    await checkWebhookBoundary();
  }

  const statusCounts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const failed = checks.filter((check) => check.status === "fail");
  const report = {
    ok: failed.length === 0,
    baseUrl,
    staticOnly,
    statusCounts,
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quipsly coaching payment contract smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Static only: ${staticOnly ? "yes" : "no"}`);
    for (const check of checks) {
      const marker = check.status === "pass" ? "✓" : "✗";
      console.log(`${marker} ${check.name}: ${check.summary}`);
      if (check.status !== "pass" && check.details) {
        console.log(`  details: ${JSON.stringify(check.details)}`);
      }
    }
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
