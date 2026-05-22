import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { chromium } from "@playwright/test";

const reportPath = path.resolve(
  "artifacts/agentic-browser-smoke/studio-hgo-browser-smoke-report.json",
);
const defaultStorageStatePath = "artifacts/auth/studio-storage-state.json";
const authStorageStatePath = path.resolve(
  process.env.STUDIO_AUTH_STORAGE_STATE || defaultStorageStatePath,
);
const studioBaseUrl =
  process.env.STUDIO_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const hgoBaseUrl =
  process.env.HGO_BASE_URL?.replace(/\/$/, "") || "http://localhost:3001";
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

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
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
    environment: extra.environment ?? "browser",
    steps,
    screenshots,
    errors,
    warnings,
    routesTested: [
      "/manuscript",
      "/api/manuscript/library",
      "/api/manuscript/snapshots",
      "/projection-preview/import",
    ],
    commitSha: getCommitSha(),
    config: {
      studioBaseUrl,
      hgoBaseUrl,
      authStorageStatePath:
        path.relative(process.cwd(), authStorageStatePath) ||
        authStorageStatePath,
      headless,
    },
    confirms: {
      syntheticDataOnly: status === "passed" || status === "blocked",
      noRealContent: status === "passed" || status === "blocked",
      noServerWrites: status === "blocked",
      noServerWritesBeyondSyntheticSmoke:
        status === "passed" || status === "blocked",
      syntheticServerWritesOnly: status === "passed",
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

async function blockForMissingAuthState() {
  warnings.push(
    "Studio auth storage state is missing. Browser smoke did not open a browser and did not perform server writes.",
  );
  addStep("check private Studio auth storage state", "blocked", {
    expectedPath:
      path.relative(process.cwd(), authStorageStatePath) ||
      authStorageStatePath,
    runbook: "docs/runbooks/agentic-browser-auth-state.md",
  });

  const report = await writeReport("blocked", {
    blockedReason: "AUTH_STORAGE_STATE_MISSING",
    nextStep:
      "Create private auth state with pnpm studio:hgo:capture-auth-state, then rerun pnpm studio:hgo:browser-smoke.",
  });

  console.log(
    JSON.stringify(
      {
        status: report.status,
        reportPath,
        blockedReason: report.blockedReason,
        runbook: "docs/runbooks/agentic-browser-auth-state.md",
      },
      null,
      2,
    ),
  );
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

async function getByTestId(page, testId, options = {}) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({
    state: "visible",
    timeout: options.timeout ?? 15_000,
  });
  return locator;
}

async function clickByTestId(page, testId, details = {}) {
  const locator = await getByTestId(page, testId);

  if (await locator.isDisabled()) {
    throw new Error(`Selector ${testId} is disabled.`);
  }

  await locator.click();
  addStep(`click ${testId}`, "passed", details);
  return locator;
}

async function assertNoRealContentMarkers(page, projectionJson) {
  const pageText = await page.locator("body").innerText();
  const combined = `${pageText}\n${projectionJson}`;
  const foundMarkers = knownRealContentMarkers.filter((marker) =>
    combined.includes(marker),
  );

  if (foundMarkers.length) {
    throw new Error(
      `Known real-content markers appeared in browser smoke output: ${foundMarkers.join(", ")}`,
    );
  }

  addStep("confirm no known real-content markers", "passed");
}

async function runBrowserSmoke() {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: authStorageStatePath,
  });
  const page = await context.newPage();

  page.on("dialog", async (dialog) => {
    addStep("accept browser confirmation dialog", "passed", {
      message: dialog.message(),
    });
    await dialog.accept();
  });

  try {
    await page.goto(`${studioBaseUrl}/manuscript`, {
      waitUntil: "domcontentloaded",
    });
    await getByTestId(page, "manuscript-mode-publish");
    addStep("open Studio manuscript page", "passed", {
      url: page.url(),
    });

    await clickByTestId(page, "manuscript-mode-publish");
    await clickByTestId(page, "manuscript-load-synthetic-smoke");

    await clickByTestId(page, "manuscript-mode-backup");
    await getByTestId(page, "manuscript-library-panel");
    addStep("confirm manuscript library panel", "passed");

    await clickByTestId(page, "manuscript-library-create-current", {
      serverWrite: "synthetic manuscript metadata only",
    });
    await page
      .getByText(/Named manuscript created|Created manuscript/i)
      .waitFor({ timeout: 15_000 });

    await clickByTestId(page, "manuscript-snapshot-save", {
      serverWrite: "synthetic manual snapshot only",
    });
    await page
      .getByText(/Saved .* snapshot|Saved legacy server snapshot/i)
      .waitFor({ timeout: 15_000 });

    await clickByTestId(page, "manuscript-snapshot-load-latest");
    await page
      .getByText(/Loaded latest .* snapshot|Loaded latest server snapshot/i)
      .waitFor({ timeout: 15_000 });

    await clickByTestId(page, "manuscript-mode-publish");
    await getByTestId(page, "hgo-projection-bridge-panel");
    await clickByTestId(page, "hgo-projection-generate");
    const projectionJson = await (
      await getByTestId(page, "hgo-projection-json")
    ).inputValue();

    if (!projectionJson.trim()) {
      throw new Error("HGO projection JSON textarea is empty.");
    }

    JSON.parse(projectionJson);
    addStep("capture HGO projection JSON", "passed", {
      bytes: projectionJson.length,
    });

    await page.goto(`${hgoBaseUrl}/projection-preview/import`, {
      waitUntil: "domcontentloaded",
    });
    await (await getByTestId(page, "hgo-import-projection-json")).fill(
      projectionJson,
    );
    await getByTestId(page, "hgo-import-validation-warnings");
    await page
      .getByTestId("hgo-import-validation-warnings")
      .getByText(/staged review|pull quote|unresolved citation/i)
      .waitFor({ timeout: 15_000 });
    addStep("confirm HGO import validation warnings", "passed");

    await getByTestId(page, "hgo-projection-rendered-root", {
      timeout: 20_000,
    });
    addStep("confirm HGO rendered projection root", "passed");

    await assertNoRealContentMarkers(page, projectionJson);

    const report = await writeReport("passed", {
      projectionJsonBytes: projectionJson.length,
      serverWrites: [
        "synthetic manuscript metadata through Studio UI",
        "synthetic manual snapshot through Studio UI",
      ],
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          steps: steps.length,
          screenshots: screenshots.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);

    if (
      /manuscript-mode-publish|manuscript-load-synthetic-smoke|Timeout/i.test(
        message,
      )
    ) {
      warnings.push(
        "Studio page did not expose expected test selectors. The auth storage state may be missing, expired, or unauthorized.",
      );
    }

    await screenshotOnFailure(page, "studio-hgo-browser-smoke-failure");
    const report = await writeReport("failed");

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
    await context.close();
    await browser.close();
  }
}

if (!(await pathExists(authStorageStatePath))) {
  await blockForMissingAuthState();
} else {
  addStep("check private Studio auth storage state", "passed", {
    path:
      path.relative(process.cwd(), authStorageStatePath) ||
      authStorageStatePath,
  });
  await runBrowserSmoke();
}
