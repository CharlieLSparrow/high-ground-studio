#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function requiredEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing ${name}. Provide it as an environment variable.`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

function renderedResponseIncludesHref(text, href) {
  return [
    href,
    href.replaceAll("&", "&amp;"),
    href.replaceAll("&", "\\u0026"),
  ].some((candidate) => text.includes(candidate));
}

async function canReachQuipsly(candidate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const requireNativeSessionCheck = process.env.QUIPSLY_AUTH_SMOKE_SKIP_NATIVE_SESSION_CHECK !== "1";
    const health = await fetch(`${candidate}/api/health`, {
      signal: controller.signal,
    });
    if (!health.ok) return false;

    const login = await fetch(`${candidate}/login?callbackUrl=%2Fprojects`, {
      signal: controller.signal,
    });
    if (!login.ok) return false;

    const projects = await fetch(`${candidate}/projects`, {
      redirect: "manual",
      signal: controller.signal,
    });
    if (projects.status === 404) return false;

    if (requireNativeSessionCheck) {
      const nativeSessionCheck = await fetch(`${candidate}/api/mac/session-check`, {
        redirect: "manual",
        signal: controller.signal,
      });
      if (nativeSessionCheck.status === 404) return false;
    }

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverBaseUrl() {
  if (process.env.QUIPSLY_AUTH_SMOKE_BASE_URL) {
    return process.env.QUIPSLY_AUTH_SMOKE_BASE_URL.replace(/\/$/, "");
  }

  const candidates = [
    "http://localhost:3025",
    "http://127.0.0.1:3025",
    "http://localhost:3012",
    "http://127.0.0.1:3012",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  for (const candidate of candidates) {
    if (await canReachQuipsly(candidate)) return candidate;
  }

  return "http://localhost:3025";
}

function parseSessionCookie(setCookie) {
  return (setCookie || "")
    .split(",")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith("session="))
    ?.split(";")[0];
}

function responseClearsSessionCookie(setCookie) {
  return (setCookie || "")
    .split(",")
    .map((chunk) => chunk.trim())
    .some((chunk) => (
      /^session=;/i.test(chunk)
      || /^session=deleted;/i.test(chunk)
      || /^session=;.*max-age=0/i.test(chunk)
      || /^session=;.*expires=/i.test(chunk)
    ));
}

const localEnv = readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local"));
const baseUrl = await discoverBaseUrl();
const email = requiredEnv("QUIPSLY_AUTH_SMOKE_EMAIL");
const password = requiredEnv("QUIPSLY_AUTH_SMOKE_PASSWORD");
const expectAdmin = process.env.QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN !== "0";
const expectedProjectSlug = (process.env.QUIPSLY_AUTH_SMOKE_EXPECT_PROJECT_SLUG || "").trim();
const expectedInviteRole = (process.env.QUIPSLY_AUTH_SMOKE_EXPECT_INVITE_ROLE || "").trim().toUpperCase();
const inviteTokenFile = (process.env.QUIPSLY_AUTH_SMOKE_INVITE_TOKEN_FILE || "").trim();
const inviteToken = (process.env.QUIPSLY_AUTH_SMOKE_INVITE_TOKEN || "")
  || (inviteTokenFile && fs.existsSync(inviteTokenFile)
    ? fs.readFileSync(inviteTokenFile, "utf8").trim()
    : "");
const skipNativeSessionCheck = process.env.QUIPSLY_AUTH_SMOKE_SKIP_NATIVE_SESSION_CHECK === "1";
const requireSessionWorkspaceCheck =
  process.env.QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE === "1";
const firebaseApiKey = requiredEnv(
  "QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY",
  localEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
);

function identityToolkitBaseUrl() {
  const emulatorValue =
    process.env.QUIPSLY_AUTH_SMOKE_FIREBASE_EMULATOR_URL
    || process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL
    || localEnv.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL;
  if (!emulatorValue) return "https://identitytoolkit.googleapis.com";

  const emulatorUrl = new URL(emulatorValue);
  const isLoopback = emulatorUrl.hostname === "localhost" || emulatorUrl.hostname === "127.0.0.1";
  assert(
    emulatorUrl.protocol === "http:"
      && isLoopback
      && !emulatorUrl.username
      && !emulatorUrl.password
      && emulatorUrl.pathname === "/"
      && !emulatorUrl.search
      && !emulatorUrl.hash,
    "Firebase Auth emulator URL must be a credential-free loopback HTTP origin.",
  );
  return `${emulatorUrl.origin}/identitytoolkit.googleapis.com`;
}

const firebaseIdentityToolkitBaseUrl = identityToolkitBaseUrl();

const routeChecks = [
  ["/api/auth/session", 200, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")],
  ["/projects", 200, /Home Nest|My Nests|Create a Nest/i],
  ["/nests", 200, /Home Nest|My Nests|Create a Nest|Nest/i],
  ["/account/switch", 200, /Switch account|Account/i],
];

if (expectAdmin) {
  routeChecks.push(["/admin/users", 200, /Firebase password|User \+ Invite|User record/i]);
}

try {
  const firebaseResponse = await fetch(
    `${firebaseIdentityToolkitBaseUrl}/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const firebaseBody = await firebaseResponse.json();
  assert(
    firebaseResponse.ok && firebaseBody.idToken,
    `Firebase login failed with HTTP ${firebaseResponse.status}`,
  );

  const sessionStart = await requestText(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idToken: firebaseBody.idToken,
      inviteToken: inviteToken || undefined,
    }),
  });
  assert(
    sessionStart.response.status === 200,
    `Session create failed with HTTP ${sessionStart.response.status}: ${sessionStart.text.slice(0, 240)}`,
  );

  const cookie = parseSessionCookie(sessionStart.response.headers.get("set-cookie"));
  assert(cookie, "Session cookie was not set.");

  const sessionBody = JSON.parse(sessionStart.text);
  assert(sessionBody.user?.email === email, "Session user email mismatch.");
  assert(sessionBody.homeNest?.slug, "Home Nest missing from session response.");
  assert(
    sessionBody.onboarding?.freePlanSlug === "quipsly-free",
    "Free-tier onboarding receipt missing from session response.",
  );
  assert(
    sessionBody.onboarding?.freeMembershipStatus === "ACTIVE",
    "Free-tier onboarding did not report ACTIVE membership.",
  );
  assert(
    sessionBody.onboarding?.homeNestSlug === sessionBody.homeNest.slug,
    "Onboarding Home Nest slug does not match session Home Nest.",
  );
  if (inviteToken) {
    assert(sessionBody.acceptedInvite, "Invite token was supplied but no acceptedInvite was returned.");
    if (expectedProjectSlug) {
      assert(
        sessionBody.acceptedInvite.projectSlug === expectedProjectSlug,
        `acceptedInvite project mismatch: ${sessionBody.acceptedInvite.projectSlug}`,
      );
    }
    if (expectedInviteRole) {
      assert(
        sessionBody.acceptedInvite.role === expectedInviteRole,
        `acceptedInvite role mismatch: ${sessionBody.acceptedInvite.role}`,
      );
    }
  }

  let nativeSessionBody = null;
  if (!skipNativeSessionCheck) {
    const nativeSessionCheck = await requestText(`${baseUrl}/api/mac/session-check`, {
      headers: { authorization: `Bearer ${firebaseBody.idToken}` },
    });
    assert(
      nativeSessionCheck.response.status === 200,
      `/api/mac/session-check returned HTTP ${nativeSessionCheck.response.status}: ${nativeSessionCheck.text.slice(0, 240)}`,
    );
    nativeSessionBody = JSON.parse(nativeSessionCheck.text);
    assert(nativeSessionBody.user?.email === email, "Native session-check user email mismatch.");
    assert(nativeSessionBody.homeNest?.slug, "Native session-check Home Nest missing.");
    assert(
      nativeSessionBody.onboarding?.freePlanSlug === "quipsly-free",
      "Native session-check free-tier onboarding receipt missing.",
    );
    assert(
      nativeSessionBody.onboarding?.freeMembershipStatus === "ACTIVE",
      "Native session-check free-tier onboarding did not report ACTIVE membership.",
    );
    assert(
      nativeSessionBody.onboarding?.homeNestSlug === nativeSessionBody.homeNest.slug,
      "Native session-check onboarding Home Nest slug does not match Home Nest.",
    );
  }

  const homeNestPath = `/nests/${encodeURIComponent(sessionBody.homeNest.slug)}`;
  const createPath = `/create?project=${encodeURIComponent(sessionBody.homeNest.slug)}`;
  const editorPath = `/editor?project=${encodeURIComponent(sessionBody.homeNest.slug)}&episode=release-smoke`;
  const recorderPath = `/recorder?project=${encodeURIComponent(sessionBody.homeNest.slug)}&episode=release-smoke`;
  const episodeRoomPath = `/nests/${encodeURIComponent(sessionBody.homeNest.slug)}/episodes/release-smoke`;
  const episodeRecordPath = `${episodeRoomPath}?mode=record#record`;
  const episodeEditPath = `${episodeRoomPath}?mode=edit`;
  const recorderAccess = await requestText(`${baseUrl}/api/episode-production`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "ensure",
      projectSlug: sessionBody.homeNest.slug,
      episodeSlug: "release-smoke",
      title: "Release smoke",
      boundaryLabel: "Release smoke",
      productionJson: {
        surface: "release-smoke",
        purpose: "authenticated-recorder-access-proof",
      },
    }),
  });
  assert(
    recorderAccess.response.status === 200,
    `/api/episode-production returned HTTP ${recorderAccess.response.status}: ${recorderAccess.text.slice(0, 240)}`,
  );
  const recorderAccessBody = JSON.parse(recorderAccess.text);
  assert(recorderAccessBody.ok === true, "Recorder access proof did not return ok:true.");
  assert(recorderAccessBody.mode === "database", "Recorder access proof was not persisted.");
  assert(
    recorderAccessBody.projectSlug === sessionBody.homeNest.slug,
    "Recorder access proof escaped the reviewer Home Nest.",
  );
  assert(recorderAccessBody.slug === "release-smoke", "Recorder access proof episode mismatch.");
  assert(recorderAccessBody.accessRole, "Recorder access proof did not return an access role.");
  const checkedRoutes = ["/api/episode-production:200:database"];
  let sessionWorkspacePath = null;
  if (requireSessionWorkspaceCheck) {
    const captureSessions = await requestText(`${baseUrl}/api/mobile/capture/sessions`, {
      headers: { cookie },
    });
    assert(
      captureSessions.response.status === 200,
      `/api/mobile/capture/sessions returned HTTP ${captureSessions.response.status}: ${captureSessions.text.slice(0, 240)}`,
    );
    const captureSessionsBody = JSON.parse(captureSessions.text);
    assert(captureSessionsBody.ok === true, "Capture Session listing did not return ok:true.");
    assert(Array.isArray(captureSessionsBody.sessions), "Capture Session listing did not return sessions.");
    checkedRoutes.push("/api/mobile/capture/sessions:200:database");

    let smokeSession = captureSessionsBody.sessions.find((candidate) => candidate?.id);
    if (!smokeSession) {
      const captureSessionCreate = await requestText(`${baseUrl}/api/mobile/capture/sessions`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectSlug: sessionBody.homeNest.slug,
          episodeSlug: "release-smoke",
          purpose: "PODCAST",
          title: "Release smoke capture session",
          provider: "planned",
          deviceLabel: "Quipsly release smoke",
        }),
      });
      assert(
        captureSessionCreate.response.status === 201,
        `Capture Session create returned HTTP ${captureSessionCreate.response.status}: ${captureSessionCreate.text.slice(0, 240)}`,
      );
      const captureSessionCreateBody = JSON.parse(captureSessionCreate.text);
      assert(captureSessionCreateBody.ok === true, "Capture Session create did not return ok:true.");
      assert(
        captureSessionCreateBody.boundaries?.recordingStarted === false
          && captureSessionCreateBody.boundaries?.providerJoined === false
          && captureSessionCreateBody.boundaries?.calendarMutated === false
          && captureSessionCreateBody.boundaries?.externalInviteSent === false,
        "Capture Session smoke crossed a recording, provider, calendar, or invitation boundary.",
      );
      smokeSession = captureSessionCreateBody.session;
      checkedRoutes.push("/api/mobile/capture/sessions:201:safe-session-created");
    }
    assert(smokeSession?.id, "Capture Session smoke could not resolve an accessible Session.");

    sessionWorkspacePath = `/sessions/${encodeURIComponent(smokeSession.id)}?mode=prepare`;
    const sessionWorkspace = await requestText(`${baseUrl}${sessionWorkspacePath}`, {
      headers: { cookie },
    });
    assert(
      sessionWorkspace.response.status === 200,
      `${sessionWorkspacePath} returned HTTP ${sessionWorkspace.response.status}`,
    );
    assert(
      /Session workspace/i.test(sessionWorkspace.text),
      `${sessionWorkspacePath} did not render the canonical Session workspace.`,
    );
    assert(
      !/Session review is unavailable/i.test(sessionWorkspace.text),
      `${sessionWorkspacePath} rendered the fail-closed unavailable state.`,
    );
    checkedRoutes.push(`${sessionWorkspacePath}:200:database`);
  }

  const allRouteChecks = routeChecks.concat([
    [homeNestPath, 200, /Nest|Home|Quipsly/i],
    [createPath, 200, /Writing Desk/i],
    [episodeRoomPath, 200, /Episode Room/i],
    [editorPath, 200, /Episode Editor/i],
    [recorderPath, 200, /Checking Nest access/i],
    ["/research", 200, /Evidence, with its receipts\./i],
    ["/publishing", 200, /Publishing runway|The Transmitter/i],
  ]);

  let projectsText = "";
  let episodeRoomText = "";
  for (const [route, expectedStatus, marker] of allRouteChecks) {
    const result = await requestText(`${baseUrl}${route}`, { headers: { cookie } });
    assert(result.response.status === expectedStatus, `${route} returned HTTP ${result.response.status}`);
    assert(marker.test(result.text), `${route} did not include expected page marker.`);
    if (route === "/projects") projectsText = result.text;
    if (route === episodeRoomPath) episodeRoomText = result.text;
    checkedRoutes.push(`${route}:${result.response.status}`);
  }

  assert(
    episodeRoomText.includes("Plan &amp; collaborate")
      && renderedResponseIncludesHref(episodeRoomText, episodeRoomPath),
    `${episodeRoomPath} did not render the canonical planning handoff.`,
  );
  assert(
    episodeRoomText.includes("Record")
      && renderedResponseIncludesHref(episodeRoomText, episodeRecordPath),
    `${episodeRoomPath} did not render the canonical recording handoff.`,
  );
  assert(
    episodeRoomText.includes("Edit")
      && renderedResponseIncludesHref(episodeRoomText, episodeEditPath),
    `${episodeRoomPath} did not render the canonical editing handoff.`,
  );
  checkedRoutes.push(`${episodeRoomPath}:canonical-workflow-handoffs-rendered`);

  if (expectedProjectSlug) {
    assert(
      projectsText.includes(expectedProjectSlug),
      `/projects did not include expected project slug ${expectedProjectSlug}.`,
    );
    if (!skipNativeSessionCheck) {
      assert(
        nativeSessionBody.projects?.some?.((project) => project.slug === expectedProjectSlug),
        `/api/mac/session-check did not include expected project slug ${expectedProjectSlug}.`,
      );
    }
  }

  const logout = await requestText(`${baseUrl}/api/auth/session`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert(logout.response.status === 200, `Logout returned HTTP ${logout.response.status}`);
  assert(
    responseClearsSessionCookie(logout.response.headers.get("set-cookie")),
    "Logout response did not send a session cookie clearing header.",
  );

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    firebaseLogin: "pass",
    sessionCookie: "pass",
    nativeSessionCheck: skipNativeSessionCheck ? "skipped" : "pass",
    user: email,
    expectAdmin,
    homeNest: sessionBody.homeNest.slug,
    freeTierOnboarding: sessionBody.onboarding.freeMembershipStatus,
    expectedProjectSlug: expectedProjectSlug || null,
    inviteAcceptance: inviteToken ? "pass" : "not-requested",
    sessionWorkspace: requireSessionWorkspaceCheck ? sessionWorkspacePath : "not-requested",
    checkedRoutes,
    logout: "pass",
    logoutClearsSessionCookie: "pass",
  }, null, 2));
} catch (error) {
  console.error(`QUIPSLY_AUTH_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
