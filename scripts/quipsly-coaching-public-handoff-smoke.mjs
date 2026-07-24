#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_TIMEOUT_MS = 10_000;

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
  args.get("base-url") ||
    process.env.QUIPSLY_PUBLIC_COACHING_BASE_URL ||
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    DEFAULT_BASE_URL,
);
const timeoutMs =
  Number.parseInt(
    args.get("timeout-ms") ||
      process.env.QUIPSLY_PUBLIC_COACHING_TIMEOUT_MS ||
      String(DEFAULT_TIMEOUT_MS),
    10,
  ) || DEFAULT_TIMEOUT_MS;
const jsonOutput =
  args.get("json") === "1" ||
  process.env.QUIPSLY_PUBLIC_COACHING_JSON === "1";

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

function byId(items, id) {
  return Array.isArray(items)
    ? items.find((item) => isObject(item) && item.id === id)
    : null;
}

function includesEveryId(items, ids) {
  return ids.every((id) => Boolean(byId(items, id)));
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

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
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

async function checkPublicPacket() {
  const result = await request("/api/coaching/public?source=contract-smoke");
  const packet = result.json;

  expect(
    result.ok &&
      result.status === 200 &&
      result.contentType.includes("application/json") &&
      isObject(packet) &&
      packet.ok === true &&
      packet.packetKind === "quipsly-public-coaching-handoff-v1",
    "publicPacketShape",
    "Public coaching handoff returns JSON without requiring auth.",
    {
      status: result.status,
      contentType: result.contentType,
      body: packet || result.raw.slice(0, 240),
      error: result.error || undefined,
      hint:
        result.status === 404 && result.raw.includes("This page could not be found")
          ? "The deployed Nest image does not appear to include /api/coaching/public yet. Deploy/promote Quipsly, then rerun this smoke against the live base URL."
          : undefined,
    },
  );

  expect(
    isObject(packet?.links) &&
      text(packet.links.signInOrCreateFreeAccount).includes("/login?") &&
      text(packet.links.signInOrCreateFreeAccount).includes("callbackUrl=") &&
      text(packet.links.coachingRunway).includes("/coaching"),
    "publicPacketLinks",
    "Public coaching handoff points to Nest login and coaching runway.",
    { links: packet?.links || null },
  );

  expect(
    isObject(packet?.boundaries) &&
      text(packet.boundaries.noExternalSideEffects) &&
      text(packet.boundaries.quipslyTruth),
    "publicPacketBoundaries",
    "Public coaching handoff states side-effect and source-of-truth boundaries.",
    { boundaries: packet?.boundaries || null },
  );

  const publicLoop = packet?.publicLoop;
  const expectedOwners = ["hgo", "quipsly-com", "nest", "native-capture"];
  const expectedProofStates = [
    "source-ready",
    "preview-required",
    "live-required",
    "device-required",
  ];
  const expectedSafeActions = [
    "inspect-public-packet",
    "open-coaching-runway",
    "prepare-reviewer-capture-session",
    "run-capture-review-smoke",
  ];

  expect(
    isObject(publicLoop) &&
      includesEveryId(publicLoop.owners, expectedOwners) &&
      byId(publicLoop.owners, "nest")?.sourceOfTruth === true &&
      byId(publicLoop.owners, "hgo")?.sourceOfTruth === false &&
      byId(publicLoop.owners, "quipsly-com")?.sourceOfTruth === false &&
      byId(publicLoop.owners, "native-capture")?.sourceOfTruth === false,
    "publicPacketLoopOwners",
    "Public coaching handoff explains HGO, Quipsly.com, Nest, and native capture ownership.",
    {
      expectedOwners,
      owners: Array.isArray(publicLoop?.owners)
        ? publicLoop.owners.map((owner) => ({
            id: owner?.id,
            sourceOfTruth: owner?.sourceOfTruth,
          }))
        : publicLoop?.owners || null,
    },
  );

  expect(
    isObject(publicLoop) &&
      Array.isArray(publicLoop.proofLadder) &&
      expectedProofStates.every((state) =>
        publicLoop.proofLadder.some(
          (step) =>
            isObject(step) &&
            step.currentState === state &&
            text(step.proof) &&
            text(step.notProof),
        ),
      ),
    "publicPacketLoopProofLadder",
    "Public coaching handoff separates source, preview, live, and device proof.",
    {
      expectedProofStates,
      proofStates: Array.isArray(publicLoop?.proofLadder)
        ? publicLoop.proofLadder.map((step) => step?.currentState)
        : publicLoop?.proofLadder || null,
    },
  );

  expect(
    isObject(publicLoop) &&
      includesEveryId(publicLoop.safeNextActions, expectedSafeActions) &&
      publicLoop.safeNextActions.every(
        (action) =>
          isObject(action) &&
          text(action.label) &&
          text(action.summary) &&
          text(action.boundary) &&
          action.externalSideEffects === false,
      ),
    "publicPacketLoopSafeActions",
    "Public coaching handoff lists side-effect-free next actions for reviewers and agents.",
    {
      expectedSafeActions,
      safeActions: Array.isArray(publicLoop?.safeNextActions)
        ? publicLoop.safeNextActions.map((action) => ({
            id: action?.id,
            externalSideEffects: action?.externalSideEffects,
          }))
        : publicLoop?.safeNextActions || null,
    },
  );
}

async function main() {
  await checkPublicPacket();

  const statusCounts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const failed = checks.filter((check) => check.status === "fail");
  const report = {
    ok: failed.length === 0,
    baseUrl,
    statusCounts,
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quipsly public coaching handoff smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Base URL: ${baseUrl}`);
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
