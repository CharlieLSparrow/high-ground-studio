#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const IDENTITIES = [
  {
    role: "coach",
    email: "quipsly-coach-retained-20260731@example.test",
    viewport: { width: 1440, height: 1000 },
  },
  {
    role: "client",
    email: "quipsly-client-retained-20260731@example.test",
    viewport: { width: 390, height: 844 },
  },
  {
    role: "outsider",
    email: "quipsly-followup-outsider-retained-20260731@example.test",
    viewport: { width: 390, height: 844 },
  },
];
const EXPECTED_CONTENT = [
  "Practice evidence",
  "Run one protected rehearsal",
  "Use a sustainable boundary",
];
const FORBIDDEN_MARKERS = [
  "RETAINED PRIVATE MARKER",
  "RETAINED SHARED MARKER",
  "RETAINED UNREVIEWED MARKER",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    "QUIPSLY_RETAINED_COACHING_BASE_URL must be a credential-free loopback HTTP origin.",
  );
  return url.origin;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright is required for the retained rendered-browser smoke. Install the workspace dependencies and Chromium before retrying.",
    );
  }
}

async function assertNoHorizontalOverflow(locator, role) {
  const fits = await locator.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  assert(fits, `${role} follow-up overflowed its rendered viewport.`);
}

async function signInThroughRenderedLogin(page, baseURL, identity, password) {
  const callbackPath = `/sessions/${ROOM_ID}`;
  const authEvents = [];
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes("identitytoolkit") || url.pathname === "/api/auth/session") {
      authEvents.push({ host: url.host, path: url.pathname, status: response.status() });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("identitytoolkit") || url.pathname === "/api/auth/session") {
      authEvents.push({ host: url.host, path: url.pathname, failed: true });
    }
  });
  await page.goto(
    `${baseURL}/login?callbackUrl=${encodeURIComponent(callbackPath)}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForLoadState("load");
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  const submit = page.getByRole("button", { name: "Sign in with email" });
  await submit.waitFor({ timeout: 20_000 });
  assert(await submit.isEnabled(), `${identity.role} secure sign-in handler never became ready.`);
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(password);
  await submit.click();
  try {
    await page.waitForURL((url) => url.pathname === callbackPath, { timeout: 20_000 });
  } catch {
    const status = await page.getByTestId("quipsly-login-status").innerText().catch(() => "No login status was rendered.");
    throw new Error(
      `${identity.role} rendered login did not navigate. ${status} Auth events: ${JSON.stringify(authEvents)} Browser errors: ${JSON.stringify(clientErrors)}`,
    );
  }
  assert(
    page.url().startsWith(`${baseURL}${callbackPath}`),
    `${identity.role} did not reach the retained Session after rendered login.`,
  );
  const outputsLink = page.getByRole("link", { name: "Outputs", exact: true });
  await outputsLink.waitFor({ timeout: 20_000 });
  await outputsLink.click();
  await page.waitForURL(
    (url) => url.pathname === callbackPath && url.searchParams.get("mode") === "outputs",
    { timeout: 20_000 },
  );
}

async function verifyCoachOrClient(page, identity) {
  const heading = page.getByRole("heading", { name: "Client follow-up", exact: true });
  await heading.waitFor({ timeout: 20_000 });
  const surface = heading.locator("xpath=ancestor::section[1]");
  await surface.getByText(identity.role === "coach" ? "Assigned coach" : "Intended client", { exact: true }).waitFor();

  const surfaceText = await surface.innerText();
  const normalizedSurfaceText = surfaceText.toLowerCase();
  for (const expected of EXPECTED_CONTENT) {
    assert(surfaceText.includes(expected), `${identity.role} rendered follow-up lost ${expected}.`);
  }
  for (const marker of FORBIDDEN_MARKERS) {
    assert(!surfaceText.includes(marker), `${identity.role} rendered follow-up disclosed ${marker}.`);
  }

  if (identity.role === "coach") {
    assert(normalizedSurfaceText.includes("client-safe notes"), "Coach lost the deliberate note-selection surface.");
    assert(normalizedSurfaceText.includes("client-owned goals"), "Coach lost the canonical goal-selection surface.");
    assert(normalizedSurfaceText.includes("client-owned commitments"), "Coach lost the canonical task-selection surface.");
  } else {
    assert(normalizedSurfaceText.includes("released in quipsly"), "Client did not receive the released in-app snapshot.");
    const openButton = surface.getByRole("button", { name: /Confirm follow-up opened|Open confirmed/ });
    await openButton.waitFor();
    assert(await openButton.isDisabled(), "Previously confirmed client receipt unexpectedly became actionable again.");
  }

  await assertNoHorizontalOverflow(surface, identity.role);
  return {
    role: identity.role,
    renderedLogin: "passed",
    followUpProjection: identity.role === "coach" ? "coach" : "released-client",
    responsiveViewport: `${identity.viewport.width}x${identity.viewport.height}`,
    horizontalOverflow: false,
  };
}

async function verifyOutsider(page, identity) {
  const heading = page.getByRole("heading", { name: "Client follow-up unavailable", exact: true });
  await heading.waitFor({ timeout: 20_000 });
  const surface = heading.locator("xpath=ancestor::section[1]");
  const surfaceText = await surface.innerText();
  assert(
    surfaceText.includes("does not have an available coaching follow-up")
      || surfaceText.includes("not the assigned coach or intended client"),
    "Outsider follow-up denial no longer explains the relationship boundary.",
  );
  for (const expected of EXPECTED_CONTENT) {
    assert(!surfaceText.includes(expected), `Outsider follow-up disclosed ${expected}.`);
  }
  for (const marker of FORBIDDEN_MARKERS) {
    assert(!surfaceText.includes(marker), `Outsider follow-up disclosed ${marker}.`);
  }
  await assertNoHorizontalOverflow(surface, identity.role);
  return {
    role: identity.role,
    renderedLogin: "passed",
    followUpProjection: "concealed",
    responsiveViewport: `${identity.viewport.width}x${identity.viewport.height}`,
    horizontalOverflow: false,
  };
}

async function clearRenderedSession(page, baseURL, identity) {
  const cleared = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/api/auth/session`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    return { status: response.status, success: body?.success === true };
  }, baseURL);
  assert(
    cleared.status === 200 && cleared.success,
    `${identity.role} rendered Nest session did not clear cleanly.`,
  );
}

async function verifyIdentity(browser, baseURL, identity) {
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: identity.email,
  });
  assert(password, `${identity.role} has no retained Keychain password.`);

  const context = await browser.newContext({
    viewport: identity.viewport,
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin(page, baseURL, identity, password);
    let result;
    try {
      result = identity.role === "outsider"
        ? await verifyOutsider(page, identity)
        : await verifyCoachOrClient(page, identity);
    } catch (error) {
      const headings = await page.getByRole("heading").allInnerTexts().catch(() => []);
      throw new Error(
        `${identity.role} rendered Session verification failed. Headings: ${JSON.stringify(headings.slice(0, 20))}`,
        { cause: error },
      );
    }
    assert(pageErrors.length === 0, `${identity.role} rendered journey raised a browser exception.`);
    await clearRenderedSession(page, baseURL, identity);
    return { ...result, sessionClear: "passed", browserExceptions: 0 };
  } finally {
    await context.close();
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
  );
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const identities = [];
    for (const identity of IDENTITIES) {
      identities.push(await verifyIdentity(browser, baseURL, identity));
    }
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: false,
      secretsPrinted: false,
      externalSideEffects: false,
      identities,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

await main();
