#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRODUCTION_ORIGIN = "https://nest.quipsly.com";
const KEYCHAIN_SERVICE = "quipsly-capture-reviewer";
const OPERATOR_EMAIL = "codex@dev.test";
const NATIVE_RECEIPT_SCHEMA =
  "quipsly-retained-production-native-project-operation-v1";
const WEB_RECEIPT_SCHEMA =
  "quipsly-retained-production-project-web-readback-v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireExternalPath(value, label) {
  const raw = typeof value === "string" ? value.trim() : "";
  assert(raw && path.isAbsolute(raw), `${label} must be an explicit absolute path.`);
  const resolved = path.resolve(raw);
  assert(resolved !== "/" && resolved !== REPO_ROOT, `${label} is too broad.`);
  assert(
    !resolved.startsWith(`${REPO_ROOT}${path.sep}`),
    `${label} must stay outside the Git worktree.`,
  );
  return resolved;
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") return { help: true };
    if (!["--native-receipt", "--output-dir"].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    values.set(key, argv[index + 1] ?? "");
    index += 1;
  }
  const nativeReceipt = requireExternalPath(
    values.get("--native-receipt"),
    "Native receipt",
  );
  assert(nativeReceipt.endsWith(".json"), "Native receipt must be a JSON file.");
  return {
    help: false,
    nativeReceipt,
    outputDir: requireExternalPath(values.get("--output-dir"), "Output directory"),
  };
}

export function requireProductionNativeReceipt(value) {
  assert(
    value?.schema === NATIVE_RECEIPT_SCHEMA &&
      value?.ok === true &&
      value?.origin === PRODUCTION_ORIGIN &&
      value?.compiledIPhoneOperation === true &&
      value?.identity?.email === OPERATOR_EMAIL &&
      value?.identity?.firebaseVerified === true &&
      value?.identity?.nativeSessionVerified === true,
    "Native receipt is not an exact successful production Capture operation.",
  );
  const records = value.records;
  for (const [kind, record] of Object.entries({
    project: records?.project,
    task: records?.task,
    note: records?.note,
    goal: records?.goal,
    tag: records?.tag,
  })) {
    assert(
      typeof record?.id === "string" && record.id,
      `Native receipt is missing the stable ${kind} identity.`,
    );
  }
  assert(
    typeof records.project.slug === "string" && records.project.slug &&
      typeof records.project.name === "string" && records.project.name.startsWith("QA Retained · ") &&
      typeof records.task.title === "string" && records.task.title.startsWith("QA Retained · ") &&
      typeof records.note.title === "string" && records.note.title.startsWith("QA Retained · ") &&
      typeof records.note.stableId === "string" && records.note.stableId &&
      typeof records.goal.title === "string" && records.goal.title.startsWith("QA Retained · ") &&
      typeof records.tag.label === "string" && records.tag.label.startsWith("QA Retained · ") &&
      records.tag.usageCount === 3,
    "Native receipt lost its retained labels, document identity, or exact shared-tag use.",
  );
  assert(
    value?.boundaries?.credentialsPrinted === false &&
      value?.boundaries?.tokensPrinted === false &&
      value?.boundaries?.externalSideEffects === false &&
      value?.boundaries?.cleanupPerformed === false,
    "Native receipt does not preserve the required private side-effect-free boundary.",
  );
  return value;
}

async function ensureMissing(target, label) {
  try {
    await stat(target);
    throw new Error(`${label} already exists; refusing to overwrite it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function privateScreenshot(page, target, options = {}) {
  await ensureMissing(target, "Screenshot");
  await page.screenshot({ path: target, fullPage: true, ...options });
  await chmod(target, 0o600);
}

async function writePrivateAtomicReceipt(target, value) {
  await ensureMissing(target, "Web receipt");
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await link(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function waitForExactText(page, value, description) {
  const locator = page.getByText(value, { exact: true }).first();
  await locator.waitFor({ timeout: 30_000 });
  assert(await locator.isVisible(), `${description} is not visible.`);
}

async function openRoute(page, url, heading) {
  const response = await page.goto(url, { waitUntil: "load" });
  assert(response?.status() === 200, `${new URL(url).pathname} returned HTTP ${response?.status()}.`);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({
    timeout: 30_000,
  });
  await assertNoHorizontalOverflow(page.getByRole("main").last(), new URL(url).pathname);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:production-project-web-readback -- \\
    --native-receipt "/absolute/private/native-operation.json" \\
    --output-dir "/absolute/private/new-web-evidence-directory"

This read-only operation signs the same retained .test account into rendered
production Nest and verifies that the iPhone-created project, Task, Note, Goal,
and shared tag are reachable as the same canonical records on desktop and
phone-width web surfaces. It captures private screenshots and clears only the
temporary browser session; it does not change product records.`);
    return;
  }

  await ensureMissing(options.outputDir, "Output directory");
  const receiptMode = (await stat(options.nativeReceipt)).mode & 0o777;
  assert(
    receiptMode === (fsConstants.S_IRUSR | fsConstants.S_IWUSR),
    "Native production receipt must remain mode 0600.",
  );
  const nativeReceipt = requireProductionNativeReceipt(
    JSON.parse(await readFile(options.nativeReceipt, "utf8")),
  );
  await mkdir(options.outputDir, { recursive: false, mode: 0o700 });

  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: OPERATOR_EMAIL,
  });
  assert(password, "The retained production operator has no Keychain password.");
  const records = nativeReceipt.records;
  const identity = { role: "retained-production-web-readback", email: OPERATOR_EMAIL };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const serverFailures = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === PRODUCTION_ORIGIN && response.status() >= 500) {
      serverFailures.push({ path: url.pathname, status: response.status() });
    }
  });
  let signedIn = false;
  let sessionCleared = false;
  try {
    const overviewPath = `/nests/${encodeURIComponent(records.project.slug)}`;
    await signInThroughRenderedLogin({
      page,
      baseURL: PRODUCTION_ORIGIN,
      identity,
      password,
      callbackPath: overviewPath,
    });
    signedIn = true;

    await openRoute(
      page,
      `${PRODUCTION_ORIGIN}${overviewPath}`,
      records.project.name,
    );
    for (const [value, description] of [
      [records.note.title, "iPhone-created Note"],
      [records.task.title, "iPhone-created Task"],
      [records.goal.title, "iPhone-created Goal"],
      [`#${records.tag.label}`, "iPhone-created shared tag"],
    ]) {
      await waitForExactText(page, value, description);
    }
    await privateScreenshot(
      page,
      path.join(options.outputDir, "project-overview-desktop.png"),
    );

    const notesURL = `${PRODUCTION_ORIGIN}${overviewPath}?view=notes`;
    await openRoute(page, notesURL, "Notes & documents");
    const noteLink = page.getByRole("link", { name: new RegExp(records.note.title) }).first();
    await noteLink.waitFor({ timeout: 30_000 });
    const noteHref = await noteLink.getAttribute("href");
    assert(
      noteHref === records.note.webPath,
      "Rendered Notes surface did not route to the exact canonical document identity.",
    );
    await privateScreenshot(
      page,
      path.join(options.outputDir, "project-notes-desktop.png"),
    );

    const workURL = `${PRODUCTION_ORIGIN}${overviewPath}?view=work`;
    await openRoute(page, workURL, "Project follow-through");
    const taskLink = page.getByRole("link", { name: records.task.title, exact: true }).first();
    const goalLink = page.getByRole("link", { name: new RegExp(`^${records.goal.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();
    await taskLink.waitFor({ timeout: 30_000 });
    await goalLink.waitFor({ timeout: 30_000 });
    assert(
      (await taskLink.getAttribute("href")) === `/work?task=${encodeURIComponent(records.task.id)}`,
      "Rendered project Task link lost its stable identity.",
    );
    assert(
      (await goalLink.getAttribute("href")) === `/work?goal=${encodeURIComponent(records.goal.id)}`,
      "Rendered project Goal link lost its stable identity.",
    );
    await privateScreenshot(
      page,
      path.join(options.outputDir, "project-work-desktop.png"),
    );

    await openRoute(
      page,
      `${PRODUCTION_ORIGIN}/work?task=${encodeURIComponent(records.task.id)}`,
      "Work Queue",
    );
    const focusedTask = page.locator(`#work-task-${records.task.id}`);
    await focusedTask.waitFor({ timeout: 30_000 });
    await waitForExactText(page, `#${records.tag.label}`, "Task shared tag");
    assert(
      (await focusedTask.getAttribute("aria-current")) === "true",
      "Global Work did not focus the exact iPhone-created Task.",
    );

    await openRoute(
      page,
      `${PRODUCTION_ORIGIN}/work?goal=${encodeURIComponent(records.goal.id)}`,
      "Work Queue",
    );
    const focusedGoal = page.locator(`#work-goal-${records.goal.id}`);
    await focusedGoal.waitFor({ timeout: 30_000 });
    assert(
      (await focusedGoal.getAttribute("aria-current")) === "true",
      "Global Work did not focus the exact iPhone-created Goal.",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(
      page,
      `${PRODUCTION_ORIGIN}${overviewPath}`,
      records.project.name,
    );
    await waitForExactText(page, records.task.title, "phone-width iPhone-created Task");
    await waitForExactText(page, records.goal.title, "phone-width iPhone-created Goal");
    await privateScreenshot(
      page,
      path.join(options.outputDir, "project-overview-phone-width.png"),
    );

    assert(pageErrors.length === 0, `Rendered production readback raised browser errors: ${pageErrors.join(" | ")}`);
    assert(serverFailures.length === 0, `Rendered production readback received server failures: ${JSON.stringify(serverFailures)}`);
    await clearRenderedSession(page, PRODUCTION_ORIGIN, identity.role);
    sessionCleared = true;

    const screenshots = [
      "project-overview-desktop.png",
      "project-notes-desktop.png",
      "project-work-desktop.png",
      "project-overview-phone-width.png",
    ];
    const webReceiptPath = path.join(options.outputDir, "readback.json");
    await writePrivateAtomicReceipt(webReceiptPath, {
      schema: WEB_RECEIPT_SCHEMA,
      ok: true,
      completedAt: new Date().toISOString(),
      origin: PRODUCTION_ORIGIN,
      nativeReceipt: options.nativeReceipt,
      identity: { email: OPERATOR_EMAIL, renderedLogin: true },
      records: {
        project: { id: records.project.id, slug: records.project.slug, rendered: true },
        task: { id: records.task.id, focusedInGlobalWork: true, renderedInProject: true },
        note: { id: records.note.id, stableId: records.note.stableId, exactWebPath: true, renderedInProject: true },
        goal: { id: records.goal.id, focusedInGlobalWork: true, renderedInProject: true },
        tag: { id: records.tag.id, renderedOnProjectAndWork: true, usageCount: records.tag.usageCount },
      },
      surfaces: {
        projectOverviewDesktop: true,
        projectNotesDesktop: true,
        projectWorkDesktop: true,
        globalTaskFocus: true,
        globalGoalFocus: true,
        projectOverviewPhoneWidth: true,
        horizontalOverflow: false,
      },
      evidence: { directory: options.outputDir, screenshots },
      boundaries: {
        privateArtifacts: true,
        screenshotsMode0600: true,
        receiptMode0600: true,
        credentialsFromKeychain: true,
        credentialsPrinted: false,
        tokensPrinted: false,
        renderedProductMutation: false,
        productRecordsChanged: false,
        browserSessionCleared: true,
        browserExceptions: 0,
        serverFailures: 0,
        externalSideEffects: false,
      },
    });
    const modes = await Promise.all(
      [webReceiptPath, ...screenshots.map((name) => path.join(options.outputDir, name))]
        .map(async (target) => (await stat(target)).mode & 0o777),
    );
    assert(
      modes.every((mode) => mode === 0o600),
      "One or more private rendered evidence artifacts is not mode 0600.",
    );
    console.log(JSON.stringify({
      ok: true,
      production: true,
      retained: true,
      renderedNestReadback: true,
      sameCanonicalRecords: true,
      desktop: true,
      phoneWidth: true,
      screenshots: screenshots.length,
      receipt: webReceiptPath,
      productRecordsChanged: false,
      credentialsPrinted: false,
      tokensPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    if (signedIn && !sessionCleared) {
      await clearRenderedSession(page, PRODUCTION_ORIGIN, identity.role).catch(() => {});
    }
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
