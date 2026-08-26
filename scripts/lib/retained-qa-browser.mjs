function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:" &&
      loopbackHost(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

export async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright and Chromium are required for rendered retained-QA operation.",
    );
  }
}

export async function assertNoHorizontalOverflow(locator, role) {
  let measurement = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await locator.waitFor({ state: "visible" });
      measurement = await locator.evaluate((element) => {
        const root = element;
        const rootRect = root.getBoundingClientRect();
        const overflow = [...root.querySelectorAll("*")]
          .map((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return {
              tag: candidate.tagName.toLowerCase(),
              className:
                typeof candidate.className === "string"
                  ? candidate.className.slice(0, 180)
                  : "",
              text: (candidate.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          })
          .filter(
            (candidate) =>
              candidate.right > Math.ceil(rootRect.right) + 1 ||
              candidate.left < Math.floor(rootRect.left) - 1,
          )
          .sort((left, right) => right.right - left.right)
          .slice(0, 5);
        return {
          fits: root.scrollWidth <= root.clientWidth + 1,
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          overflow,
        };
      });
      break;
    } catch (error) {
      if (
        attempt > 0 ||
        !String(error?.message || "").includes(
          "Execution context was destroyed",
        )
      ) {
        throw error;
      }
    }
  }
  assert(
    measurement?.fits,
    `${role} surface overflowed its rendered viewport: ${JSON.stringify(measurement)}.`,
  );
}

export async function signInThroughRenderedLogin({
  page,
  baseURL,
  identity,
  password,
  callbackPath,
}) {
  const callbackURL = new URL(callbackPath, baseURL);
  assert(
    callbackURL.origin === baseURL && callbackPath.startsWith("/"),
    "Retained rendered login requires a same-origin callback path.",
  );
  const authEvents = [];
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.includes("identitytoolkit") ||
      url.pathname === "/api/auth/session"
    ) {
      authEvents.push({
        host: url.host,
        path: url.pathname,
        status: response.status(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.includes("identitytoolkit") ||
      url.pathname === "/api/auth/session"
    ) {
      authEvents.push({ host: url.host, path: url.pathname, failed: true });
    }
  });

  await page.goto(
    `${baseURL}/login?callbackUrl=${encodeURIComponent(callbackPath)}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForLoadState("load");
  // The ordinary login heading is intentionally contextual (for example,
  // "Continue to coaching"). Regression operation must locate the real form,
  // not require a fixture-only heading from the generic login journey.
  await page.getByLabel("Email").waitFor();
  const submit = page.getByRole("button", { name: "Sign in with email" });
  await submit.waitFor({ timeout: 20_000 });
  assert(
    await submit.isEnabled(),
    `${identity.role} secure sign-in handler never became ready.`,
  );
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(password);
  await submit.click();
  try {
    await page.waitForURL(
      (url) =>
        url.pathname === callbackURL.pathname &&
        url.search === callbackURL.search,
      { timeout: 20_000 },
    );
  } catch {
    const status = await page
      .getByTestId("quipsly-login-status")
      .innerText()
      .catch(() => "No login status was rendered.");
    throw new Error(
      `${identity.role} rendered login did not navigate. ${status} Auth events: ${JSON.stringify(authEvents)} Browser errors: ${JSON.stringify(clientErrors)}`,
    );
  }
}

export async function clearRenderedSession(page, baseURL, role) {
  const cleared = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/api/auth/session`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, success: body?.success === true };
  }, baseURL);
  assert(
    cleared.status === 200 && cleared.success,
    `${role} rendered Nest session did not clear cleanly.`,
  );
}
