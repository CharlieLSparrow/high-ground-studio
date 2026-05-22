#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
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

function startDevServer() {
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
    process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
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

async function runBrowserSmoke() {
  const devServer = startDevServer();
  let browser;

  try {
    await waitForUrl(baseUrl);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const pageErrors = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push(message.text());
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
    await expect(page.getByText("Local only")).toBeVisible();
    await expect(page.getByText("decisions are saved in this browser")).toBeVisible();

    for (const label of stateButtonLabels) {
      await expect(stateButton(page, label)).toBeVisible();
    }

    const secondsInput = page.getByLabel("Seconds");
    await secondsInput.fill("5");
    await stateButton(page, "Both").click();

    const decisionSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Decision Events" }) });
    const segmentSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Derived Segments" }) });

    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(decisionSection, "0:05");

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
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByText("Program Playback", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Source Scrub", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expectSectionText(decisionSection, "2 events");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(decisionSection, "Cut");

    if (pageErrors.length > 0) {
      throw new Error(`Browser console/page errors: ${pageErrors.join(" | ")}`);
    }

    console.log("\nStudio Cut web smoke passed.");
    console.log("Verified local dev editor load, state decisions, derived segments, playback controls, and localStorage persistence.");
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
