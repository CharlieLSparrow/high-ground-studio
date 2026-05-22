import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { chromium } from "@playwright/test";

const reportPath = path.resolve(
  "artifacts/agentic-browser-smoke/hgo-projection-browser-smoke-report.json",
);
const syntheticProjection = {
  id: "agentic-hgo-no-auth-projection",
  status: "staged",
  visibility: "staged",
  slug: "agentic-hgo-no-auth-projection",
  episodeNumber: "SYN-BROWSER-001",
  title: "The Synthetic Signal Check",
  subtitle:
    "A fake HGO projection used only for no-auth browser import smoke testing.",
  summary:
    "A synthetic crew tests whether a projection draft can be pasted, warned, and rendered without touching Studio auth or server state.",
  thesis:
    "A projection is not the source. This synthetic page checks the HGO import and renderer path without using real manuscript material.",
  lifecycleNote:
    "Synthetic staged review fixture. Not a live page, not canonical content, and not public HGO truth.",
  hero: {
    eyebrow: "No-Auth Browser Smoke",
    visualPrompt:
      "A small signal lamp on a workbench beside fake index cards and a browser preview window.",
    colorMood: "signal green, ember, paper, charcoal",
  },
  audio: {
    state: "not-recorded",
    placeholderLabel: "Synthetic audio placeholder",
    durationLabel: "Browser smoke fixture",
  },
  scopes: ["episode-only", "internal"],
  beats: [
    {
      title: "Open the preview gate",
      summary:
        "The synthetic projection starts in the HGO import route instead of Studio.",
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
      attribution: "Synthetic browser smoke",
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
      label: "Synthetic Browser Smoke Note",
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
      note: "Generated inside a no-auth browser smoke. No Studio auth, server write, or public publish action is involved.",
    },
  ],
  projectionSource: {
    bridgeVersion: "studio-browser-v1",
    generatedAt: "2026-05-22T12:30:00.000Z",
    sourceFileName: "synthetic-hgo-browser-smoke.json",
  },
};
const suppliedHgoBaseUrl = process.env.HGO_BASE_URL?.replace(/\/$/, "") || "";
const headless = process.env.AGENTIC_BROWSER_HEADLESS !== "false";
const startedAt = new Date().toISOString();
const steps = [];
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

async function writeReport(status, extra = {}) {
  const finishedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt,
    status,
    environment: suppliedHgoBaseUrl ? "provided-browser" : "local-web-dev",
    steps,
    errors,
    warnings,
    screenshots,
    routesTested: ["/projection-preview/import"],
    commitSha: getCommitSha(),
    config: {
      hgoBaseUrl: extra.hgoBaseUrl ?? suppliedHgoBaseUrl ?? null,
      hgoBaseUrlProvided: Boolean(suppliedHgoBaseUrl),
      headless,
    },
    confirms: {
      syntheticDataOnly: status === "passed" || status === "blocked",
      noRealContent: status === "passed" || status === "blocked",
      noServerWrites: true,
      noPublishAction: true,
      noAutosave: true,
      noYjsOrCollaboration: true,
      noOAuthAutomation: true,
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

async function waitForImportRoute(baseUrl, timeoutMs = 45_000) {
  const started = Date.now();
  const url = `${baseUrl}/projection-preview/import`;
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
    await waitForImportRoute(baseUrl);
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

async function screenshotOnFailure(page, label) {
  const screenshotPath = path.resolve(
    "artifacts/playwright",
    `${label}-${Date.now()}.png`,
  );

  try {
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots.push(path.relative(process.cwd(), screenshotPath));
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Failure screenshot could not be written: ${error.message}`
        : "Failure screenshot could not be written.",
    );
  }
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

function createSyntheticProjectionJson() {
  return {
    projection: syntheticProjection,
    projectionJson: JSON.stringify(syntheticProjection, null, 2),
  };
}

async function assertNoRealContentMarkers(page, projectionJson) {
  const pageText = await page.locator("body").innerText();
  const combined = `${pageText}\n${projectionJson}`;
  const foundMarkers = knownRealContentMarkers.filter((marker) =>
    combined.includes(marker),
  );

  if (foundMarkers.length) {
    throw new Error(
      `Known real-content markers appeared in HGO projection smoke output: ${foundMarkers.join(", ")}`,
    );
  }

  addStep("confirm no known real-content markers", "passed");
}

async function runSmoke() {
  let webServer = null;
  let browser = null;
  let page = null;
  let hgoBaseUrl = suppliedHgoBaseUrl;

  try {
    browser = await launchChromium();

    if (!browser) {
      return;
    }

    if (hgoBaseUrl) {
      await waitForImportRoute(hgoBaseUrl, 15_000);
      addStep("use provided HGO base URL", "passed", { hgoBaseUrl });
    } else {
      webServer = await startLocalWebServer();
      hgoBaseUrl = webServer.baseUrl;
    }

    const { projection, projectionJson } = createSyntheticProjectionJson();
    addStep("create synthetic HGO projection JSON", "passed", {
      id: projection.id,
      status: projection.status,
      visibility: projection.visibility,
      bytes: projectionJson.length,
    });

    const context = await browser.newContext();
    page = await context.newPage();

    await page.goto(`${hgoBaseUrl}/projection-preview/import`, {
      waitUntil: "domcontentloaded",
    });
    addStep("open HGO projection import route", "passed", {
      url: page.url(),
    });

    await page.getByTestId("hgo-import-projection-json").fill(projectionJson);
    addStep("paste synthetic projection JSON", "passed");

    const warningPanel = page.getByTestId("hgo-import-validation-warnings");
    await warningPanel.waitFor({ state: "visible", timeout: 15_000 });
    await page
      .getByTestId("hgo-import-warning-heading")
      .waitFor({ state: "visible", timeout: 15_000 });
    const warningText = await warningPanel.innerText();

    if (
      !/staged/i.test(warningText) ||
      !/pull quote/i.test(warningText) ||
      !/not live publication/i.test(warningText)
    ) {
      throw new Error(
        `HGO warning panel did not include expected staged/pull quote/live-publication warnings. Text: ${warningText}`,
      );
    }
    addStep("confirm validation warning area", "passed");

    await page
      .getByTestId("hgo-projection-rendered-root")
      .waitFor({ state: "visible", timeout: 20_000 });
    addStep("confirm rendered projection root", "passed");

    await assertNoRealContentMarkers(page, projectionJson);

    const report = await writeReport("passed", {
      hgoBaseUrl,
      projection: {
        id: projection.id,
        slug: projection.slug,
        status: projection.status,
        visibility: projection.visibility,
        pullQuotes: projection.pullQuotes.length,
      },
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          hgoBaseUrl,
          steps: steps.length,
          screenshots: screenshots.length,
        },
        null,
        2,
      ),
    );

    await context.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);

    if (/Timed out waiting|ECONNREFUSED|fetch failed/i.test(message)) {
      warnings.push(
        "HGO import route was not reachable. Start web locally with: pnpm --filter web dev -- -p 3001, or provide HGO_BASE_URL.",
      );
    }

    if (page) {
      await screenshotOnFailure(page, "hgo-projection-browser-smoke-failure");
    }

    const report = await writeReport("failed", {
      hgoBaseUrl: hgoBaseUrl || null,
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
    if (browser) {
      await browser.close();
    }

    if (webServer) {
      await webServer.stop();
    }
  }
}

await runSmoke();
