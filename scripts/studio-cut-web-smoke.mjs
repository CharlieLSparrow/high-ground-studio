#!/usr/bin/env node

import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS: "",
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
const shortcutModifier = process.platform === "darwin" ? "Meta" : "Control";

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

async function createProxyPreviewSmokeFiles() {
  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-web-smoke-"));
  const manifestPath = path.join(workdir, "episode-manifest.web-smoke.json");
  const proxyPath = path.join(workdir, "source-monitor-proxy.web-smoke.mp4");
  const syncMapPath = path.join(workdir, "sync-map.web-smoke.json");
  const syncReportPath = path.join(workdir, "sync-report.web-smoke.json");
  const agentOpsPath = path.join(workdir, "agent-ops.web-smoke.json");
  const transcriptPath = path.join(workdir, "transcript.web-smoke.json");
  const generatedAt = "2026-05-23T00:00:00.000Z";
  const manifest = {
    id: "web-smoke-episode",
    title: "Web Smoke Episode",
    durationMs: 12000,
    sources: {
      homer: {
        role: "homer",
        label: "Synthetic Homer source",
        fileName: "homer.synthetic.mp4",
      },
      charlie: {
        role: "charlie",
        label: "Synthetic Charlie source",
        fileName: "charlie.synthetic.mp4",
      },
      clip: {
        role: "clip",
        label: "Synthetic Clip source",
        fileName: "clip.synthetic.mp4",
      },
      program: {
        role: "program",
        label: "Synthetic source monitor proxy",
        fileName: "source-monitor-proxy.web-smoke.mp4",
      },
    },
    sourceMonitorProxy: {
      localPlaceholderPath: "./source-monitor-proxy.web-smoke.mp4",
      panes: {
        homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
        charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        clip: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      },
    },
    syncBootstrap: {
      source: "premiere",
      xmlFileName: "web-smoke-premiere-export.xml",
      notes: "Synthetic manifest for Playwright browser smoke only.",
    },
  };
  const referenceRail = {
    syncJobId: "web-smoke-sync-job",
    referenceRole: "phoneReferenceAudio",
    segments: [
      {
        inputId: "phone-reference-01",
        fileName: "phone-reference-01.synthetic.wav",
        railStartMs: 0,
        sourceStartMs: 0,
        durationMs: 6000,
        confidence: 0.95,
        warnings: [],
      },
      {
        inputId: "phone-reference-02",
        fileName: "phone-reference-02.synthetic.wav",
        railStartMs: 6000,
        sourceStartMs: 0,
        durationMs: 6000,
        confidence: 0.94,
        warnings: [],
      },
    ],
    totalDurationMs: 12000,
    warnings: [],
  };
  const syncMap = {
    syncMapId: "web-smoke-sync-map",
    syncJobId: "web-smoke-sync-job",
    projectId: "web-smoke-episode",
    branchId: "local-main",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    canonicalTimeline: {
      durationMs: 12000,
      timebase: "milliseconds",
      referenceRole: "phoneReferenceAudio",
    },
    assets: [
      {
        assetId: "homer-video",
        inputId: "homer-video",
        role: "homerVideo",
        fileName: "homer.synthetic.mp4",
        timelineStartMs: 0,
        assetStartMs: 0,
        durationMs: 12000,
        estimatedOffsetMs: 0,
        confidence: 0.91,
        warnings: [],
      },
      {
        assetId: "charlie-video",
        inputId: "charlie-video",
        role: "charlieVideo",
        fileName: "charlie.synthetic.mp4",
        timelineStartMs: 1000,
        assetStartMs: 0,
        durationMs: 11000,
        estimatedOffsetMs: 1000,
        confidence: 0.88,
        warnings: [],
      },
    ],
    referenceRail,
    globalWarnings: ["Synthetic browser smoke Sync Map."],
  };
  const syncReport = {
    syncJobId: "web-smoke-sync-job",
    generatedAt,
    status: "ready",
    referenceRail,
    trackOffsets: [
      {
        role: "homerVideo",
        inputId: "homer-video",
        fileName: "homer.synthetic.mp4",
        estimatedOffsetMs: 0,
        confidence: 0.91,
        anchorCount: 2,
        anchorAgreementMs: 12,
        warnings: [],
      },
      {
        role: "charlieVideo",
        inputId: "charlie-video",
        fileName: "charlie.synthetic.mp4",
        estimatedOffsetMs: 1000,
        confidence: 0.88,
        anchorCount: 2,
        anchorAgreementMs: 18,
        warnings: [],
      },
    ],
    globalWarnings: ["Synthetic browser smoke sync report."],
  };
  const agentOps = {
    schemaVersion: 1,
    projectId: "web-smoke-episode",
    branchId: "local-main",
    operations: [
      {
        op: "addDecision",
        id: "web-smoke-agent-charlie-clip",
        sourceTimeMs: 11000,
        state: "charlie_clip",
        note: "Synthetic agent operation for browser smoke.",
      },
    ],
  };
  const transcript = {
    schemaVersion: 1,
    episodeId: "web-smoke-episode",
    generatedAt,
    language: "en",
    segments: [
      {
        id: "transcript-001",
        startSourceTimeMs: 5000,
        endSourceTimeMs: 9000,
        speaker: "Charlie",
        speakerRole: "charlie",
        text: "Let's look at the clip on screen in this synthetic browser smoke.",
        confidence: 0.98,
      },
      {
        id: "transcript-002",
        startSourceTimeMs: 9000,
        endSourceTimeMs: 11500,
        speaker: "Homer",
        speakerRole: "homer",
        text: "Um uh you know this is a browser smoke filler cluster.",
        confidence: 0.96,
      },
    ],
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(syncMapPath, JSON.stringify(syncMap, null, 2), "utf8");
  await writeFile(syncReportPath, JSON.stringify(syncReport, null, 2), "utf8");
  await writeFile(agentOpsPath, JSON.stringify(agentOps, null, 2), "utf8");
  await writeFile(transcriptPath, JSON.stringify(transcript, null, 2), "utf8");

  const ffmpegResult = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=640x360:r=24:d=12",
      "-pix_fmt",
      "yuv420p",
      proxyPath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (ffmpegResult.status !== 0) {
    const detail = ffmpegResult.stderr || ffmpegResult.stdout || "no ffmpeg output";
    throw new Error(`ffmpeg could not create web smoke proxy video: ${detail}`);
  }

  return {
    workdir,
    manifestPath,
    proxyPath,
    syncMapPath,
    syncReportPath,
    agentOpsPath,
    transcriptPath,
  };
}

function getErrorStack(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function isBenignBlobRevocationError(entry) {
  return (
    entry.type === "console" &&
    entry.text === "Failed to load resource: net::ERR_FILE_NOT_FOUND" &&
    typeof entry.location?.url === "string" &&
    entry.location.url.startsWith("blob:")
  );
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
  let smokeFiles;

  try {
    smokeFiles = await createProxyPreviewSmokeFiles();
    await waitForUrl(baseUrl);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
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

    const sharedRoomSection = page.getByLabel("Shared episode room");
    const rescuePackageSection = page.getByLabel("Publish Rescue Sync Package");
    const collaborationSection = page.getByLabel("Collaboration mode");
    const cloudMediaVaultSection = page.getByLabel("Cloud Media Vault");
    const cloudSyncSection = page.getByLabel("Cloud Sync Intake");
    const syncTimelineSection = page.getByLabel("Sync Job Timeline");

    await expect(page.getByRole("heading", { name: "Collaboration Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cloud Media Vault" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shared Episode Room" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Publish Rescue Sync Package" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cloud Sync Intake" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sync Job Timeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shared Room Diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sync Review" })).toBeVisible();
    await expect(cloudSyncSection).toContainText("Homer video");
    await expect(cloudSyncSection).toContainText("Charlie video");
    await expect(cloudSyncSection).toContainText("Homer clean audio");
    await expect(cloudSyncSection).toContainText("Charlie clean audio");
    await expect(cloudSyncSection).toContainText("Phone/reference audio");
    await expect(cloudSyncSection).toContainText("Clip/screen video");
    await expect(cloudSyncSection).toContainText(/Multiple pieces are allowed/i);
    await expect(cloudSyncSection).toContainText(/raw asset intake is disabled|local only/i);
    await expect(cloudMediaVaultSection).toContainText("high-ground-odyssey-media");
    await expect(cloudMediaVaultSection).toContainText("Insta360");
    await expect(cloudMediaVaultSection).toContainText("create-insta360-package");
    await expect(cloudMediaVaultSection).toContainText("upload-manifest");
    await expect(
      cloudSyncSection.getByRole("button", {
        name: "Create Sync Job / Upload Raw Assets",
      }),
    ).toBeDisabled();
    await expect(cloudSyncSection.getByRole("button", { name: "Queue Sync Job" })).toBeDisabled();
    await expect(
      cloudSyncSection.getByRole("button", { name: "Publish Worker Outputs" }),
    ).toBeDisabled();
    await expect(syncTimelineSection).toContainText("Draft");
    await expect(syncTimelineSection).toContainText("Uploading");
    await expect(syncTimelineSection).toContainText("Package Ready");
    await expect(syncTimelineSection).toContainText("Room Published");
    await expect(syncTimelineSection).toContainText("Next action");
    await expect(sharedRoomSection.getByText(/shared rooms are disabled in local-only mode/i)).toBeVisible();
    await expect(rescuePackageSection).toContainText("Manifest");
    await expect(rescuePackageSection).toContainText("Source-monitor proxy");
    await expect(rescuePackageSection).toContainText("Sync Map");
    await expect(rescuePackageSection).toContainText("Sync report");
    await expect(rescuePackageSection).toContainText("Package preflight");
    await expect(rescuePackageSection).toContainText("Generated files");
    await expect(
      rescuePackageSection.getByRole("button", { name: "Publish Generated Package" }),
    ).toBeDisabled();
    await expect(rescuePackageSection).toContainText(/local-only mode/i);
    await expect(page.getByLabel("Sync review")).toContainText("No Sync Map loaded");
    await page
      .getByLabel("Select generated Episode Manifest JSON")
      .setInputFiles(smokeFiles.manifestPath);
    await page
      .getByLabel("Select generated Sync Map JSON")
      .setInputFiles(smokeFiles.syncMapPath);
    await page
      .getByLabel("Select generated sync report JSON")
      .setInputFiles(smokeFiles.syncReportPath);
    await expect(rescuePackageSection).toContainText("Manifest and Sync Map");
    await expect(rescuePackageSection).toContainText("Room target");
    await expect(rescuePackageSection).toContainText("Waiting for source-monitor proxy");
    await expect(
      rescuePackageSection.getByRole("button", { name: "Use Package Room" }),
    ).toBeVisible();
    await expect(page.getByLabel("Sync review")).toContainText("Selected package");
    await expect(page.getByLabel("Sync review")).toContainText("web-smoke-sync-job");
    await expect(page.getByLabel("Sync review")).toContainText("Reference pieces");
    await expect(page.getByLabel("Sync review")).toContainText("Reference Rail");
    await expect(page.getByLabel("Sync review")).toContainText("phone-reference-01.synthetic.wav");
    await expect(page.getByLabel("Sync review")).toContainText("Track Offsets");
    await expect(page.getByLabel("Sync review")).toContainText("charlie.synthetic.mp4");
    await expect(page.getByLabel("Sync review")).toContainText("+0:01");
    await expect(page.getByLabel("Sync review")).toContainText("2 anchors");
    await expect(page.getByLabel("Sync review")).toContainText("Sync Warnings");
    await expect(page.getByLabel("Sync review")).toContainText("Homer video x1");
    await expect(page.getByLabel("Episode command center")).toContainText(
      "Generated package",
    );
    await expect(page.getByLabel("Episode command center")).toContainText(
      "2 of 3 generated files selected",
    );
    await expect(page.getByLabel("Episode command center")).toContainText(
      "Select remaining generated package files",
    );
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Room metadata");
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Sync Map");
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Sync report");
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Package fingerprint");
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Integrity");
    await expect(page.getByLabel("Shared room diagnostics")).toContainText("Local only");
    await expect(sharedRoomSection.getByRole("button", { name: "Create Shared Room" })).toBeDisabled();
    await expect(sharedRoomSection.getByRole("button", { name: "Copy Room Link" })).toBeDisabled();
    await expect(collaborationSection.getByText("Local only", { exact: true })).toBeVisible();
    await expect(collaborationSection.getByText("decisions are saved in this browser")).toBeVisible();
    await expect(collaborationSection.getByLabel("Collaboration project ID")).toHaveValue(
      "studio-cut-local-project",
    );
    await expect(collaborationSection.getByLabel("Collaboration branch ID")).toHaveValue(
      "local-main",
    );
    await expect(collaborationSection.getByText(/Collaborator presence appears here/i)).toBeVisible();
    await rescuePackageSection
      .getByRole("button", { name: "Use Package Room" })
      .click();
    await expect(rescuePackageSection).toContainText(
      "Publishing to web-smoke-episode / local-main",
    );
    await expect(collaborationSection).toContainText(
      "web-smoke-episode / local-main",
    );

    for (const label of stateButtonLabels) {
      await expect(stateButton(page, label)).toBeVisible();
    }

    await expect(page.locator(".shortcut-legend")).toContainText("Play/Pause");
    await expect(page.getByRole("heading", { name: "Timeline Power Tools" })).toBeVisible();
    await expect(page.getByLabel("Timeline Power Tools")).toContainText(
      "Set From Here To Next Marker",
    );
    await expect(page.getByRole("button", { name: "Export Decisions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Checkpoint" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Agent Context" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Local Checkpoint" })).toBeDisabled();
    await page
      .getByLabel("Import episode manifest JSON")
      .setInputFiles(smokeFiles.manifestPath);
    await expect(page.getByText(/Loaded manifest web-smoke-episode/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Episode Readiness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcript Review" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Episode Command Center" })).toBeVisible();
    await expect(page.getByLabel("Episode command center")).toContainText(
      "Browser edit",
    );
    await expect(page.getByRole("heading", { name: "Local Render Handoff" })).toBeVisible();
    await expect(page.getByLabel("Local render handoff")).toContainText(
      "render-rescue-sync-session",
    );
    await expect(page.getByLabel("Local render handoff")).toContainText(
      "web-smoke-episode-decisions.json",
    );
    await expect(page.getByRole("heading", { name: "Proxy Pane Calibration" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Adjusted Manifest" })).toBeVisible();
    await page
      .getByLabel("Import timed transcript JSON")
      .setInputFiles(smokeFiles.transcriptPath);
    await expect(page.getByLabel("Transcript review")).toContainText("Loaded");
    await expect(page.getByLabel("Transcript review")).toContainText("Clip refs");
    await expect(page.getByLabel("Transcript review")).toContainText("transcript_clip_reference");
    const transcriptLane = page.getByLabel("Transcript edit lane");
    const transcriptCleanup = page.getByLabel("Transcript cleanup suggestions");
    await expect(page.getByRole("heading", { name: "Transcript Edit Lane" })).toBeVisible();
    await expect(transcriptLane).toContainText("transcript-001");
    await expect(transcriptLane).toContainText("Charlie");
    await expect(page.getByRole("heading", { name: "Transcript Cleanup Suggestions" })).toBeVisible();
    await expect(transcriptCleanup).toContainText("Clip Reference");
    await transcriptCleanup
      .getByRole("button", { name: "Review Selected In Agent Inbox" })
      .click();
    await expect(page.getByLabel("Agent decision operation preview")).toContainText(
      "Agent Suggestions Inbox",
    );
    await page.getByLabel("Agent decision operation preview").getByRole("button", { name: "Dismiss" }).click();
    const clipLane = page.getByLabel("Clip candidate lane");
    await expect(page.getByRole("heading", { name: "Clip Candidate Lane" })).toBeVisible();
    const transcriptOpsDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Suggested Ops" }).click();
    const transcriptOps = await transcriptOpsDownload;
    assert.match(
      transcriptOps.suggestedFilename(),
      /web-smoke-episode-transcript-agent-ops-/,
    );
    const transcriptOpsPath = await transcriptOps.path();
    assert(transcriptOpsPath, "transcript suggested ops download path should be available");
    const transcriptOpsJson = JSON.parse(await readFile(transcriptOpsPath, "utf8"));
    assert.equal(transcriptOpsJson.schemaVersion, 1);
    assert(
      transcriptOpsJson.operations.some(
        (operation) =>
          operation.op === "addDecision" && operation.state === "charlie_clip",
      ),
      "transcript suggestions should include Charlie/Clip add decision",
    );
    assert(
      transcriptOpsJson.operations.every((operation) =>
        operation.approvalRequired === undefined ||
        operation.approvalRequired === true,
      ),
      "agent transcript suggestions should keep approval metadata when present",
    );
    await expect(page.getByText(/No decisions yet/i)).toBeVisible();
    await page.getByLabel("Homer source pane width").fill("0.49");
    await expect(page.getByRole("button", { name: "Reset Panes" })).toBeEnabled();
    await page.getByRole("button", { name: "Reset Panes" }).click();
    await expect(page.getByLabel("Homer source pane width")).toHaveValue("0.5");
    await page
      .getByLabel("Load local source-monitor proxy video")
      .setInputFiles(smokeFiles.proxyPath);
    await expect(page.getByText(/Loaded local proxy video/i)).toBeVisible();
    await expect(page.locator(".program-monitor .monitor-header")).toContainText(
      "Proxy Program Preview",
    );

    const secondsInput = page.getByRole("spinbutton", {
      name: "Seconds",
      exact: true,
    });

    const decisionSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Decision Events" }) });
    const segmentSection = page
      .locator(".list-section")
      .filter({ has: page.getByRole("heading", { name: "Derived Segments" }) });
    const currentSegmentSection = page
      .locator(".current-segment-panel")
      .filter({ has: page.getByRole("heading", { name: "Current Segment" }) });

    await transcriptLane
      .getByRole("button", { name: /Jump transcript segment transcript-001/ })
      .click();
    await expect(page.getByText(/Jumped to transcript segment transcript-001/i)).toBeVisible();
    await transcriptLane.getByLabel("Transcript segment state").selectOption("cut");
    await transcriptLane.getByRole("button", { name: "Apply To Selected Segment" }).click();
    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Cut");
    await expect(decisionSection.locator("tbody")).toContainText("transcript segment transcript-001");
    await decisionSection.getByRole("button", { name: "Undo" }).click();
    await expectSectionText(decisionSection, "0 events");
    await expectSectionText(decisionSection, "No local or imported decisions yet");
    await clipLane.getByLabel("Clip candidate title").fill("Synthetic transcript clip");
    await clipLane.getByRole("button", { name: "From Transcript Segment" }).click();
    await expect(clipLane).toContainText("Synthetic transcript clip");
    await clipLane
      .getByLabel("Clip status for Synthetic transcript clip")
      .selectOption("approved");
    await expect(clipLane).toContainText("1/1 approved");
    const clipCandidatesDownload = page.waitForEvent("download");
    await clipLane.getByRole("button", { name: "Export Clips" }).click();
    const clipCandidates = await clipCandidatesDownload;
    assert.match(
      clipCandidates.suggestedFilename(),
      /web-smoke-episode-clip-candidates-/,
    );
    const outputBoard = page.getByLabel("Episode output board");
    await expect(page.getByRole("heading", { name: "Episode Output Board" })).toBeVisible();
    await expect(outputBoard).toContainText("Approved Clips");
    await expect(outputBoard).toContainText("1/1");
    await expect(outputBoard).toContainText("Transcript");
    const outputPackageDownload = page.waitForEvent("download");
    await outputBoard.getByRole("button", { name: "Export Output JSON" }).click();
    const outputPackage = await outputPackageDownload;
    assert.match(
      outputPackage.suggestedFilename(),
      /web-smoke-episode-output-package-/,
    );
    const outputPackagePath = await outputPackage.path();
    assert(outputPackagePath, "episode output package download path should be available");
    const outputPackageJson = JSON.parse(
      await readFile(outputPackagePath, "utf8"),
    );
    assert.equal(outputPackageJson.schemaVersion, 1);
    assert.equal(outputPackageJson.episode.id, "web-smoke-episode");
    assert.equal(outputPackageJson.readiness.transcriptLoaded, true);
    assert.equal(outputPackageJson.metrics.approvedClipCount, 1);
    assert(
      !JSON.stringify(outputPackageJson).includes("blob:"),
      "episode output package must not include browser object URLs",
    );
    const captionProfilePanel = page.getByLabel("Caption and social profiles");
    await expect(page.getByRole("heading", { name: "Caption & Social Profiles" })).toBeVisible();
    await expect(captionProfilePanel).toContainText("Shorts/Reels/TikTok 9:16");
    await expect(captionProfilePanel).toContainText("Clean lower third");
    const renderProfileDownload = page.waitForEvent("download");
    await captionProfilePanel
      .getByRole("button", { name: "Export Render Profile Plan" })
      .click();
    const renderProfilePlan = await renderProfileDownload;
    assert.match(
      renderProfilePlan.suggestedFilename(),
      /web-smoke-episode-render-profile-plan-/,
    );
    const renderProfilePath = await renderProfilePlan.path();
    assert(renderProfilePath, "render profile plan download path should be available");
    const renderProfileJson = JSON.parse(await readFile(renderProfilePath, "utf8"));
    assert.equal(renderProfileJson.schemaVersion, 1);
    assert.equal(renderProfileJson.clipOutputs.length, 5);
    assert(
      renderProfileJson.captionPresets.some(
        (preset) => preset.id === "shorts_bold_stack",
      ),
      "render profile plan should include social caption presets",
    );

    await secondsInput.fill("5");
    await secondsInput.evaluate((element) => element.blur());
    await page.keyboard.press("3");
    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(decisionSection, "0:05");
    await expectSectionText(decisionSection, "Active");
    await expectSectionText(decisionSection, "Newest");
    await expect(page.locator(".decision-timeline")).toContainText("Decision Timeline");
    await expect(page.locator(".decision-timeline")).toContainText("Both");
    await expect(page.locator(".timeline-boundary-handle")).toHaveCount(1);
    await page.locator(".timeline-boundary-handle").first().click();
    const boundaryPanel = page.getByLabel("Decision refinement");
    await expect(boundaryPanel).toContainText("Decision Refinement");
    await expect(boundaryPanel.getByLabel("Selected decision boundary time")).toBeVisible();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await expect(page.getByLabel("Marker Lane")).toContainText(
      "Add markers at review beats",
    );
    await expectSectionText(currentSegmentSection, "Both");
    await expectSectionText(currentSegmentSection, "Included");
    await expect(
      page.locator(".program-monitor .proxy-program-preview.layout-both"),
    ).toBeVisible();
    await expect(page.locator(".program-monitor .proxy-crop-homer")).toBeVisible();
    await expect(page.locator(".program-monitor .proxy-crop-charlie")).toBeVisible();
    await page.keyboard.press(`${shortcutModifier}+Z`);
    await expectSectionText(decisionSection, "0 events");
    await expectSectionText(decisionSection, "No local or imported decisions yet");
    await page.keyboard.press(`${shortcutModifier}+Shift+Z`);
    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Both");
    await expectSectionText(currentSegmentSection, "Both");
    await page.getByRole("button", { name: "Save Local Checkpoint" }).click();
    await expect(page.locator(".local-checkpoints")).toContainText("1 saved");
    await expect(page.locator(".local-checkpoints")).toContainText("1 decision");

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
    await expect(page.locator(".local-checkpoints")).toContainText("1 saved");
    await page.locator(".local-checkpoints").getByRole("button", { name: "Restore" }).click();
    await expectSectionText(decisionSection, "1 event");
    await expectSectionText(decisionSection, "Both");
    await decisionSection.getByRole("button", { name: /Edit decision/ }).first().click();
    const refinementPanel = page.getByLabel("Decision refinement");
    await expect(refinementPanel).toContainText("Decision Refinement");
    await refinementPanel.getByLabel("Selected decision state").selectOption("charlie");
    await refinementPanel.getByLabel("Selected decision source time seconds").fill("6");
    await refinementPanel.getByLabel("Selected decision note").fill("Corrected in smoke");
    await refinementPanel.getByRole("button", { name: "Save Refinement" }).click();
    await expect(decisionSection.locator("tbody")).toContainText("Charlie");
    await expect(decisionSection.locator("tbody")).toContainText("0:06");
    await expect(decisionSection.locator("tbody")).toContainText(
      "Corrected in smoke",
    );
    await page.keyboard.press(`${shortcutModifier}+Z`);
    await expect(decisionSection.locator("tbody")).toContainText("Both");
    await expect(decisionSection.locator("tbody")).toContainText("0:05");
    await page.keyboard.press(`${shortcutModifier}+Shift+Z`);
    await expect(decisionSection.locator("tbody")).toContainText("Charlie");
    await expect(decisionSection.locator("tbody")).toContainText("0:06");

    await page
      .getByLabel("Import agent decision operation JSON")
      .setInputFiles(smokeFiles.agentOpsPath);
    const agentOpsPreview = page.getByLabel("Agent decision operation preview");
    await expect(agentOpsPreview).toContainText("Ready");
    await expect(agentOpsPreview).toContainText("Add Charlie/Clip at 0:11");
    await expect(agentOpsPreview).toContainText("Agent Suggestions Inbox");
    await expect(agentOpsPreview).toContainText("Selected");
    await agentOpsPreview.getByRole("button", { name: "Reject Selected" }).click();
    await expect(agentOpsPreview).toContainText("Rejected");
    await agentOpsPreview.getByRole("button", { name: "Restore Rejected" }).click();
    await agentOpsPreview
      .getByRole("checkbox", { name: "Select agent suggestion 1" })
      .uncheck();
    await agentOpsPreview
      .getByRole("checkbox", { name: "Select agent suggestion 1" })
      .check();
    await page.getByRole("button", { name: "Apply Selected" }).click();
    await expectSectionText(decisionSection, "2 events");
    await expectSectionText(decisionSection, "Charlie/Clip");

    const agentContextDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Agent Context" }).click();
    const download = await agentContextDownload;
    assert.match(download.suggestedFilename(), /web-smoke-episode-agent-context-/);
    const downloadPath = await download.path();
    assert(downloadPath, "agent context download path should be available");
    const agentContext = JSON.parse(await readFile(downloadPath, "utf8"));
    assert.equal(agentContext.schemaVersion, 1);
    assert.equal(agentContext.episode.id, "web-smoke-episode");
    assert.equal(agentContext.transcript.loaded, true);
    assert.equal(agentContext.transcript.segmentCount, 2);
    assert.equal(agentContext.transcript.review.summary.clipReferenceCount, 1);
    assert.equal(agentContext.clipCandidates.count, 1);
    assert.equal(agentContext.clipCandidates.approvedCount, 1);
    assert.equal(agentContext.decisions.activeCount, 2);
    assert.equal(agentContext.decisions.tombstonedCount, 0);
    assert.equal(agentContext.media.sourceMonitorProxy.objectUrlPersisted, false);
    assert(
      !JSON.stringify(agentContext).includes("blob:"),
      "agent context must not include browser object URLs",
    );

    await secondsInput.fill("8");
    await page.getByLabel("Marker label").fill("Review stop");
    await page.getByLabel("Marker comment").fill("Stop before clip transition");
    await page.getByRole("button", { name: "Add Marker" }).click();
    await expect(page.getByLabel("Marker Lane")).toContainText("Review stop");
    await expect(page.getByLabel("Marker Lane")).toContainText(
      "Stop before clip transition",
    );
    await expect(
      page.getByLabel("Marker Lane").getByRole("button", {
        name: "Set range out to marker Review stop",
      }),
    ).toBeVisible();
    await secondsInput.fill("6");
    await page.getByLabel("Range state").selectOption("homer");
    await page
      .getByRole("button", { name: "Set From Here To Next Marker" })
      .click();
    await expect(page.getByLabel("Timeline Power Tools")).toContainText(
      "Review stop",
    );
    await expect(decisionSection.locator("tbody")).toContainText("Homer");
    await expect(decisionSection.locator("tbody")).toContainText("Range tool");
    await expect(page.locator(".decision-timeline")).toContainText("Selected range");

    const actionablePageErrors = pageErrors.filter(
      (entry) => !isBenignBlobRevocationError(entry),
    );

    if (actionablePageErrors.length > 0) {
      throw new Error(
        `Browser console/page errors: ${actionablePageErrors
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

    if (smokeFiles) {
      await rm(smokeFiles.workdir, { recursive: true, force: true });
    }
  }
}

runBrowserSmoke().catch((error) => {
  console.error(`\nStudio Cut web smoke failed: ${error.message}`);
  process.exitCode = 1;
});
