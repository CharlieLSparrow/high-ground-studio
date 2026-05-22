import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { chromium } from "@playwright/test";

const reportPath = path.resolve(
  "artifacts/agentic-browser-smoke/hgo-projection-visual-smoke-report.json",
);
const screenshotDir = path.resolve(
  "artifacts/playwright/hgo-projection-visual-smoke",
);
const syntheticFixturePath = path.resolve(
  "apps/web/src/lib/hgo/synthetic-episode-projection.ts",
);
const syntheticProjection = {
  id: "agentic-hgo-visual-projection",
  status: "staged",
  visibility: "staged",
  slug: "agentic-hgo-visual-projection",
  episodeNumber: "SYN-VIS-001",
  title: "The Synthetic Signal Review",
  subtitle:
    "A fake HGO projection used only for no-auth visual smoke artifacts.",
  summary:
    "A synthetic crew checks whether visual projection pages can be reviewed later without touching Studio auth or server state.",
  thesis:
    "A projection is not the source. This synthetic visual pass captures the HGO import and renderer path without using real manuscript material.",
  lifecycleNote:
    "Synthetic staged review fixture. Not a live page, not canonical content, and not public HGO truth.",
  hero: {
    eyebrow: "No-Auth Visual Smoke",
    visualPrompt:
      "A small signal lamp on a workbench beside fake index cards and a browser preview window.",
    colorMood: "signal green, ember, paper, charcoal",
  },
  audio: {
    state: "not-recorded",
    placeholderLabel: "Synthetic audio placeholder",
    durationLabel: "Visual smoke fixture",
  },
  scopes: ["episode-only", "internal"],
  beats: [
    {
      title: "Open the preview map",
      summary:
        "The synthetic visual pass starts with HGO projection preview surfaces instead of Studio.",
      scope: "internal",
      timingHint: "00:00-02:00",
    },
    {
      title: "Warnings stay visible",
      summary:
        "Staged status and unresolved citation state should remain visible before any public use.",
      scope: "episode-only",
      timingHint: "02:00-05:00",
    },
  ],
  voiceCards: [
    {
      speaker: "Charlie",
      summary:
        "Synthetic operator note checks that projection text can render without private source data.",
    },
    {
      speaker: "Homer",
      summary:
        "Synthetic voice card keeps the page shape close to the real renderer contract.",
    },
  ],
  pullQuotes: [
    {
      text: "The fake signal is useful because everyone knows it is fake.",
      attribution: "Synthetic visual smoke",
      citationState: "needs-review",
    },
    {
      text: "A staged projection should warn before it shines.",
      attribution: "Synthetic HGO fixture",
      citationState: "needs-source",
    },
  ],
  sourceNotes: [
    {
      label: "Synthetic Visual Smoke Note",
      detail:
        "Fake source note used to test no-auth HGO projection import warnings.",
      status: "needs-review",
    },
  ],
  relatedBookChapter: {
    title: "Synthetic Chapter: Projection Safety",
    summary:
      "Placeholder relation proving the renderer can show a book connection without real content.",
    status: "staged",
  },
  backstageNotes: [
    {
      label: "Harness boundary",
      note: "Generated inside a no-auth visual smoke. No Studio auth, server write, or public publish action is involved.",
    },
  ],
  projectionSource: {
    bridgeVersion: "studio-browser-v1",
    generatedAt: "2026-05-22T12:30:00.000Z",
    sourceFileName: "synthetic-hgo-visual-smoke.json",
  },
};
const suppliedHgoBaseUrl = process.env.HGO_BASE_URL?.replace(/\/$/, "") || "";
const headless = process.env.AGENTIC_BROWSER_HEADLESS !== "false";
const startedAt = new Date().toISOString();
const steps = [];
const routes = [];
const errors = [];
const warnings = [];
const screenshots = [];
const knownRealContentMarkers = [
  "learning-to-lead.living",
  "apps/web/content",
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
  "apps/web/content/publish",
  "ManuscriptBlock",
  "StoryDraft",
  "real-manuscript-draft.docx",
];

function getCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function addStep(name, status, details = {}) {
  steps.push({
    name,
    status,
    details,
    completedAt: new Date().toISOString(),
  });
}

function relativePath(absolutePath) {
  return path.relative(process.cwd(), absolutePath);
}

async function writeReport(status, extra = {}) {
  const finishedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt,
    status,
    environment: suppliedHgoBaseUrl ? "provided-browser" : "local-web-dev",
    routes,
    steps,
    errors,
    warnings,
    screenshots,
    commitSha: getCommitSha(),
    hgoBaseUrl: extra.hgoBaseUrl ?? suppliedHgoBaseUrl ?? null,
    confirms: {
      syntheticDataOnly: status === "passed" || status === "blocked",
      noRealContent: status === "passed" || status === "blocked",
      noServerWrites: true,
      noPublishAction: true,
      noOAuthAutomation: true,
      noAutosave: true,
      noYjsOrCollaboration: true,
    },
    ...extra,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function block(reason, nextStep, details = {}) {
  addStep(reason, "blocked", details);
  warnings.push(nextStep);
  const report = await writeReport("blocked", {
    blockedReason: reason,
    nextStep,
    ...details,
  });

  console.log(
    JSON.stringify(
      {
        status: report.status,
        reportPath,
        blockedReason: reason,
        nextStep,
      },
      null,
      2,
    ),
  );
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available localhost port found from ${startPort} to ${startPort + 49}.`,
  );
}

async function waitForRoute(baseUrl, routePath, timeoutMs = 45_000) {
  const started = Date.now();
  const url = `${baseUrl}${routePath}`;
  let lastError = "";

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (response.ok) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

async function startLocalWebServer() {
  const port = await findAvailablePort(3001);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(
    "pnpm",
    ["--filter", "web", "exec", "next", "dev", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs = [];

  const collectLog = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join("").length > 6000) {
      logs.splice(0, Math.max(1, logs.length - 12));
    }
  };

  server.stdout.on("data", collectLog);
  server.stderr.on("data", collectLog);

  try {
    await waitForRoute(baseUrl, "/projection-preview/import");
  } catch (error) {
    server.kill("SIGTERM");
    throw new Error(
      `Local HGO web dev server did not become ready. ${
        error instanceof Error ? error.message : String(error)
      }\nRecent output:\n${logs.join("").trim()}`,
    );
  }

  addStep("start local HGO web dev server", "passed", {
    baseUrl,
    port,
  });

  return {
    baseUrl,
    stop: async () => {
      if (server.exitCode !== null || server.signalCode) {
        return;
      }

      server.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2500);
        server.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
  };
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("Executable doesn't exist") ||
      message.includes("playwright install")
    ) {
      await block(
        "PLAYWRIGHT_BROWSER_MISSING",
        "Install Chromium with: pnpm exec playwright install chromium",
        { error: message },
      );
      return null;
    }

    throw error;
  }
}

async function discoverSyntheticSlugs() {
  const source = await readFile(syntheticFixturePath, "utf8");
  const slugs = [...source.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  const uniqueSlugs = [...new Set(slugs)];
  const sortedSlugs = [
    "synthetic-episode",
    ...uniqueSlugs.filter((slug) => slug !== "synthetic-episode"),
  ];
  const selectedSlugs = sortedSlugs.slice(0, 4);

  if (!selectedSlugs.length) {
    throw new Error(`No synthetic projection slugs found in ${syntheticFixturePath}.`);
  }

  addStep("discover synthetic projection slugs", "passed", {
    slugs: selectedSlugs,
  });

  return selectedSlugs;
}

function createSyntheticProjectionJson() {
  return JSON.stringify(syntheticProjection, null, 2);
}

async function assertNoRealContentMarkers(page, projectionJson = "") {
  const pageText = await page.locator("body").innerText();
  const combined = `${pageText}\n${projectionJson}`;
  const foundMarkers = knownRealContentMarkers.filter((marker) =>
    combined.includes(marker),
  );

  if (foundMarkers.length) {
    throw new Error(
      `Known real-content markers appeared in HGO visual smoke output: ${foundMarkers.join(", ")}`,
    );
  }
}

async function getHeading(page) {
  try {
    return await page.locator("h1").first().innerText({ timeout: 2500 });
  } catch {
    return "";
  }
}

async function captureRoute(page, routeInfo, projectionJson = "") {
  const { baseUrl, routePath, screenshotName, waitFor, notes = [] } = routeInfo;
  const screenshotPath = path.join(screenshotDir, screenshotName);

  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded" });

  if (waitFor?.testId) {
    await page.getByTestId(waitFor.testId).waitFor({
      state: "visible",
      timeout: waitFor.timeout ?? 20_000,
    });
  } else if (waitFor?.text) {
    await page.getByText(waitFor.text, { exact: false }).first().waitFor({
      state: "visible",
      timeout: waitFor.timeout ?? 20_000,
    });
  } else {
    await page.locator("body").waitFor({ state: "visible", timeout: 20_000 });
  }

  await assertNoRealContentMarkers(page, projectionJson);
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  screenshots.push(relativePath(screenshotPath));

  const route = {
    path: routePath,
    status: "passed",
    screenshot: relativePath(screenshotPath),
    title: await page.title(),
    heading: await getHeading(page),
    notes,
  };
  routes.push(route);
  addStep(`capture ${routePath}`, "passed", {
    screenshot: route.screenshot,
    heading: route.heading,
  });

  return route;
}

async function runVisualSmoke() {
  let webServer = null;
  let browser = null;
  let context = null;
  let page = null;
  let hgoBaseUrl = suppliedHgoBaseUrl;

  try {
    browser = await launchChromium();

    if (!browser) {
      return;
    }

    if (hgoBaseUrl) {
      await waitForRoute(hgoBaseUrl, "/projection-preview/import", 15_000);
      addStep("use provided HGO base URL", "passed", { hgoBaseUrl });
    } else {
      webServer = await startLocalWebServer();
      hgoBaseUrl = webServer.baseUrl;
    }

    const syntheticSlugs = await discoverSyntheticSlugs();
    const projectionJson = createSyntheticProjectionJson();
    addStep("create synthetic HGO projection JSON", "passed", {
      id: syntheticProjection.id,
      status: syntheticProjection.status,
      visibility: syntheticProjection.visibility,
      bytes: projectionJson.length,
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    page = await context.newPage();

    await captureRoute(page, {
      baseUrl: hgoBaseUrl,
      routePath: "/projection-preview",
      screenshotName: "projection-preview-map.png",
      waitFor: { text: "Book and episode work" },
      notes: ["synthetic projection map"],
    });

    await captureRoute(page, {
      baseUrl: hgoBaseUrl,
      routePath: "/projection-preview/import",
      screenshotName: "projection-preview-import-empty.png",
      waitFor: { testId: "hgo-import-projection-json" },
      notes: ["empty browser-only import form"],
    });

    await page.getByTestId("hgo-import-projection-json").fill(projectionJson);
    await page
      .getByTestId("hgo-import-warning-heading")
      .waitFor({ state: "visible", timeout: 15_000 });
    await page
      .getByTestId("hgo-projection-rendered-root")
      .waitFor({ state: "visible", timeout: 20_000 });
    await assertNoRealContentMarkers(page, projectionJson);

    const renderedScreenshotPath = path.join(
      screenshotDir,
      "projection-preview-import-rendered.png",
    );
    await page.screenshot({ path: renderedScreenshotPath, fullPage: true });
    screenshots.push(relativePath(renderedScreenshotPath));
    routes.push({
      path: "/projection-preview/import",
      status: "passed",
      screenshot: relativePath(renderedScreenshotPath),
      title: await page.title(),
      heading: await getHeading(page),
      notes: ["synthetic projection JSON pasted and rendered"],
    });
    addStep("capture rendered import projection", "passed", {
      screenshot: relativePath(renderedScreenshotPath),
    });

    for (const slug of syntheticSlugs) {
      await captureRoute(page, {
        baseUrl: hgoBaseUrl,
        routePath: `/projection-preview/${slug}`,
        screenshotName: `projection-detail-${slug.replace(/[^a-z0-9-]/gi, "-")}.png`,
        waitFor: { testId: "hgo-projection-rendered-root" },
        notes: ["synthetic projection detail page"],
      });
    }

    const report = await writeReport("passed", {
      hgoBaseUrl,
      syntheticSlugs,
      screenshotDirectory: relativePath(screenshotDir),
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          screenshotDirectory: relativePath(screenshotDir),
          routes: routes.length,
          screenshots: screenshots.length,
          hgoBaseUrl,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);

    if (/Timed out waiting|ECONNREFUSED|fetch failed/i.test(message)) {
      warnings.push(
        "HGO projection routes were not reachable. Start web locally with: pnpm --filter web dev -- -p 3001, or provide HGO_BASE_URL.",
      );
    }

    const report = await writeReport("failed", {
      hgoBaseUrl: hgoBaseUrl || null,
      screenshotDirectory: relativePath(screenshotDir),
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          errors,
          screenshots,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    if (context) {
      await context.close();
    }

    if (browser) {
      await browser.close();
    }

    if (webServer) {
      await webServer.stop();
    }
  }
}

await runVisualSmoke();
