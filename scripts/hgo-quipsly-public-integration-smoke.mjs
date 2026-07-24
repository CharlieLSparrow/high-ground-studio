#!/usr/bin/env node

const DEFAULT_HGO_BASE_URL = "https://highgroundodyssey.com";
const DEFAULT_QUIPSLY_BASE_URL = "https://quipsly.com";
const DEFAULT_NEST_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_TIMEOUT_MS = 12_000;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const hgoBaseUrl = normalizeBaseUrl(
  args.get("hgo-base-url") ||
    process.env.HGO_PUBLIC_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_HGO_SITE_URL ||
    DEFAULT_HGO_BASE_URL,
);
const quipslyBaseUrl = normalizeBaseUrl(
  args.get("quipsly-base-url") ||
    process.env.QUIPSLY_MARKETING_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_QUIPSLY_SITE_URL ||
    DEFAULT_QUIPSLY_BASE_URL,
);
const nestBaseUrl = normalizeBaseUrl(
  args.get("nest-base-url") ||
    process.env.NEST_PUBLIC_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    DEFAULT_NEST_BASE_URL,
);
const quipslyCoachingPath =
  args.get("quipsly-coaching-path") ||
  process.env.QUIPSLY_MARKETING_COACHING_SMOKE_PATH ||
  "/coaching";
const timeoutMs = Number.parseInt(
  args.get("timeout-ms") || process.env.HGO_QUIPSLY_PUBLIC_SMOKE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
  10,
) || DEFAULT_TIMEOUT_MS;
const jsonOutput = args.get("json") === "1" || process.env.HGO_QUIPSLY_PUBLIC_SMOKE_JSON === "1";
const warnOnly = args.get("warn-only") === "1" || process.env.HGO_QUIPSLY_PUBLIC_SMOKE_WARN_ONLY === "1";

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

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function snippet(raw) {
  return String(raw || "").replace(/\s+/g, " ").slice(0, 320);
}

async function request(baseUrl, path, accept = "text/html,application/json") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: accept },
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await response.text();
    return {
      ok: true,
      url: `${baseUrl}${path}`,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      raw,
      json: parseJson(raw),
    };
  } catch (error) {
    return {
      ok: false,
      url: `${baseUrl}${path}`,
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

async function checkHighGroundHome() {
  const result = await request(hgoBaseUrl, "/");
  const html = result.raw || "";
  expect(
    result.ok && result.status === 200 && html.includes("Published from Quipsly/Nest"),
    "hgoHomeEpisodePacketProvenance",
    "HighGroundOdyssey.com home renders published episode packet provenance from Quipsly/Nest.",
    {
      url: result.url,
      status: result.status,
      hasProvenance: html.includes("Published from Quipsly/Nest"),
      bodyPrefix: snippet(html),
    },
  );
}

async function checkHighGroundCoaching() {
  const result = await request(hgoBaseUrl, "/coaching");
  const html = result.raw || "";
  const hasCurrentHandoff =
    html.includes("Open Quipsly Booking") &&
    html.includes("Quipsly live packet") &&
    html.includes("Inspect packet") &&
    html.includes("Public handoff actions") &&
    html.includes("Quipsly Nest");
  const looksLikeOldBuild = html.includes("Book a Session") && html.includes("Donation-supported") && !hasCurrentHandoff;

  expect(
    result.ok && result.status === 200 && hasCurrentHandoff,
    "hgoCoachingUsesQuipslyOperationalHandoff",
    "HighGroundOdyssey.com /coaching displays the current HGO doorway plus Quipsly-owned operational handoff.",
    {
      url: result.url,
      status: result.status,
      hasCurrentHandoff,
      looksLikeOldBuild,
      hint: looksLikeOldBuild
        ? "Live HGO appears to be on the older donation-supported coaching page. Deploy/promote apps/web before this smoke can pass."
        : undefined,
      markers: {
        openQuipslyBooking: html.includes("Open Quipsly Booking"),
        quipslyLivePacket: html.includes("Quipsly live packet"),
        inspectPacket: html.includes("Inspect packet"),
        publicHandoffActions: html.includes("Public handoff actions"),
        quipslyNest: html.includes("Quipsly Nest"),
        oldBookSession: html.includes("Book a Session"),
      },
    },
  );
}

async function checkQuipslyMarketing() {
  const result = await request(quipslyBaseUrl, "/");
  const html = result.raw || "";
  const hasAudience = ["Storytellers", "Coaches", "Trainers", "Researchers"].every((marker) => html.includes(marker));
  const hasSystem = ["Quipsly Research", "Quipsly Studio", "Quipsly Tower"].every((marker) => html.includes(marker));

  expect(
    result.ok && result.status === 200 && hasAudience && hasSystem,
    "quipslyMarketingExplainsResearchStudioTower",
    "Quipsly.com explains Research, Studio, and Tower for storytellers, coaches, trainers, and researchers.",
    {
      url: result.url,
      status: result.status,
      hasAudience,
      hasSystem,
      bodyPrefix: snippet(html),
    },
  );
}

async function checkQuipslyCoachingMarketing() {
  const result = await request(quipslyBaseUrl, quipslyCoachingPath);
  const html = result.raw || "";
  const hasCoachingProductStory =
    html.includes("Coaching conversations should become useful without becoming slippery.") &&
    html.includes("For Homer and the coachee") &&
    html.includes("Coachee path") &&
    html.includes("Homer operator path") &&
    html.includes("High Ground Odyssey") &&
    html.includes("Quipsly Nest") &&
    html.includes("Quipsly Research") &&
    html.includes("Quipsly Studio") &&
    html.includes("Quipsly Tower") &&
    html.includes("Public handoff actions") &&
    html.includes("explicit consent") &&
    html.includes("source of truth");
  const fellThroughToNestFallback =
    html.includes("Your private creative workspace lives here.") ||
    html.includes("Sign in to Nest");

  expect(
    result.ok && result.status === 200 && hasCoachingProductStory && !fellThroughToNestFallback,
    "quipslyCoachingMarketingRoute",
    "Quipsly.com /coaching explains the coaching/capture product lane without falling through to the private Nest app fallback.",
    {
      url: result.url,
      path: quipslyCoachingPath,
      status: result.status,
      error: result.error,
      bodyPrefix: snippet(html),
      hasCoachingProductStory,
      fellThroughToNestFallback,
      hint: fellThroughToNestFallback
        ? "Quipsly.com /coaching is resolving to the private Nest fallback. Deploy the marketing route before using this URL as a coaching funnel."
        : undefined,
      markers: {
        humanJourney: html.includes("For Homer and the coachee"),
        highGroundOdyssey: html.includes("High Ground Odyssey"),
        quipslyNest: html.includes("Quipsly Nest"),
        researchStudioTower: ["Quipsly Research", "Quipsly Studio", "Quipsly Tower"].every((marker) => html.includes(marker)),
        publicHandoffActions: html.includes("Public handoff actions"),
        explicitConsent: html.includes("explicit consent"),
      },
    },
  );
}

async function checkNestPublicCoachingPacket() {
  const result = await request(nestBaseUrl, "/api/coaching/public?source=public-integration-smoke", "application/json");
  const packet = result.json;
  const isMissingRoute = result.status === 404 && result.raw.includes("This page could not be found");

  expect(
    result.ok &&
      result.status === 200 &&
      result.contentType.includes("application/json") &&
      isObject(packet) &&
      packet.ok === true &&
      packet.packetKind === "quipsly-public-coaching-handoff-v1" &&
      isObject(packet.boundaries) &&
      text(packet.boundaries.quipslyTruth) &&
      text(packet.boundaries.noExternalSideEffects) &&
      isObject(packet.nativeCapture) &&
      text(packet.nativeCapture.primaryCallPath).includes("Quipsly-owned in-app session rooms") &&
      text(packet.nativeCapture.nativeCallPresentation).includes("Start CallKit integration from the first native-room workflow") &&
      text(packet.nativeCapture.fallbackCallImport).includes("Phone") &&
      isObject(packet.publicLoop) &&
      Array.isArray(packet.publicLoop.owners) &&
      packet.publicLoop.owners.some((owner) => owner?.id === "nest" && owner?.sourceOfTruth === true) &&
      packet.publicLoop.owners.some((owner) => owner?.id === "native-capture") &&
      Array.isArray(packet.publicLoop.proofLadder) &&
      packet.publicLoop.proofLadder.some((proof) => proof?.currentState === "source-ready") &&
      packet.publicLoop.proofLadder.some((proof) => proof?.currentState === "preview-required") &&
      packet.publicLoop.proofLadder.some((proof) => proof?.currentState === "live-required") &&
      packet.publicLoop.proofLadder.some((proof) => proof?.currentState === "device-required") &&
      Array.isArray(packet.publicLoop.safeNextActions) &&
      packet.publicLoop.safeNextActions.length >= 4 &&
      packet.publicLoop.safeNextActions.every((action) =>
        isObject(action) &&
        text(action.id) &&
        text(action.label) &&
        text(action.boundary) &&
        action.externalSideEffects === false
      ) &&
      Array.isArray(packet.handoffActions) &&
      packet.handoffActions.length >= 4 &&
      packet.handoffActions.every((action) =>
        isObject(action) &&
        text(action.id) &&
        text(action.label) &&
        text(action.href) &&
        text(action.boundary) &&
        action.externalSideEffects === false
      ),
    "nestPublicCoachingPacketShape",
    "Nest exposes the public coaching packet and side-effect-free handoff actions as JSON for HGO and Quipsly integration.",
    {
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      hint: isMissingRoute
        ? "Live Nest does not include /api/coaching/public yet. Deploy/promote apps/quipsly before this smoke can pass."
        : undefined,
      body: packet || snippet(result.raw),
    },
  );
}

async function checkNestMobileCaptureReadiness() {
  const result = await request(nestBaseUrl, "/api/mobile/capture/readiness", "application/json");
  const readiness = result.json;
  const isMissingRoute = result.status === 404 && result.raw.includes("This page could not be found");

  expect(
    result.ok &&
      result.status === 200 &&
      result.contentType.includes("application/json") &&
      isObject(readiness) &&
      readiness.ok === true &&
      isObject(readiness.recordingPolicy) &&
      readiness.recordingPolicy.requiresExplicitConsent === true &&
      readiness.recordingPolicy.visibleRecordingIndicatorRequired === true &&
      isObject(readiness.callArchitecture) &&
      text(readiness.callArchitecture.primaryPath).includes("Quipsly-owned in-app session rooms") &&
      text(readiness.callArchitecture.nativePresentation).includes("Start CallKit integration from the first native-room workflow") &&
      text(readiness.callArchitecture.fallbackImport).includes("Phone") &&
      text(readiness.callArchitecture.phoneCallBoundary).includes("regular phone call") &&
      isObject(readiness.uploadAndTranscriptReadiness) &&
      text(readiness.uploadAndTranscriptReadiness.transcriptBoundary) &&
      isObject(readiness.paymentBoundary) &&
      text(readiness.paymentBoundary.stripeScope),
    "nestMobileCaptureReadinessShape",
    "Nest exposes mobile capture readiness as side-effect-free JSON for App Store review, native capture, and agent diagnostics.",
    {
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      hint: isMissingRoute
        ? "Live Nest does not include /api/mobile/capture/readiness yet. Deploy/promote apps/quipsly before native capture can prove live readiness."
        : undefined,
      body: readiness || snippet(result.raw),
    },
  );
}

async function checkNestMobileCaptureReviewDigestAuthBoundary() {
  const result = await request(nestBaseUrl, "/api/mobile/capture/review-digest", "application/json");
  const digest = result.json;
  const isMissingRoute = result.status === 404 && result.raw.includes("This page could not be found");

  expect(
    result.ok &&
      result.status === 401 &&
      result.contentType.includes("application/json") &&
      isObject(digest) &&
      digest.ok === false &&
      digest.error === "Sign in before loading the mobile capture review digest.",
    "nestMobileCaptureReviewDigestAuthBoundary",
    "Nest exposes the mobile capture review digest behind a calm authenticated JSON boundary.",
    {
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      hint: isMissingRoute
        ? "Live Nest does not include /api/mobile/capture/review-digest yet. Deploy/promote apps/quipsly before native capture reviewers can use the digest panel."
        : undefined,
      body: digest || snippet(result.raw),
    },
  );
}

async function main() {
  await checkHighGroundHome();
  await checkHighGroundCoaching();
  await checkQuipslyMarketing();
  await checkQuipslyCoachingMarketing();
  await checkNestPublicCoachingPacket();
  await checkNestMobileCaptureReadiness();
  await checkNestMobileCaptureReviewDigestAuthBoundary();

  const statusCounts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const failed = checks.filter((check) => check.status === "fail");
  const report = {
    ok: failed.length === 0,
    warnOnly,
    bases: { hgoBaseUrl, quipslyBaseUrl, nestBaseUrl },
    statusCounts,
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`HGO/Quipsly public integration smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`HGO: ${hgoBaseUrl}`);
    console.log(`Quipsly: ${quipslyBaseUrl}`);
    console.log(`Nest: ${nestBaseUrl}`);
    for (const check of checks) {
      const marker = check.status === "pass" ? "✓" : "✗";
      console.log(`${marker} ${check.name}: ${check.summary}`);
      if (check.status !== "pass" && check.details) {
        console.log(`  details: ${JSON.stringify(check.details)}`);
      }
    }
    if (warnOnly && !report.ok) {
      console.log("warn-only mode: drift reported without nonzero exit.");
    }
  }

  if (!report.ok && !warnOnly) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
