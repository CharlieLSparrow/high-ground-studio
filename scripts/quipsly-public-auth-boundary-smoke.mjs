#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(
  process.env.QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL || "https://nest.quipsly.com",
);

function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
  });
  const text = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location") || "",
    contentType: response.headers.get("content-type") || "",
    text,
  };
}

function parseJson(label, text) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} did not return parseable JSON`);
  }
}

function expectedLoginLocation(location) {
  if (!location) return false;
  let url;
  try {
    url = new URL(location, baseUrl);
  } catch {
    return false;
  }

  return (
    url.origin === new URL(baseUrl).origin
    && url.pathname === "/login"
    && url.searchParams.get("callbackUrl") === "/projects"
  );
}

function assertNoServerError(label, response) {
  assert(
    response.status < 500,
    `${label} should not return a server error`,
    { status: response.status },
  );
  assert(
    !/Application error|Unhandled Runtime Error|PrismaClientKnownRequestError|Cannot read properties of undefined|NEXT_REDIRECT_ERROR/i.test(response.text),
    `${label} rendered a framework/server error instead of a calm auth boundary`,
  );
}

function isLocalBaseUrl() {
  const hostname = new URL(baseUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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

const checks = [];

try {
  const login = await request("/login?callbackUrl=/projects");
  assert(login.status === 200, "/login should render", {
    status: login.status,
  });
  assert(
    /Welcome back|One account opens your Quipsly Home Nest|Continue with Google/i.test(login.text),
    "/login rendered but did not look like the Firebase-first login page",
  );
  assert(
    /Create account/i.test(login.text),
    "/login rendered but did not expose the email/password free-account doorway",
  );
  assert(
    /Forgot password/i.test(login.text),
    "/login rendered but did not expose password recovery",
  );
  assert(
    !/\/api\/auth\/signin|\/api\/auth\/callback\/google/i.test(login.text),
    "/login includes retired Auth.js route references.",
  );
  checks.push({ name: "loginPage", status: "pass" });

  const signedOutProjects = await request("/projects");
  assertNoServerError("/projects", signedOutProjects);
  if (signedOutProjects.status === 303) {
    assert(
      expectedLoginLocation(signedOutProjects.location),
      "/projects redirected somewhere other than the canonical login entry point",
      { location: signedOutProjects.location },
    );
  } else {
    assert(signedOutProjects.status === 200, "/projects should render or redirect calmly", {
      status: signedOutProjects.status,
    });
    assert(
      /Nests hold the work|Your private creative workspace lives here|Sign in to Nest|Create a Nest/i.test(signedOutProjects.text),
      "/projects rendered but did not expose calm signed-out/onboarding copy",
    );
  }
  checks.push({ name: "signedOutProjectsBoundary", status: "pass" });

  for (const [name, path] of [
    ["signedOutAdminUsersBoundary", "/admin/users"],
    ["signedOutAccountSwitchBoundary", "/account/switch"],
  ]) {
    const protectedRoute = await request(path);
    assertNoServerError(path, protectedRoute);
    assert(protectedRoute.status === 200 || protectedRoute.status === 303, `${path} should render or redirect calmly`, {
      status: protectedRoute.status,
      location: protectedRoute.location || undefined,
    });
    if (protectedRoute.status === 303) {
      assert(
        expectedLoginLocation(protectedRoute.location),
        `${path} redirected somewhere other than the canonical login entry point`,
        { location: protectedRoute.location },
      );
      checks.push({ name, status: "pass" });
      continue;
    }

    if (hasNestSignInGate(protectedRoute.text)) {
      checks.push({ name, status: "pass" });
      continue;
    }

    const isExpectedLocalOwnerOverrideSurface =
      isLocalBaseUrl()
      && (
        (path === "/admin/users" && hasOwnerOverrideAdminConsole(protectedRoute.text))
        || (path === "/account/switch" && hasOwnerOverrideAccountSwitcher(protectedRoute.text))
      );
    assert(
      isExpectedLocalOwnerOverrideSurface,
      `${path} exposed an app surface to signed-out traffic instead of the Nest sign-in gate`,
    );
    checks.push({ name, status: "local-owner-override" });
  }

  const session = await request("/api/auth/session");
  const sessionJson = parseJson("/api/auth/session", session.text);
  assert(session.status === 401, "/api/auth/session should return clean unauthenticated 401", {
    status: session.status,
  });
  assert(sessionJson?.authenticated === false, "/api/auth/session should report authenticated=false");
  checks.push({ name: "unauthenticatedSession", status: "pass" });

  const legacySignin = await request("/api/auth/signin");
  assert(legacySignin.status === 303, "Legacy /api/auth/signin should quarantine-redirect to /login", {
    status: legacySignin.status,
    location: legacySignin.location,
  });
  assert(
    expectedLoginLocation(legacySignin.location),
    "Legacy /api/auth/signin redirected somewhere other than /login?callbackUrl=/projects",
    { location: legacySignin.location },
  );
  checks.push({ name: "legacySigninQuarantine", status: "pass" });

  const legacyCallback = await request("/api/auth/callback/google");
  assert(legacyCallback.status === 303, "Legacy /api/auth/callback/google should quarantine-redirect to /login", {
    status: legacyCallback.status,
    location: legacyCallback.location,
  });
  assert(
    expectedLoginLocation(legacyCallback.location),
    "Legacy /api/auth/callback/google redirected somewhere other than /login?callbackUrl=/projects",
    { location: legacyCallback.location },
  );
  checks.push({ name: "legacyGoogleCallbackQuarantine", status: "pass" });

  const firebaseClientConfig = await request("/api/mac/firebase-client-config");
  const firebaseClientConfigJson = parseJson(
    "/api/mac/firebase-client-config",
    firebaseClientConfig.text,
  );
  assert(firebaseClientConfig.status === 200, "/api/mac/firebase-client-config should return public config", {
    status: firebaseClientConfig.status,
  });
  assert(firebaseClientConfigJson?.ok === true, "/api/mac/firebase-client-config should report ok=true");
  assert(
    firebaseClientConfigJson?.firebase?.authDomain,
    "/api/mac/firebase-client-config should include public Firebase authDomain",
  );
  checks.push({ name: "publicFirebaseClientConfig", status: "pass" });

  const firebaseAdminPreflight = await request("/api/auth/firebase-admin-preflight");
  const firebaseAdminPreflightJson = parseJson(
    "/api/auth/firebase-admin-preflight",
    firebaseAdminPreflight.text,
  );
  assert(
    firebaseAdminPreflight.status === 200 || firebaseAdminPreflight.status === 503,
    "/api/auth/firebase-admin-preflight should return structured public-safe preflight status",
    { status: firebaseAdminPreflight.status },
  );
  if (firebaseAdminPreflight.status === 200) {
    assert(
      firebaseAdminPreflightJson?.ok === true,
      "/api/auth/firebase-admin-preflight 200 should report ok=true",
    );
  }
  if (firebaseAdminPreflight.status === 503) {
    assert(
      firebaseAdminPreflightJson?.error === "Firebase Admin credential unavailable",
      "/api/auth/firebase-admin-preflight 503 should report sanitized credential error",
    );
  }
  checks.push({
    name: "firebaseAdminPreflight",
    status: firebaseAdminPreflight.status === 200 ? "pass" : "blocked-by-server-credentials",
  });

  const nativeSession = await request("/api/mac/session-check");
  const nativeSessionJson = parseJson("/api/mac/session-check", nativeSession.text);
  assert(nativeSession.status === 401, "/api/mac/session-check should return clean unauthenticated 401", {
    status: nativeSession.status,
  });
  assert(nativeSessionJson?.authenticated === false, "/api/mac/session-check should report authenticated=false");
  checks.push({ name: "unauthenticatedNativeSession", status: "pass" });

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    checks,
    note: "No credentials, cookies, Firebase tokens, or secrets were required for this public auth boundary smoke.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    baseUrl,
    checks,
    error: error?.message || String(error),
    details: error?.details || undefined,
  }, null, 2));
  process.exit(1);
}
