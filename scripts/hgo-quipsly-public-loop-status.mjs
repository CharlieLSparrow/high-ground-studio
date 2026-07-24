#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const warnOnly = args.has("--warn-only");
const deepLocal = args.has("--deep-local");
const skipIntegration = args.has("--skip-integration");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  const stdout = result.stdout?.trim() || "";
  const stderr = result.stderr?.trim() || "";
  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status,
    stdout,
    stderr,
  };
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeAuth(authCheck) {
  if (authCheck.status === "pass") {
    return {
      ready: true,
      summary: "Operator gcloud and ADC credentials are ready for preview deploy checks.",
      nextAction: "Run preview deploy and smoke preview URLs before promotion.",
    };
  }

  return {
    ready: false,
    summary: "Operator gcloud/ADC credentials are not ready for deploy or live preview smokes.",
    nextAction: "Run `gcloud auth login --update-adc --brief`, then `bash scripts/release/quipsly-gcloud-auth-check.sh`.",
  };
}

function summarizeSource(sourceCheck, deepReadiness) {
  if (deepReadiness) {
    return {
      ready: deepReadiness.localSourceReady === true,
      summary: deepReadiness.currentTruth || "Deep local readiness completed.",
      nextAction: deepReadiness.nextSafeAction || "Run full release readiness with operator auth.",
      readinessState: deepReadiness.readinessState || "unknown",
    };
  }

  return {
    ready: sourceCheck.status === "pass",
    summary: sourceCheck.status === "pass"
      ? "Fast source contract smoke passed. Use --deep-local before preview deploy if builds or route layout changed."
      : "Fast source contract smoke failed.",
    nextAction: sourceCheck.status === "pass"
      ? "Refresh operator auth, then run full readiness before preview deploy."
      : "Fix the HGO/Quipsly handoff static contract before deploy.",
    readinessState: sourceCheck.status === "pass" ? "source-contract-smoke-ready" : "source-contract-blocked",
  };
}

function summarizeRoutes(routeMatrix) {
  if (!routeMatrix) {
    return {
      ready: false,
      summary: "Live public route matrix did not return parseable JSON.",
      nextAction: "Run `node scripts/hgo-quipsly-public-route-matrix.mjs --json` and inspect the raw failure.",
      failures: [],
    };
  }

  const failures = Array.isArray(routeMatrix.checks)
    ? routeMatrix.checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          id: check.id,
          owner: check.owner,
          failureSummary: check.failureSummary,
          likelyCause: check.likelyCause,
          nextAction: check.nextAction,
          fixLane: check.fixLane,
          finalUrl: check.finalUrl,
          httpStatus: check.httpStatus,
          server: check.server,
          failureClass: check.failureClass,
        }))
    : [];

  const unavailableFailures = failures.filter((failure) => failure.failureClass === "service-unavailable");
  const unavailableHosts = [...new Set(unavailableFailures.map((failure) => {
    try {
      return new URL(failure.finalUrl).host;
    } catch {
      return failure.finalUrl;
    }
  }).filter(Boolean))];

  return {
    ready: routeMatrix.ok === true,
    serviceUnavailable: unavailableFailures.length > 0,
    unavailableHosts,
    summary: routeMatrix.ok === true
      ? "Live public route matrix passes."
      : unavailableFailures.length === failures.length && failures.length > 0
        ? `All ${failures.length} live checks are service-unavailable across ${unavailableHosts.length} host${unavailableHosts.length === 1 ? "" : "s"}; application route contracts were not reachable.`
        : `Live public route matrix has ${failures.length} failing check${failures.length === 1 ? "" : "s"}.`,
    nextAction: unavailableFailures.length > 0
      ? unavailableFailures[0].nextAction
      : failures[0]?.nextAction || "Keep live public route matrix in the release smoke set.",
    failures,
  };
}

function summarizeIntegration(integrationSmoke) {
  if (!integrationSmoke) {
    return {
      ready: false,
      summary: "Live public integration smoke did not return parseable JSON.",
      nextAction: "Run `node scripts/hgo-quipsly-public-integration-smoke.mjs --json` and inspect the raw failure.",
      failures: [],
    };
  }

  const failures = Array.isArray(integrationSmoke.checks)
    ? integrationSmoke.checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          name: check.name,
          summary: check.summary,
          details: check.details || null,
        }))
    : [];

  return {
    ready: integrationSmoke.ok === true,
    summary: integrationSmoke.ok === true
      ? "Live public integration smoke passes."
      : `Live public integration smoke has ${failures.length} failing check${failures.length === 1 ? "" : "s"}.`,
    nextAction: failures[0]?.summary || "Keep live public integration smoke in the release smoke set.",
    failures,
  };
}

function readinessState({ source, auth, routes, integration }) {
  if (!source.ready) return "source-contract-blocked";
  if (routes.serviceUnavailable) {
    return auth.ready ? "live-service-unavailable" : "live-service-unavailable-auth-blocked";
  }
  if (!auth.ready) return "deploy-auth-blocked";
  if (!routes.ready) return "auth-ready-live-drift-present";
  if (!integration.ready) return "route-matrix-clean-integration-blocked";
  return "public-loop-live-clean";
}

function humanReport(report) {
  console.log(`HGO/Quipsly public loop status: ${report.readinessState}`);
  console.log(`Current truth: ${report.currentTruth}`);
  console.log(`Next safe action: ${report.nextSafeAction}`);
  console.log("");
  console.log(`Source: ${report.source.ready ? "PASS" : "FAIL"} - ${report.source.summary}`);
  console.log(`Deploy auth: ${report.auth.ready ? "PASS" : "FAIL"} - ${report.auth.summary}`);
  console.log(`Live routes: ${report.routes.ready ? "PASS" : "FAIL"} - ${report.routes.summary}`);
  console.log(`Live integration: ${report.integration.ready ? "PASS" : "FAIL"} - ${report.integration.summary}`);

  if (report.routes.failures.length > 0) {
    console.log("");
    const allUnavailable = report.routes.failures.every(
      (failure) => failure.failureClass === "service-unavailable",
    );
    if (allUnavailable) {
      const exemplar = report.routes.failures[0];
      console.log("Live service blocker:");
      console.log(`- hosts: ${report.routes.unavailableHosts.join(", ") || "unknown"}`);
      console.log(`  likely: ${exemplar.likelyCause}`);
      console.log(`  next: ${exemplar.nextAction}`);
      return;
    }

    console.log("Live route work orders:");
    for (const failure of report.routes.failures) {
      console.log(`- ${failure.id}: ${failure.failureSummary || "failed"}`);
      console.log(`  likely: ${failure.likelyCause || "unknown"}`);
      console.log(`  next: ${failure.nextAction || failure.fixLane || "inspect route"}`);
    }
  }
}

const sourceCheck = run("node", ["scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs"]);
const authCheck = run("bash", ["scripts/release/quipsly-gcloud-auth-check.sh"]);
const routeCheck = run("node", ["scripts/hgo-quipsly-public-route-matrix.mjs", "--json"]);
const integrationCheck = skipIntegration
  ? null
  : run("node", ["scripts/hgo-quipsly-public-integration-smoke.mjs", "--json"]);
const deepCheck = deepLocal
  ? run("node", ["scripts/hgo-quipsly-release-readiness.mjs", "--local-only", "--json"])
  : null;

const source = summarizeSource(sourceCheck, deepCheck ? parseJson(deepCheck.stdout) : null);
const auth = summarizeAuth(authCheck);
const routes = summarizeRoutes(parseJson(routeCheck.stdout));
const integration = skipIntegration
  ? {
      ready: true,
      summary: "Live public integration smoke skipped by --skip-integration.",
      nextAction: "Run without --skip-integration before making broad live-public claims.",
      failures: [],
    }
  : summarizeIntegration(parseJson(integrationCheck.stdout));
const state = readinessState({ source, auth, routes, integration });
const currentTruth = source.ready
  ? routes.serviceUnavailable
    ? auth.ready
      ? `Source contract is coherent, but public services are unavailable across ${routes.unavailableHosts.join(", ") || "the checked hosts"}; application routes were not reached.`
      : `Source contract is coherent, public services are unavailable across ${routes.unavailableHosts.join(", ") || "the checked hosts"}, and operator auth is expired, so service-plane/billing/revision state cannot yet be inspected.`
    : auth.ready
    ? routes.ready
      ? integration.ready
        ? "Source contract, operator auth, live route matrix, and live public integration smoke agree."
        : "Source contract, operator auth, and live route matrix agree, but live public integration still needs attention."
      : "Source contract is coherent and auth is ready, but live public routes still drift."
    : "Source contract is coherent, but deploy/live proof is blocked by operator auth."
  : "Source contract is blocked; do not deploy.";
const nextSafeAction = !source.ready
  ? source.nextAction
  : routes.serviceUnavailable && !auth.ready
    ? `${auth.nextAction} Then inspect project billing and Cloud Run service/revision readiness before changing application code or deploying.`
    : routes.serviceUnavailable
      ? routes.nextAction
  : !auth.ready
    ? auth.nextAction
    : !routes.ready
      ? routes.nextAction
      : !integration.ready
        ? integration.nextAction
        : "Keep receipt-backed promotion notes and run device/reviewer proof before claiming native capture complete.";

const report = {
  ok: source.ready && auth.ready && routes.ready && integration.ready,
  checkedAt: new Date().toISOString(),
  readinessState: state,
  currentTruth,
  nextSafeAction,
  safeToPreviewDeploy: source.ready && auth.ready,
  safeToPromoteLive: false,
  promotionRule: "Promotion still requires explicit preview smoke proof and operator approval; this status command does not deploy or promote.",
  source,
  auth,
  routes,
  integration,
  commands: {
    source: sourceCheck.command,
    auth: authCheck.command,
    routes: routeCheck.command,
    integration: integrationCheck?.command || null,
    deepLocal: deepCheck?.command || null,
  },
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  humanReport(report);
}

if (!report.ok && !warnOnly) {
  process.exit(1);
}
