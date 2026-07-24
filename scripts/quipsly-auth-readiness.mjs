#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_PROJECT_ID = "high-ground-odyssey";
const DEFAULT_BASE_URL = "https://nest.quipsly.com";
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
  args.get("base-url")
    || process.env.QUIPSLY_AUTH_READINESS_BASE_URL
    || DEFAULT_BASE_URL,
);
const projectId = args.get("project") || process.env.PROJECT_ID || DEFAULT_PROJECT_ID;
const timeoutMs = Number.parseInt(
  args.get("timeout-ms") || process.env.QUIPSLY_AUTH_READINESS_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
  10,
) || DEFAULT_TIMEOUT_MS;
const operatorOnly =
  args.get("operator-only") === "1"
  || process.env.QUIPSLY_AUTH_READINESS_OPERATOR_ONLY === "1";
const routeOnly =
  args.get("route-only") === "1"
  || process.env.QUIPSLY_AUTH_READINESS_ROUTE_ONLY === "1";
const includeRouteContract =
  (routeOnly || !operatorOnly)
  && args.get("skip-routes") !== "1"
  && process.env.QUIPSLY_AUTH_READINESS_SKIP_ROUTES !== "1";
const includeCleanupDryRun =
  !operatorOnly
  && !routeOnly
  &&
  args.get("skip-cleanup-dry-run") !== "1"
  && process.env.QUIPSLY_AUTH_READINESS_SKIP_CLEANUP_DRY_RUN !== "1";
const includeIdentityIntegrityAudit =
  !operatorOnly
  && !routeOnly
  &&
  args.get("skip-identity-audit") !== "1"
  && process.env.QUIPSLY_AUTH_READINESS_SKIP_IDENTITY_AUDIT !== "1";
const includeGoogleOauthBrowserSmoke =
  args.get("google-oauth-browser-smoke") === "1"
  || process.env.QUIPSLY_AUTH_READINESS_GOOGLE_OAUTH_BROWSER_SMOKE === "1";

const checks = [];

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function addCheck(check) {
  checks.push({
    name: check.name,
    status: check.status,
    summary: check.summary,
    action: check.action,
    details: check.details,
  });
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function runQuiet(command, commandArgs, options = {}) {
  if (!commandExists(command)) {
    return {
      ok: false,
      stdout: "",
      code: "command-missing",
      summary: `${command} is not installed or is not on PATH.`,
    };
  }

  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    timeout: options.timeoutMs || timeoutMs,
    env: {
      ...process.env,
      CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
      ...(options.env || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      ok: false,
      stdout: result.stdout || "",
      code: result.error.code || "command-error",
      summary: result.error.message || `${command} failed.`,
    };
  }

  if (result.status === 0) {
    return {
      ok: true,
      stdout: result.stdout || "",
    };
  }

  return {
    ok: false,
    stdout: result.stdout || "",
    code: `exit-${result.status ?? "unknown"}`,
    summary: summarizeStderr(result.stderr),
  };
}

function summarizeStderr(stderr) {
  const lines = String(stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^WARNING:/i.test(line))
    .slice(0, 4);
  if (!lines.length) return "Command failed without a useful error message.";
  return lines.join(" ");
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      signal: controller.signal,
      ...options,
    });
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      location: response.headers.get("location") || "",
      contentType: response.headers.get("content-type") || "",
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      location: "",
      contentType: "",
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function expectedLoginLocation(location) {
  if (!location) return false;
  try {
    const url = new URL(location, baseUrl);
    const origin = new URL(baseUrl).origin;
    return (
      url.origin === origin
      && url.pathname === "/login"
      && url.searchParams.get("callbackUrl") === "/projects"
    );
  } catch {
    return false;
  }
}

function containsAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function isLocalBaseUrl() {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function hasNestSignInGate(text) {
  return /Your private creative workspace lives here|Sign in to Nest|Quipsly Nest/i.test(text);
}

function hasOwnerOverrideAdminConsole(text) {
  return /User \+ Invite Console|Invite someone by email/i.test(text);
}

function hasOwnerOverrideAccountSwitcher(text) {
  return /Quipsly account switcher|No current session|Choose which person is opening this Nest/i.test(text);
}

function checkGcloudAuth() {
  const userAuth = runQuiet("gcloud", ["auth", "print-access-token", "--quiet"]);
  addCheck(userAuth.ok
    ? {
      name: "gcloudUserAuth",
      status: "pass",
      summary: "gcloud user auth can mint a token noninteractively.",
    }
    : {
      name: "gcloudUserAuth",
      status: "blocked",
      summary: userAuth.summary,
      action: `Run: gcloud auth login --project ${projectId}`,
    });

  const adc = runQuiet("gcloud", ["auth", "application-default", "print-access-token", "--quiet"]);
  addCheck(adc.ok
    ? {
      name: "applicationDefaultCredentials",
      status: "pass",
      summary: "Application Default Credentials can mint a token noninteractively.",
    }
    : {
      name: "applicationDefaultCredentials",
      status: "blocked",
      summary: adc.summary,
      action: `Run: gcloud auth application-default login --project ${projectId}`,
    });
}

async function checkRouteContract() {
  const login = await request("/login?callbackUrl=%2Fprojects");
  if (!login.ok) {
    addCheck({
      name: "loginPage",
      status: "fail",
      summary: `Could not reach /login on ${baseUrl}: ${login.error}`,
    });
  } else if (
    login.status === 200
    && containsAll(login.text, [/Sign in with Google/i, /Create account/i, /Send password reset/i])
    && !/\/api\/auth\/signin|\/api\/auth\/callback\/google/i.test(login.text)
  ) {
    addCheck({
      name: "loginPage",
      status: "pass",
      summary: "/login exposes Google, create-account, and password-reset without retired Auth.js links.",
    });
  } else {
    const loginSignals = {
      hasGoogle: /Sign in with Google/i.test(login.text),
      hasCreateAccount: /Create account/i.test(login.text),
      hasPasswordReset: /Send password reset/i.test(login.text),
      hasRetiredAuthJsRouteReferences: /\/api\/auth\/signin|\/api\/auth\/callback\/google/i.test(login.text),
    };
    addCheck({
      name: "loginPage",
      status: "fail",
      summary: "/login did not match the Firebase-first route contract.",
      details: { status: login.status, ...loginSignals },
    });
  }

  const signedOutProjects = await request("/projects");
  if (!signedOutProjects.ok) {
    addCheck({
      name: "signedOutProjectsBoundary",
      status: "fail",
      summary: `/projects could not be reached for signed-out boundary proof.`,
      details: { error: signedOutProjects.error },
    });
  } else if (
    signedOutProjects.status >= 500
    || /Application error|Unhandled Runtime Error|PrismaClientKnownRequestError|Cannot read properties of undefined|NEXT_REDIRECT_ERROR/i.test(signedOutProjects.text)
  ) {
    addCheck({
      name: "signedOutProjectsBoundary",
      status: "fail",
      summary: "/projects returned a server/framework error instead of a calm auth boundary.",
      details: { status: signedOutProjects.status },
    });
  } else if (signedOutProjects.status === 303 && expectedLoginLocation(signedOutProjects.location)) {
    addCheck({
      name: "signedOutProjectsBoundary",
      status: "pass",
      summary: "/projects redirects signed-out traffic to the canonical login entry point.",
    });
  } else if (
    signedOutProjects.status === 200
    && /Nests hold the work|Your private creative workspace lives here|Sign in to Nest|Create a Nest/i.test(signedOutProjects.text)
  ) {
    addCheck({
      name: "signedOutProjectsBoundary",
      status: "pass",
      summary: "/projects shows calm Nest/onboarding copy to signed-out traffic.",
    });
  } else {
    addCheck({
      name: "signedOutProjectsBoundary",
      status: "fail",
      summary: "/projects exposed an unexpected signed-out boundary shape.",
      details: { status: signedOutProjects.status, location: signedOutProjects.location || undefined },
    });
  }

  const session = await request("/api/auth/session");
  const sessionJson = parseJson(session.text);
  addCheck(
    session.ok && session.status === 401 && sessionJson?.authenticated === false
      ? {
        name: "unauthenticatedSession",
        status: "pass",
        summary: "/api/auth/session returns clean unauthenticated JSON.",
      }
      : {
        name: "unauthenticatedSession",
        status: "fail",
        summary: "/api/auth/session did not return the expected 401 authenticated=false shape.",
        details: { status: session.status, location: session.location || undefined },
      },
  );

  for (const [name, path] of [
    ["legacySigninQuarantine", "/api/auth/signin"],
    ["legacyGoogleCallbackQuarantine", "/api/auth/callback/google"],
  ]) {
    const legacy = await request(path);
    addCheck(
      legacy.ok && legacy.status === 303 && expectedLoginLocation(legacy.location)
        ? {
          name,
          status: "pass",
          summary: `${path} is quarantined to /login?callbackUrl=/projects.`,
        }
        : {
          name,
          status: "fail",
          summary: `${path} did not quarantine to the Firebase-first login entrypoint.`,
          details: { status: legacy.status, location: legacy.location || undefined },
        },
    );
  }

  for (const [name, path] of [
    ["signedOutAdminUsersBoundary", "/admin/users"],
    ["signedOutAccountSwitchBoundary", "/account/switch"],
  ]) {
    const protectedRoute = await request(path);
    if (!protectedRoute.ok) {
      addCheck({
        name,
        status: "fail",
        summary: `${path} could not be reached for signed-out boundary proof.`,
        details: { error: protectedRoute.error },
      });
      continue;
    }

    if (protectedRoute.status >= 500 || /Application error|Unhandled Runtime Error|PrismaClientKnownRequestError|Cannot read properties of undefined|NEXT_REDIRECT_ERROR/i.test(protectedRoute.text)) {
      addCheck({
        name,
        status: "fail",
        summary: `${path} returned a server/framework error instead of a calm auth boundary.`,
        details: { status: protectedRoute.status },
      });
      continue;
    }

    if (protectedRoute.status === 303 && expectedLoginLocation(protectedRoute.location)) {
      addCheck({
        name,
        status: "pass",
        summary: `${path} redirects signed-out traffic to the canonical login entry point.`,
      });
      continue;
    }

    if (protectedRoute.status === 200 && hasNestSignInGate(protectedRoute.text)) {
      addCheck({
        name,
        status: "pass",
        summary: `${path} shows the calm Nest sign-in gate to signed-out traffic.`,
      });
      continue;
    }

    const isExpectedLocalOwnerOverrideSurface =
      protectedRoute.status === 200
      && isLocalBaseUrl()
      && (
        (path === "/admin/users" && hasOwnerOverrideAdminConsole(protectedRoute.text))
        || (path === "/account/switch" && hasOwnerOverrideAccountSwitcher(protectedRoute.text))
      );
    if (isExpectedLocalOwnerOverrideSurface) {
      addCheck({
        name,
        status: "local-owner-override",
        summary: `${path} rendered a local owner-override app surface; this is development convenience, not production auth proof.`,
      });
      continue;
    }

    addCheck({
      name,
      status: "fail",
      summary: `${path} exposed an unexpected signed-out boundary shape.`,
      details: { status: protectedRoute.status, location: protectedRoute.location || undefined },
    });
  }

  const config = await request("/api/mac/firebase-client-config");
  const configJson = parseJson(config.text);
  addCheck(
    config.ok && config.status === 200 && configJson?.ok === true && configJson?.firebase?.authDomain
      ? {
        name: "firebaseClientConfig",
        status: "pass",
        summary: "Public Firebase client config is reachable.",
      }
      : {
        name: "firebaseClientConfig",
        status: "fail",
        summary: "Public Firebase client config is missing or malformed.",
        details: { status: config.status },
      },
  );

  const preflight = await request("/api/auth/firebase-admin-preflight");
  const preflightJson = parseJson(preflight.text);
  if (preflight.ok && preflight.status === 200 && preflightJson?.ok === true) {
    addCheck({
      name: "firebaseAdminPreflight",
      status: "pass",
      summary: "Server Firebase Admin credentials can reach Firebase.",
    });
  } else if (
    preflight.ok
    && preflight.status === 503
    && preflightJson?.error === "Firebase Admin credential unavailable"
  ) {
    addCheck({
      name: "firebaseAdminPreflight",
      status: routeOnly ? "structured-credential-blocker" : "blocked",
      summary: routeOnly
        ? "Firebase Admin preflight route returns sanitized structured credential-blocker JSON."
        : "Server route exists, but Firebase Admin credentials are stale or unavailable.",
      action: routeOnly ? undefined : "Refresh ADC locally or repair Cloud Run Firebase Admin credentials before generated signup smoke.",
    });
  } else if (preflight.ok && (preflight.status === 301 || preflight.status === 302 || preflight.status === 303)) {
    addCheck({
      name: "firebaseAdminPreflight",
      status: "fail",
      summary: "Firebase Admin preflight route is being redirected instead of returning structured JSON.",
      action: "Deploy the Firebase-first auth route or fix middleware so this public-safe preflight is not auth-trapped.",
      details: { status: preflight.status, location: preflight.location || undefined },
    });
  } else {
    addCheck({
      name: "firebaseAdminPreflight",
      status: "fail",
      summary: "Firebase Admin preflight route did not return a recognized healthy/blocker shape.",
      details: { status: preflight.status },
    });
  }

  const nativeSession = await request("/api/mac/session-check");
  const nativeSessionJson = parseJson(nativeSession.text);
  addCheck(
    nativeSession.ok && nativeSession.status === 401 && nativeSessionJson?.authenticated === false
      ? {
        name: "unauthenticatedNativeSession",
        status: "pass",
        summary: "/api/mac/session-check returns clean unauthenticated JSON.",
      }
      : {
        name: "unauthenticatedNativeSession",
        status: "fail",
        summary: "/api/mac/session-check did not return the expected 401 authenticated=false shape.",
        details: { status: nativeSession.status, location: nativeSession.location || undefined },
      },
  );
}

function checkGeneratedCleanupDryRun() {
  if (!includeCleanupDryRun) {
    addCheck({
      name: "generatedSmokeCleanupDryRun",
      status: "skip",
      summary: routeOnly
        ? "Skipped because --route-only does not touch local database/Firebase cleanup."
        : "Skipped by operator flag.",
    });
    return;
  }

  const dryRun = runQuiet(
    process.execPath,
    ["scripts/quipsly-clean-generated-smoke-artifacts.mjs"],
    { timeoutMs: Number.parseInt(process.env.QUIPSLY_AUTH_READINESS_CLEANUP_TIMEOUT_MS || "25000", 10) || 25_000 },
  );

  if (!dryRun.ok) {
    addCheck({
      name: "generatedSmokeCleanupDryRun",
      status: "blocked",
      summary: dryRun.summary,
      action: "Ensure DATABASE_URL and Firebase Admin credentials are available before applying generated-smoke cleanup.",
    });
    return;
  }

  const parsed = parseJson(dryRun.stdout);
  addCheck({
    name: "generatedSmokeCleanupDryRun",
    status: "pass",
    summary: "Generated smoke cleanup dry-run completed.",
    details: parsed
      ? {
        candidateGeneratedSmokeUsers: parsed.candidateGeneratedSmokeUsers,
        candidateGeneratedSmokeHomeProjects: parsed.candidateGeneratedSmokeHomeProjects,
      }
      : undefined,
  });
}

function checkIdentityIntegrityAudit() {
  if (!includeIdentityIntegrityAudit) {
    addCheck({
      name: "identityIntegrityAudit",
      status: "skip",
      summary: routeOnly
        ? "Skipped because --route-only does not touch the app database."
        : operatorOnly
          ? "Skipped because --operator-only checks only local operator credentials."
          : "Skipped by operator flag.",
    });
    return;
  }

  const audit = runQuiet(
    process.execPath,
    ["scripts/quipsly-identity-integrity-audit.mjs"],
    { timeoutMs: Number.parseInt(process.env.QUIPSLY_AUTH_READINESS_IDENTITY_AUDIT_TIMEOUT_MS || "25000", 10) || 25_000 },
  );
  const parsed = parseJson(audit.stdout);

  if (audit.ok && parsed?.ok === true) {
    addCheck({
      name: "identityIntegrityAudit",
      status: "pass",
      summary: "App-owned user identity integrity audit passed.",
      details: {
        users: parsed.counts?.users,
        aliases: parsed.counts?.aliases,
        firebaseLinkedUsers: parsed.counts?.firebaseLinkedUsers,
        firebaseLinkedActiveUsers: parsed.counts?.firebaseLinkedActiveUsers,
        homeNests: parsed.counts?.homeNests,
        activeFreeMemberships: parsed.counts?.activeFreeMemberships,
        warnings: parsed.issueCounts?.warnings,
      },
    });
    return;
  }

  if (parsed?.failureKind === "identity-conflict") {
    addCheck({
      name: "identityIntegrityAudit",
      status: "fail",
      summary: "App-owned user identity integrity audit found conflicting email/user records.",
      action: "Resolve duplicate primary emails, alias collisions, or Firebase UID collisions before declaring auth safe.",
      details: {
        hardIssues: parsed.issueCounts?.hardIssues,
        warnings: parsed.issueCounts?.warnings,
        redaction: parsed.redaction,
      },
    });
    return;
  }

  addCheck({
    name: "identityIntegrityAudit",
    status: "blocked",
    summary: parsed?.summary || audit.summary,
    action: parsed?.action || "Ensure DATABASE_URL and database reachability are available for the read-only identity audit.",
  });
}

function checkGoogleOauthBrowserSmoke() {
  if (!includeGoogleOauthBrowserSmoke) {
    addCheck({
      name: "googleOauthBrowserSmoke",
      status: "skip",
      summary: "Skipped unless --google-oauth-browser-smoke is provided; this launches a browser to prove Google accepts Firebase's redirect handler.",
    });
    return;
  }

  const smoke = runQuiet(
    process.execPath,
    ["scripts/quipsly-google-oauth-browser-smoke.mjs"],
    {
      timeoutMs: Number.parseInt(process.env.QUIPSLY_AUTH_READINESS_GOOGLE_OAUTH_TIMEOUT_MS || "45000", 10) || 45_000,
      env: {
        QUIPSLY_GOOGLE_OAUTH_SMOKE_BASE_URL: baseUrl,
      },
    },
  );
  const parsed = parseJson(smoke.stdout);

  if (smoke.ok && parsed?.ok === true) {
    addCheck({
      name: "googleOauthBrowserSmoke",
      status: "pass",
      summary: "Google accepted Firebase's redirect handler and reached the Google account/consent flow.",
      details: {
        classification: parsed.classification,
      },
    });
    return;
  }

  if (parsed?.classification === "redirect-uri-mismatch") {
    addCheck({
      name: "googleOauthBrowserSmoke",
      status: "blocked",
      summary: "Google rejected Firebase's redirect handler with redirect_uri_mismatch.",
      action: parsed.nextAction,
      details: {
        classification: parsed.classification,
        requiredRedirectUri: parsed.requiredRedirectUri,
        currentPage: parsed.currentPage,
      },
    });
    return;
  }

  addCheck({
    name: "googleOauthBrowserSmoke",
    status: "blocked",
    summary: parsed?.classification
      ? `Google OAuth browser smoke did not reach a passing provider state: ${parsed.classification}.`
      : smoke.summary,
    action: parsed?.nextAction || "Run node scripts/quipsly-google-oauth-browser-smoke.mjs and inspect the sanitized classification.",
    details: parsed
      ? {
        classification: parsed.classification,
        currentPage: parsed.currentPage,
      }
      : undefined,
  });
}

function summarize() {
  const failing = checks.filter((check) => check.status === "fail");
  const blocked = checks.filter((check) => check.status === "blocked");
  const ok = failing.length === 0 && blocked.length === 0;
  const nextActions = [
    ...blocked.map((check) => check.action).filter(Boolean),
    ...failing.map((check) => check.action).filter(Boolean),
  ];

  return {
    ok,
    baseUrl,
    projectId,
    checks,
    nextActions: Array.from(new Set(nextActions)),
    note: "This readiness report intentionally suppresses access tokens, cookies, passwords, database URLs, and secret values.",
  };
}

if (routeOnly) {
  addCheck({
    name: "operatorCredentials",
    status: "skip",
    summary: "Skipped because --route-only checks public app route contracts without gcloud/ADC.",
  });
} else {
  checkGcloudAuth();
}
if (includeRouteContract) {
  await checkRouteContract();
} else {
  addCheck({
    name: "routeContract",
    status: "skip",
    summary: operatorOnly
      ? "Skipped because --operator-only checks only local operator credentials."
      : routeOnly
        ? "Skipped by route flag."
      : "Skipped by operator flag.",
  });
}
checkIdentityIntegrityAudit();
checkGeneratedCleanupDryRun();
checkGoogleOauthBrowserSmoke();

const result = summarize();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
