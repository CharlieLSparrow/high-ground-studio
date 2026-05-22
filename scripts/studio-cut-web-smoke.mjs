#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const host = "127.0.0.1";
const port = Number(process.env.STUDIO_CUT_WEB_SMOKE_PORT ?? 4187);
const baseUrl = `http://${host}:${port}`;
const artifactRoot = path.resolve(
  repoRoot,
  process.env.STUDIO_CUT_WEB_SMOKE_ARTIFACT_DIR ??
    "tools/studio-cut-local/output/web-smoke-artifacts",
);
const localDevEnv = {
  ...process.env,
  VITE_FIREBASE_API_KEY: "",
  VITE_FIREBASE_AUTH_DOMAIN: "",
  VITE_FIREBASE_PROJECT_ID: "",
  VITE_FIREBASE_APP_ID: "",
  VITE_FIREBASE_STORAGE_BUCKET: "",
  VITE_STUDIO_CUT_ALLOWED_EMAILS: "",
};

const stateButtonLabels = [
  "Charlie",
  "Homer",
  "Both",
  "Charlie/Clip",
  "Homer/Clip",
  "Both/Clip",
  "Cut",
];

function startDevServer(devServerLog) {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "studio-cut-web",
      "exec",
      "vite",
      "--host",
      host,
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      env: localDevEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    devServerLog.push({ stream: "stdout", text });
    process.stdout.write(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    devServerLog.push({ stream: "stderr", text });
    process.stderr.write(text);
  });

  return child;
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();

        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        retry();
      });

      request.on("error", retry);
      request.setTimeout(2000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(attempt, 250);
    };

    attempt();
  });
}

async function stopDevServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function stateButton(page, label) {
  return page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`),
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectSectionText(section, text) {
  await expect(section).toContainText(text, { timeout: 5000 });
}

function createArtifactRunDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(artifactRoot, timestamp);
}

function getErrorStack(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

async function writeFailureArtifacts({
  artifactDir,
  context,
  page,
  pageErrors,
  devServerLog,
  error,
  traceState,
}) {
  await mkdir(artifactDir, { recursive: true });

  const artifacts = [];

  const failureSummaryPath = path.join(artifactDir, "failure.txt");
  await writeFile(
    failureSummaryPath,
    [
      "Studio Cut web smoke failure",
      "============================",
      `Time: ${new Date().toISOString()}`,
      `URL: ${baseUrl}`,
      "",
      getErrorStack(error),
      "",
    ].join("\n"),
    "utf8",
  );
  artifacts.push(failureSummaryPath);

  const errorsPath = path.join(artifactDir, "browser-errors.json");
  await writeFile(
    errorsPath,
    JSON.stringify(pageErrors, null, 2) + "\n",
    "utf8",
  );
  artifacts.push(errorsPath);

  const devServerLogPath = path.join(artifactDir, "dev-server.log");
  await writeFile(
    devServerLogPath,
    devServerLog.map((entry) => `[${entry.stream}] ${entry.text}`).join(""),
    "utf8",
  );
  artifacts.push(devServerLogPath);

  if (page) {
    try {
      const screenshotPath = path.join(artifactDir, "screenshot.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      artifacts.push(screenshotPath);
    } catch (screenshotError) {
      artifacts.push(`screenshot failed: ${getErrorStack(screenshotError)}`);
    }

    try {
      const htmlPath = path.join(artifactDir, "page.html");
      await writeFile(htmlPath, await page.content(), "utf8");
      artifacts.push(htmlPath);
    } catch (htmlError) {
      artifacts.push(`page HTML failed: ${getErrorStack(htmlError)}`);
    }
  }

  if (context && traceState.started && !traceState.stopped) {
    try {
      const tracePath = path.join(artifactDir, "trace.zip");
      await context.tracing.stop({ path: tracePath });
      traceState.stopped = true;
      artifacts.push(tracePath);
    } catch (traceError) {
      artifacts.push(`trace failed: ${getErrorStack(traceError)}`);
    }
  }

  console.error("\nStudio Cut web smoke artifacts:");

  for (const artifact of artifacts) {
    console.error(`  ${artifact}`);
  }
}

async function runBrowserSmoke() {
  const devServerLog = [];
  const pageErrors = [];
  const traceState = { started: false, stopped: false };
  const artifactDir = createArtifactRunDir();
  const devServer = startDevServer(devServerLog);
  let browser;
  let context;
  let page;

  try {
    await waitForUrl(baseUrl);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    traceState.started = true;
    page = await context.newPage();

    page.on("pageerror", (error) => {
      pageErrors.push({
        type: "pageerror",
        text: error.message,
        stack: error.stack,
      });
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push({
          type: "console",
          text: message.text(),
          location: message.location(),
        });
      }
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Studio Cut" })).toBeVisible();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.getByText("Local dev prototype")).toBeVisible();
    await expect(page.getByText("Local dev mode", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/auth disabled because Firebase env vars are missing/i),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Persistence Mode" })).toBeVisible();
    await expect(page.getByText("Local only", { exact: true })).toBeVisible();
    await expect(page.getByText("decisions are saved in this browser")).toBeVisible();

    for (const label of stateButtonLabels) {
      await expect(stateButton(page, label)).toBeVisible();
    }

    await expect(page.locator(".shortcut-legend")).toContainText("Play/Pause");
    await expect(page.getByRole("button", { name: "Export Decisions" })).toBeVisible();

    const secondsInput = page.getByLabel("Seconds");
    await secondsInput.fill("5");
    await secondsInput.evaluate((element) => element.blur());
    await page.keyboard.press("3");

    const decisionSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Decision Events" }) });
    const segmentSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Derived Segments" }) });
    const currentSegmentSection = page
      .locator(".current-segment-panel")
      .filter({ has: page.getByRole("heading", { name: "Current Segment" }) });

    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(decisionSection, "0:05");
    await expectSectionText(decisionSection, "Active");
    await expectSectionText(decisionSection, "Newest");
    await expectSectionText(currentSegmentSection, "Both");
    await expectSectionText(currentSegmentSection, "Included");

    await secondsInput.fill("10");
    await stateButton(page, "Cut").click();

    await expectSectionText(decisionSection, "2 events");
    await expectSectionText(decisionSection, "Cut");
    await expectSectionText(segmentSection, "Both");
    await expectSectionText(segmentSection, "Cut");
    await expectSectionText(segmentSection, "0:05");
    await expectSectionText(segmentSection, "0:10");
    await expectSectionText(segmentSection, "Episode end");

    await secondsInput.fill("5");
    await secondsInput.evaluate((element) => element.blur());
    await page.keyboard.press("Space");
    await expect(page.getByText("Program Playback", { exact: true })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByText("Source Scrub", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expectSectionText(decisionSection, "2 events");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(decisionSection, "Cut");

    if (pageErrors.length > 0) {
      throw new Error(
        `Browser console/page errors: ${pageErrors
          .map((entry) => entry.text)
          .join(" | ")}`,
      );
    }

    if (context && traceState.started && !traceState.stopped) {
      await context.tracing.stop();
      traceState.stopped = true;
    }

    console.log("\nStudio Cut web smoke passed.");
    console.log("Verified local dev editor load, state decisions, derived segments, playback controls, and localStorage persistence.");
  } catch (error) {
    try {
      await writeFailureArtifacts({
        artifactDir,
        context,
        page,
        pageErrors,
        devServerLog,
        error,
        traceState,
      });
    } catch (artifactError) {
      console.error(
        `\nStudio Cut web smoke artifact write failed: ${getErrorStack(
          artifactError,
        )}`,
      );
    }

    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }

    await stopDevServer(devServer);
  }
}

runBrowserSmoke().catch((error) => {
  console.error(`\nStudio Cut web smoke failed: ${error.message}`);
  process.exitCode = 1;
});
