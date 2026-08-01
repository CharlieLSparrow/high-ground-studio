#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { chmod, link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { requireProductionNativeReceipt } from "./quipsly-retained-production-project-web-readback.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRODUCTION_ORIGIN = "https://nest.quipsly.com";
const KEYCHAIN_SERVICE = "quipsly-capture-reviewer";
const OPERATOR_EMAIL = "codex@dev.test";
const PRIOR_WEB_SCHEMA = "quipsly-retained-production-project-web-readback-v1";
const RECEIPT_SCHEMA = "quipsly-retained-production-follow-through-operation-v1";
const TIMEZONE = "America/Denver";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireExternalPath(value, label) {
  const raw = typeof value === "string" ? value.trim() : "";
  assert(raw && path.isAbsolute(raw), `${label} must be an explicit absolute path.`);
  const resolved = path.resolve(raw);
  assert(resolved !== "/" && resolved !== REPO_ROOT, `${label} is too broad.`);
  assert(!resolved.startsWith(`${REPO_ROOT}${path.sep}`), `${label} must stay outside the Git worktree.`);
  return resolved;
}

function requireIsoFuture(value, label) {
  const raw = typeof value === "string" ? value.trim() : "";
  const timestamp = Date.parse(raw);
  assert(raw && Number.isFinite(timestamp), `${label} must be an ISO-8601 instant.`);
  assert(timestamp > Date.now(), `${label} must still be in the future.`);
  return new Date(timestamp).toISOString();
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") return { help: true };
    if (!["--native-receipt", "--prior-web-receipt", "--output-dir", "--operation-key", "--focus-start", "--remind-at", "--due-at"].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    values.set(key, argv[index + 1] ?? "");
    index += 1;
  }
  const nativeReceipt = requireExternalPath(values.get("--native-receipt"), "Native receipt");
  const priorWebReceipt = requireExternalPath(values.get("--prior-web-receipt"), "Prior web receipt");
  assert(nativeReceipt.endsWith(".json"), "Native receipt must be a JSON file.");
  assert(priorWebReceipt.endsWith(".json"), "Prior web receipt must be a JSON file.");
  const operationKey = String(values.get("--operation-key") || "").trim();
  assert(/^[a-z0-9][a-z0-9-]{2,80}$/.test(operationKey), "Operation key must be a stable lowercase slug.");
  const focusStart = requireIsoFuture(values.get("--focus-start"), "Focus start");
  const remindAt = requireIsoFuture(values.get("--remind-at"), "Reminder time");
  const dueAt = requireIsoFuture(values.get("--due-at"), "Due time");
  assert(Date.parse(remindAt) <= Date.parse(focusStart), "Reminder must not follow the focus start.");
  assert(Date.parse(focusStart) < Date.parse(dueAt), "Task due time must follow the focus start.");
  assert(Date.parse(dueAt) - Date.now() <= 24 * 3_600_000, "Task due time must stay within Today's 24-hour attention window.");
  return {
    help: false,
    nativeReceipt,
    priorWebReceipt,
    outputDir: requireExternalPath(values.get("--output-dir"), "Output directory"),
    operationKey,
    focusStart,
    remindAt,
    dueAt,
  };
}

export function requirePriorWebReadback(value, nativeReceiptPath, nativeReceipt) {
  assert(
    value?.schema === PRIOR_WEB_SCHEMA && value?.ok === true && value?.origin === PRODUCTION_ORIGIN,
    "Prior web receipt is not a successful production readback.",
  );
  assert(value.nativeReceipt === nativeReceiptPath, "Prior web receipt does not cite the exact native receipt path.");
  assert(
    value?.records?.project?.id === nativeReceipt.records.project.id &&
      value?.records?.task?.id === nativeReceipt.records.task.id &&
      value?.records?.note?.id === nativeReceipt.records.note.id &&
      value?.records?.goal?.id === nativeReceipt.records.goal.id &&
      value?.records?.tag?.id === nativeReceipt.records.tag.id,
    "Prior web receipt does not prove the same stable production records.",
  );
  assert(
    value?.boundaries?.productRecordsChanged === false &&
      value?.boundaries?.externalSideEffects === false &&
      value?.boundaries?.browserExceptions === 0 &&
      value?.boundaries?.serverFailures === 0,
    "Prior web receipt lost its read-only, error-free boundary.",
  );
  return value;
}

function localInputForIso(value, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
}

async function ensureMissing(target, label) {
  try {
    await stat(target);
    throw new Error(`${label} already exists; refusing to overwrite it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function requirePrivateJson(target, label) {
  const mode = (await stat(target)).mode & 0o777;
  assert(mode === (fsConstants.S_IRUSR | fsConstants.S_IWUSR), `${label} must remain mode 0600.`);
  return JSON.parse(await readFile(target, "utf8"));
}

async function privateScreenshot(page, target) {
  await ensureMissing(target, "Screenshot");
  await page.screenshot({ path: target, fullPage: true });
  await chmod(target, 0o600);
}

async function writePrivateAtomicReceipt(target, value) {
  await ensureMissing(target, "Operation receipt");
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await link(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function openRoute(page, pathAndQuery, heading) {
  const response = await page.goto(`${PRODUCTION_ORIGIN}${pathAndQuery}`, { waitUntil: "load" });
  assert(response?.status() === 200, `${new URL(response?.url() || `${PRODUCTION_ORIGIN}${pathAndQuery}`).pathname} returned HTTP ${response?.status()}.`);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page.getByRole("main").last(), pathAndQuery);
}

async function getPrivateJson(page, pathAndQuery) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { headers: { accept: "application/json" } });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, `${PRODUCTION_ORIGIN}${pathAndQuery}`);
}

function requireWorkSnapshot(response, records) {
  assert(response.status === 200 && response.body?.ok === true, "Production mobile Work readback failed.");
  assert(response.body?.workspaceKind === "quipsly-mobile-work-v1", "Production mobile Work contract changed.");
  assert(response.body?.selectedProjectId === records.project.id, "Mobile Work selected a different project.");
  assert(response.body?.boundaries?.actorScoped === true && response.body?.boundaries?.externalSideEffects === false, "Mobile Work lost its actor-scoped no-side-effect boundary.");
  const workspace = response.body.workspace;
  const task = workspace?.tasks?.find((item) => item.id === records.task.id);
  const goal = workspace?.goals?.find((item) => item.id === records.goal.id);
  const note = workspace?.notes?.find((item) => item.id === records.note.id);
  const tag = workspace?.tags?.find((item) => item.id === records.tag.id);
  assert(task && goal && note && tag, "Mobile Work lost one of the exact retained production records.");
  assert(task.title === records.task.title && goal.title === records.goal.title && note.stableId === records.note.stableId, "Mobile Work changed a retained title or stable document identity.");
  assert(tag.label === records.tag.label && tag.usageCount === 3, "Shared retained tag lost its exact three-record use.");
  return { task, goal, note, tag };
}

function requireTodaySnapshot(response, records) {
  assert(response.status === 200 && response.body?.ok === true, "Production mobile Today readback failed.");
  assert(response.body?.briefKind === "quipsly-mobile-today-v1", "Production mobile Today contract changed.");
  assert(
    response.body?.boundaries?.appOwnedRecords === true &&
      response.body?.boundaries?.externalCalendarMutated === false &&
      response.body?.boundaries?.providerMutated === false &&
      response.body?.boundaries?.sourceMutated === false,
    "Production mobile Today lost its app-owned no-external-mutation boundary.",
  );
  const task = response.body.tasks?.find((item) => item.id === records.task.id);
  const goal = response.body.goals?.find((item) => item.id === records.goal.id);
  const focusBlocks = response.body.focusBlocks?.filter((item) => item.targetType === "task" && item.targetId === records.task.id) ?? [];
  return { task, goal, focusBlocks, boundaries: response.body.boundaries };
}

async function waitForWorkState(page, records, predicate, description) {
  await page.waitForFunction(async ({ projectId, description: ignored }) => {
    void ignored;
    const response = await fetch(`/api/mobile/capture/work?projectId=${encodeURIComponent(projectId)}`);
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true;
  }, { projectId: records.project.id, description }, { timeout: 30_000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snapshot = requireWorkSnapshot(await getPrivateJson(page, `/api/mobile/capture/work?projectId=${encodeURIComponent(records.project.id)}`), records);
    if (predicate(snapshot)) return snapshot;
    await page.waitForTimeout(500);
  }
  throw new Error(`${description} did not reach the exact canonical mobile Work readback.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:production-follow-through -- \\
    --native-receipt "/absolute/private/native-operation.json" \\
    --prior-web-receipt "/absolute/private/web-readback.json" \\
    --output-dir "/absolute/private/new-follow-through-directory" \\
    --operation-key "production-follow-through-2026-08-01-a" \\
    --focus-start "2026-08-01T15:00:00.000Z" \\
    --remind-at "2026-08-01T14:45:00.000Z" \\
    --due-at "2026-08-02T05:00:00.000Z"

This retained production operation uses the existing .test account and the exact
iPhone-created Task and Goal. It schedules a private Quipsly focus block, saves
canonical reminder intent, links the same Task to the Goal, records progress
evidence, and proves the same IDs through Project, Work, Today, Calendar, Search,
mobile Work, and mobile Today. Exact partial state is resumable; unrelated state
fails closed. No provider calendar, message, publication, or external action is made.`);
    return;
  }

  await ensureMissing(options.outputDir, "Output directory");
  const nativeReceipt = requireProductionNativeReceipt(await requirePrivateJson(options.nativeReceipt, "Native production receipt"));
  requirePriorWebReadback(await requirePrivateJson(options.priorWebReceipt, "Prior web readback receipt"), options.nativeReceipt, nativeReceipt);
  await mkdir(options.outputDir, { recursive: false, mode: 0o700 });

  const records = nativeReceipt.records;
  const progressPercent = 25;
  const progressNote = `QA Retained · ${options.operationKey} · first production follow-through checkpoint.`;
  const focusEndsAt = new Date(Date.parse(options.focusStart) + 50 * 60_000).toISOString();
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained production operator has no Keychain password.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: TIMEZONE,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const serverFailures = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === PRODUCTION_ORIGIN && response.status() >= 500) serverFailures.push({ path: url.pathname, status: response.status() });
  });
  let signedIn = false;
  let sessionCleared = false;
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL: PRODUCTION_ORIGIN,
      identity: { role: "retained-production-follow-through", email: OPERATOR_EMAIL },
      password,
      callbackPath: `/work?task=${encodeURIComponent(records.task.id)}`,
    });
    signedIn = true;

    const initialWork = requireWorkSnapshot(
      await getPrivateJson(page, `/api/mobile/capture/work?projectId=${encodeURIComponent(records.project.id)}`),
      records,
    );
    assert(initialWork.task.status === "OPEN", "Retained Task is no longer open.");
    assert(initialWork.goal.status === "ACTIVE", "Retained Goal is no longer active.");
    assert(initialWork.task.dueAt === null || initialWork.task.dueAt === options.dueAt, "Retained Task has an unrelated due time.");
    assert(initialWork.task.reminder === null || (initialWork.task.reminder.remindAt === options.remindAt && initialWork.task.reminder.status === "ACTIVE"), "Retained Task has unrelated reminder intent.");
    assert(initialWork.goal.progressPercent === null || (initialWork.goal.progressPercent === progressPercent && initialWork.goal.progressNote === progressNote), "Retained Goal has unrelated progress evidence.");

    await openRoute(page, `/work?task=${encodeURIComponent(records.task.id)}`, "Work Queue");
    let focusedTask = page.locator(`#work-task-${records.task.id}`);
    await focusedTask.waitFor({ timeout: 30_000 });
    assert(await focusedTask.getAttribute("aria-current") === "true", "Work did not focus the exact retained Task.");

    if (initialWork.task.dueAt === null) {
      await focusedTask.getByText("Edit task", { exact: true }).click();
      await focusedTask.getByLabel("Edit due date (optional)").fill(localInputForIso(options.dueAt));
      await focusedTask.getByRole("button", { name: "Save task changes" }).click();
      await waitForWorkState(page, records, (snapshot) => snapshot.task.dueAt === options.dueAt, "Task due-time mutation");
    }
    await page.goto(`${PRODUCTION_ORIGIN}/work?task=${encodeURIComponent(records.task.id)}`, { waitUntil: "load" });
    focusedTask = page.locator(`#work-task-${records.task.id}`);
    await focusedTask.waitFor({ timeout: 30_000 });

    const afterDue = requireWorkSnapshot(await getPrivateJson(page, `/api/mobile/capture/work?projectId=${encodeURIComponent(records.project.id)}`), records);
    if (afterDue.task.reminder === null) {
      await focusedTask.getByText("Add reminder", { exact: true }).click();
      await focusedTask.getByLabel("Remind me").fill(localInputForIso(options.remindAt));
      await focusedTask.getByRole("button", { name: "Save reminder" }).click();
      await waitForWorkState(page, records, (snapshot) => snapshot.task.reminder?.remindAt === options.remindAt && snapshot.task.reminder?.status === "ACTIVE", "Task reminder mutation");
    }

    await openRoute(page, `/work?goal=${encodeURIComponent(records.goal.id)}`, "Work Queue");
    let focusedGoal = page.locator(`#work-goal-${records.goal.id}`);
    await focusedGoal.waitFor({ timeout: 30_000 });
    assert(await focusedGoal.getAttribute("aria-current") === "true", "Work did not focus the exact retained Goal.");
    const linkedTask = focusedGoal.getByRole("link", { name: new RegExp(escapeRegExp(records.task.title)) });
    if (await linkedTask.count() === 0) {
      await focusedGoal.getByText("Connect another committed task", { exact: true }).click();
      await focusedGoal.getByLabel("Committed task").selectOption(records.task.id);
      await focusedGoal.getByRole("button", { name: "Connect" }).click();
      await focusedGoal.getByText("Task linked to this goal. Neither record changed status.", { exact: true }).waitFor({ timeout: 30_000 });
    }

    await page.goto(`${PRODUCTION_ORIGIN}/work?goal=${encodeURIComponent(records.goal.id)}`, { waitUntil: "load" });
    focusedGoal = page.locator(`#work-goal-${records.goal.id}`);
    await focusedGoal.waitFor({ timeout: 30_000 });
    const afterLink = requireWorkSnapshot(await getPrivateJson(page, `/api/mobile/capture/work?projectId=${encodeURIComponent(records.project.id)}`), records);
    if (afterLink.goal.progressPercent === null) {
      await focusedGoal.getByLabel("Progress").selectOption(String(progressPercent));
      await focusedGoal.getByLabel("Evidence note").fill(progressNote);
      await focusedGoal.getByRole("button", { name: "Save progress" }).click();
      await waitForWorkState(page, records, (snapshot) => snapshot.goal.progressPercent === progressPercent && snapshot.goal.progressNote === progressNote, "Goal progress mutation");
    }

    const initialToday = requireTodaySnapshot(await getPrivateJson(page, "/api/mobile/capture/today"), records);
    const exactExistingBlocks = initialToday.focusBlocks.filter((block) => block.startsAt === options.focusStart && block.endsAt === focusEndsAt && block.status === "PLANNED");
    assert(exactExistingBlocks.length <= 1, "Retained Task already has duplicate exact focus blocks.");
    if (exactExistingBlocks.length === 0) {
      await openRoute(page, "/schedule", "Time for the work you actually chose.");
      await page.getByLabel("Work to focus on").selectOption(`task:${records.task.id}`);
      await page.getByLabel("Start").fill(localInputForIso(options.focusStart));
      await page.getByLabel("Length").first().selectOption("50");
      await page.getByRole("button", { name: "Plan focus" }).click();
      await page.getByText("Personal focus block saved. No external calendar event, task deadline, or goal target changed.", { exact: true }).waitFor({ timeout: 30_000 });
    }

    const finalWork = requireWorkSnapshot(await getPrivateJson(page, `/api/mobile/capture/work?projectId=${encodeURIComponent(records.project.id)}`), records);
    const finalToday = requireTodaySnapshot(await getPrivateJson(page, "/api/mobile/capture/today"), records);
    const exactBlocks = finalToday.focusBlocks.filter((block) => block.startsAt === options.focusStart && block.endsAt === focusEndsAt && block.status === "PLANNED");
    assert(finalWork.task.dueAt === options.dueAt, "Final mobile Work Task due time differs from the rendered mutation.");
    assert(finalWork.task.reminder?.remindAt === options.remindAt && finalWork.task.reminder?.status === "ACTIVE", "Final mobile Work reminder differs from canonical intent.");
    assert(finalWork.goal.progressPercent === progressPercent && finalWork.goal.progressNote === progressNote, "Final mobile Work Goal progress differs from rendered evidence.");
    assert(finalToday.task?.dueAt === options.dueAt && finalToday.task?.reminder?.remindAt === options.remindAt, "Mobile Today did not return the same Task and reminder identity.");
    assert(finalToday.goal?.progressPercent === progressPercent && finalToday.goal?.progressNote === progressNote, "Mobile Today did not return the same Goal progress.");
    assert(exactBlocks.length === 1, "Mobile Today did not return exactly one intended focus block for the same Task ID.");

    await openRoute(page, `/nests/${encodeURIComponent(records.project.slug)}?view=work`, "Project follow-through");
    assert(await page.getByRole("link", { name: records.task.title, exact: true }).first().getAttribute("href") === `/work?task=${encodeURIComponent(records.task.id)}`, "Project lost the exact Task route.");
    assert(await page.getByRole("link", { name: new RegExp(`^${escapeRegExp(records.goal.title)}`) }).first().getAttribute("href") === `/work?goal=${encodeURIComponent(records.goal.id)}`, "Project lost the exact Goal route.");

    await openRoute(page, "/schedule", "Time for the work you actually chose.");
    const calendarTaskLink = page.getByRole("link", { name: records.task.title, exact: true }).first();
    await calendarTaskLink.waitFor({ timeout: 30_000 });
    assert(await calendarTaskLink.getAttribute("href") === `/work?task=${encodeURIComponent(records.task.id)}`, "Calendar focus block did not open the same Task ID.");
    await page.getByText(`#${records.tag.label}`, { exact: true }).first().waitFor({ timeout: 30_000 });
    await privateScreenshot(page, path.join(options.outputDir, "calendar-follow-through-desktop.png"));

    await openRoute(page, `/find?q=${encodeURIComponent(records.task.title)}`, "Search all of Quipsly");
    const searchTaskLink = page.getByRole("link", { name: new RegExp(`^${escapeRegExp(records.task.title)}`) }).first();
    await searchTaskLink.waitFor({ timeout: 30_000 });
    assert(await searchTaskLink.getAttribute("href") === `/work?task=${encodeURIComponent(records.task.id)}`, "Search did not route to the same Task ID.");
    await privateScreenshot(page, path.join(options.outputDir, "search-follow-through-desktop.png"));

    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, "/today", "Do the next useful thing. Keep the rest quiet.");
    const todayTaskLink = page.getByRole("link", { name: records.task.title, exact: true }).first();
    const todayGoalLink = page.getByRole("link", { name: records.goal.title, exact: true }).first();
    await todayTaskLink.waitFor({ timeout: 30_000 });
    await todayGoalLink.waitFor({ timeout: 30_000 });
    assert(await todayTaskLink.getAttribute("href") === `/work?task=${encodeURIComponent(records.task.id)}`, "Today did not route to the same Task ID.");
    assert(await todayGoalLink.getAttribute("href") === `/work?goal=${encodeURIComponent(records.goal.id)}`, "Today did not route to the same Goal ID.");
    await privateScreenshot(page, path.join(options.outputDir, "today-follow-through-phone-width.png"));

    await openRoute(page, `/work?goal=${encodeURIComponent(records.goal.id)}`, "Work Queue");
    focusedGoal = page.locator(`#work-goal-${records.goal.id}`);
    await focusedGoal.waitFor({ timeout: 30_000 });
    const relationshipLink = focusedGoal.getByRole("link", { name: new RegExp(escapeRegExp(records.task.title)) }).first();
    await relationshipLink.waitFor({ timeout: 30_000 });
    assert(await relationshipLink.getAttribute("href") === `/work?task=${encodeURIComponent(records.task.id)}`, "Goal relationship did not preserve the same Task ID.");
    await focusedGoal.getByText(`Progress: ${progressPercent}%`, { exact: true }).waitFor({ timeout: 30_000 });
    await focusedGoal.getByText(new RegExp(escapeRegExp(progressNote))).waitFor({ timeout: 30_000 });
    await privateScreenshot(page, path.join(options.outputDir, "goal-follow-through-phone-width.png"));

    assert(pageErrors.length === 0, `Rendered production operation raised browser errors: ${pageErrors.join(" | ")}`);
    assert(serverFailures.length === 0, `Rendered production operation received server failures: ${JSON.stringify(serverFailures)}`);
    await clearRenderedSession(page, PRODUCTION_ORIGIN, "retained-production-follow-through");
    sessionCleared = true;

    const screenshots = [
      "calendar-follow-through-desktop.png",
      "search-follow-through-desktop.png",
      "today-follow-through-phone-width.png",
      "goal-follow-through-phone-width.png",
    ];
    const receiptPath = path.join(options.outputDir, "operation.json");
    await writePrivateAtomicReceipt(receiptPath, {
      schema: RECEIPT_SCHEMA,
      ok: true,
      completedAt: new Date().toISOString(),
      origin: PRODUCTION_ORIGIN,
      operationKey: options.operationKey,
      nativeReceipt: options.nativeReceipt,
      priorWebReceipt: options.priorWebReceipt,
      identity: { email: OPERATOR_EMAIL, renderedLogin: true },
      records: {
        project: { id: records.project.id, slug: records.project.slug },
        task: { id: records.task.id, dueAt: options.dueAt, reminder: { remindAt: options.remindAt, status: "ACTIVE" } },
        goal: { id: records.goal.id, progressPercent, progressNote, taskLinked: true },
        focusBlock: { id: exactBlocks[0].id, targetType: "task", targetId: records.task.id, startsAt: options.focusStart, endsAt: focusEndsAt, status: "PLANNED", timezone: TIMEZONE },
        note: { id: records.note.id, stableId: records.note.stableId, unchanged: true },
        tag: { id: records.tag.id, label: records.tag.label, usageCount: 3 },
      },
      surfaces: { project: true, work: true, today: true, calendar: true, search: true, mobileWork: true, mobileToday: true, phoneWidth: true, horizontalOverflow: false },
      evidence: { directory: options.outputDir, screenshots },
      boundaries: {
        retainedArtifacts: true,
        privateArtifacts: true,
        credentialsFromKeychain: true,
        credentialsPrinted: false,
        tokensPrinted: false,
        browserSessionCleared: true,
        browserExceptions: 0,
        serverFailures: 0,
        canonicalProductRecordsChanged: true,
        sourceMediaChanged: false,
        externalCalendarMutated: false,
        externalMessagesSent: false,
        publicationChanged: false,
        externalSideEffects: false,
        cleanupPerformed: false,
      },
    });
    const modes = await Promise.all([receiptPath, ...screenshots.map((name) => path.join(options.outputDir, name))].map(async (target) => (await stat(target)).mode & 0o777));
    assert(modes.every((mode) => mode === 0o600), "One or more retained private evidence artifacts is not mode 0600.");
    console.log(JSON.stringify({ ok: true, production: true, retained: true, sameTaskAcrossSurfaces: true, sameGoalAcrossSurfaces: true, focusBlockCreated: true, reminderIntentSaved: true, progressRecorded: true, screenshots: screenshots.length, receipt: receiptPath, credentialsPrinted: false, tokensPrinted: false, externalSideEffects: false }, null, 2));
  } finally {
    if (signedIn && !sessionCleared) await clearRenderedSession(page, PRODUCTION_ORIGIN, "retained-production-follow-through").catch(() => {});
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
