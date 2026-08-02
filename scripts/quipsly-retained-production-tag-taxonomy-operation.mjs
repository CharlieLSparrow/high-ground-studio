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
const RECEIPT_SCHEMA = "quipsly-retained-production-tag-taxonomy-operation-v1";

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

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") return { help: true };
    if (!["--native-receipt", "--output-dir", "--operation-key"].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    values.set(key, argv[index + 1] ?? "");
    index += 1;
  }
  const nativeReceipt = requireExternalPath(values.get("--native-receipt"), "Native receipt");
  assert(nativeReceipt.endsWith(".json"), "Native receipt must be a JSON file.");
  const operationKey = String(values.get("--operation-key") || "").trim();
  assert(/^[a-z0-9][a-z0-9-]{2,32}$/.test(operationKey), "Operation key must be a stable lowercase slug of at most 33 characters.");
  return {
    help: false,
    nativeReceipt,
    outputDir: requireExternalPath(values.get("--output-dir"), "Output directory"),
    operationKey,
  };
}

export function taxonomyLabels(operationKey) {
  const typo = `QA Retained · ${operationKey} systm`;
  const canonicalAlias = `QA Retained · ${operationKey} system`;
  assert(typo.length <= 80 && canonicalAlias.length <= 80, "Generated retained labels exceed the product tag limit.");
  return { typo, canonicalAlias };
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
  assert(response?.status() === 200, `${pathAndQuery} returned HTTP ${response?.status()}.`);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page.getByRole("main").last(), pathAndQuery);
}

async function getWorkSnapshot(page, records) {
  const result = await page.evaluate(async ({ origin, projectId }) => {
    const response = await fetch(`${origin}/api/mobile/capture/work?projectId=${encodeURIComponent(projectId)}`, {
      headers: { accept: "application/json" },
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { origin: PRODUCTION_ORIGIN, projectId: records.project.id });
  assert(result.status === 200 && result.body?.ok === true, "Production mobile Work readback failed.");
  assert(result.body?.workspaceKind === "quipsly-mobile-work-v1", "Production mobile Work contract changed.");
  assert(result.body?.selectedProjectId === records.project.id, "Mobile Work selected a different project.");
  assert(result.body?.boundaries?.actorScoped === true && result.body?.boundaries?.externalSideEffects === false, "Mobile Work lost its actor-scoped no-side-effect boundary.");
  const workspace = result.body.workspace;
  const task = workspace?.tasks?.find((item) => item.id === records.task.id);
  const note = workspace?.notes?.find((item) => item.id === records.note.id);
  const goal = workspace?.goals?.find((item) => item.id === records.goal.id);
  const target = workspace?.tags?.find((item) => item.id === records.tag.id);
  assert(task && note && goal && target, "Retained Task, Note, Goal, or canonical Tag disappeared.");
  assert(note.stableId === records.note.stableId, "Retained Note stable identity changed.");
  return { workspace, task, note, goal, target };
}

async function waitForSnapshot(page, records, predicate, description) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = await getWorkSnapshot(page, records);
    if (predicate(snapshot)) return snapshot;
    await page.waitForTimeout(500);
  }
  throw new Error(`${description} did not reach canonical mobile Work readback.`);
}

async function openTagManager(page, records) {
  await openRoute(page, `/work?manage=tags&project=${encodeURIComponent(records.project.id)}`, "Tags");
  await page.getByRole("heading", { name: records.project.name, exact: true }).waitFor({ timeout: 30_000 });
}

async function manageTag(page, label, { showArchived = false } = {}) {
  if (showArchived) {
    const archivedToggle = page.getByLabel("Show archived");
    if (!(await archivedToggle.isChecked())) await archivedToggle.check();
  }
  const search = page.getByRole("searchbox", { name: "Find a tag or former name" });
  await search.fill(label);
  const manage = page.getByRole("button", { name: `Manage ${label}`, exact: true });
  await manage.waitFor({ timeout: 30_000 });
  await manage.click();
}

async function previewAndMerge(page, sourceLabel, targetLabel) {
  await manageTag(page, sourceLabel);
  await page.getByText("Merge into another tag", { exact: true }).click();
  await page.getByLabel("Canonical target").selectOption({ label: targetLabel });
  await page.getByRole("button", { name: "Preview merge", exact: true }).click();
  await page.getByText("Preview verified. Review the exact impact before confirming.", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel(new RegExp("I reviewed this exact impact")).check();
  await page.getByRole("button", { name: `Merge into #${targetLabel}`, exact: true }).click();
  await page.getByText(new RegExp(`now redirects to #${targetLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).waitFor({ timeout: 30_000 });
}

async function previewAndRollback(page, sourceLabel) {
  await manageTag(page, sourceLabel, { showArchived: true });
  await page.getByText("Inspect merge receipt & rollback", { exact: true }).click();
  await page.getByRole("button", { name: "Preview exact rollback", exact: true }).click();
  await page.getByText("Receipt verified. Review exactly what will be restored and preserved.", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel(new RegExp("I reviewed this receipt")).check();
  await page.getByRole("button", { name: `Restore #${sourceLabel}`, exact: true }).click();
  await page.getByText(new RegExp(`^#${sourceLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is independent again`)).waitFor({ timeout: 30_000 });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:production-tag-taxonomy -- \\
    --native-receipt "/absolute/private/native-operation.json" \\
    --output-dir "/absolute/private/new-taxonomy-directory" \\
    --operation-key "tag-taxonomy-a"

This retained production operation signs the fixed .test account into rendered
Nest, creates a deliberately misspelled test tag on the retained Task, renames
it while preserving the former label as an alias, merges it into the existing
canonical tag, proves exact rollback, and re-merges it into the canonical final
state. It never touches real collaborators or external systems.`);
    return;
  }

  await ensureMissing(options.outputDir, "Output directory");
  const nativeReceipt = requireProductionNativeReceipt(await requirePrivateJson(options.nativeReceipt, "Native production receipt"));
  await mkdir(options.outputDir, { recursive: false, mode: 0o700 });
  const records = nativeReceipt.records;
  const labels = taxonomyLabels(options.operationKey);
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained production operator has no Keychain password.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
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
      identity: { role: "retained-production-tag-taxonomy", email: OPERATOR_EMAIL },
      password,
      callbackPath: `/work?task=${encodeURIComponent(records.task.id)}`,
    });
    signedIn = true;

    let snapshot = await getWorkSnapshot(page, records);
    assert(snapshot.target.label === records.tag.label && snapshot.target.usageCount === 3, "Canonical retained Tag no longer has exact three-record use.");
    let source = snapshot.workspace.tags.find((tag) => tag.label === labels.canonicalAlias || tag.label === labels.typo);
    const exactMergedState = source?.mergedInto?.id === records.tag.id
      && snapshot.target.aliases.some((alias) => alias.label === labels.typo)
      && snapshot.target.aliases.some((alias) => alias.label === labels.canonicalAlias);
    assert(!source || source.aliases.some((alias) => alias.label === labels.typo) || source.label === labels.typo || exactMergedState, "Operation label already belongs to unrelated taxonomy state.");

    if (!source) {
      await openRoute(page, `/work?task=${encodeURIComponent(records.task.id)}`, "Work Queue");
      const task = page.locator(`#work-task-${records.task.id}`);
      await task.waitFor({ timeout: 30_000 });
      await task.getByText(`Edit ${records.project.name} tags`, { exact: true }).click();
      await task.getByLabel("New reusable tag").fill(labels.typo);
      await task.getByRole("button", { name: "Create & apply", exact: true }).click();
      await task.getByText(`#${labels.typo} was created for ${records.project.name} and applied here.`, { exact: true }).waitFor({ timeout: 30_000 });
      snapshot = await waitForSnapshot(page, records, (value) => value.task.tagLabels.includes(labels.typo), "Test tag creation and assignment");
      source = snapshot.workspace.tags.find((tag) => tag.label === labels.typo);
    }
    assert(source, "Created retained taxonomy source Tag is missing.");

    if (source.label === labels.typo) {
      await openTagManager(page, records);
      await manageTag(page, labels.typo);
      await page.getByLabel(`Rename ${labels.typo}`).fill(labels.canonicalAlias);
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await page.getByText(`Renamed to #${labels.canonicalAlias}. The former name remains a reusable alias.`, { exact: true }).waitFor({ timeout: 30_000 });
      snapshot = await waitForSnapshot(page, records, (value) => value.workspace.tags.some((tag) => tag.id === source.id && tag.label === labels.canonicalAlias && tag.aliases.some((alias) => alias.label === labels.typo)), "Tag rename and alias preservation");
      source = snapshot.workspace.tags.find((tag) => tag.id === source.id);
    }

    await openTagManager(page, records);
    await page.getByRole("searchbox", { name: "Find a tag or former name" }).fill(labels.typo);
    await page.getByRole("button", { name: `Manage ${source.mergedInto ? records.tag.label : labels.canonicalAlias}`, exact: true }).waitFor({ timeout: 30_000 });
    await privateScreenshot(page, path.join(options.outputDir, "tag-former-name-search-desktop.png"));

    snapshot = await getWorkSnapshot(page, records);
    source = snapshot.workspace.tags.find((tag) => tag.id === source.id);
    if (!source.mergedInto) {
      await openTagManager(page, records);
      await previewAndMerge(page, labels.canonicalAlias, records.tag.label);
      snapshot = await waitForSnapshot(page, records, (value) => value.workspace.tags.some((tag) => tag.id === source.id && tag.mergedInto?.id === records.tag.id), "Initial exact tag merge");
    }

    await openTagManager(page, records);
    await previewAndRollback(page, labels.canonicalAlias);
    snapshot = await waitForSnapshot(page, records, (value) => {
      const restored = value.workspace.tags.find((tag) => tag.id === source.id);
      return restored && !restored.mergedInto && value.task.tagIds.includes(source.id) && value.task.tagIds.includes(records.tag.id);
    }, "Exact tag merge rollback");
    await openTagManager(page, records);
    await page.getByRole("searchbox", { name: "Find a tag or former name" }).fill(labels.canonicalAlias);
    await page.getByRole("button", { name: `Manage ${labels.canonicalAlias}`, exact: true }).click();
    await privateScreenshot(page, path.join(options.outputDir, "tag-rollback-restored-desktop.png"));

    await openTagManager(page, records);
    await previewAndMerge(page, labels.canonicalAlias, records.tag.label);
    const finalSnapshot = await waitForSnapshot(page, records, (value) => {
      const merged = value.workspace.tags.find((tag) => tag.id === source.id);
      return merged?.mergedInto?.id === records.tag.id && !value.task.tagIds.includes(source.id) && value.task.tagIds.includes(records.tag.id);
    }, "Final canonical re-merge");
    const finalSource = finalSnapshot.workspace.tags.find((tag) => tag.id === source.id);
    assert(finalSnapshot.target.aliases.some((alias) => alias.label === labels.typo), "Final canonical Tag lost the original former-name alias.");
    assert(finalSnapshot.target.aliases.some((alias) => alias.label === labels.canonicalAlias), "Final canonical Tag lost the redirected source label.");
    assert(finalSnapshot.target.usageCount === 3, "Canonical Tag did not retain exact deduplicated Task, Note, and Goal use.");
    assert(finalSnapshot.note.tagIds.includes(records.tag.id) && finalSnapshot.goal.tagIds.includes(records.tag.id), "Final merge disturbed the retained Note or Goal tag identity.");

    await page.setViewportSize({ width: 390, height: 844 });
    await openTagManager(page, records);
    await page.getByLabel("Show archived").check();
    await page.getByRole("searchbox", { name: "Find a tag or former name" }).fill(labels.canonicalAlias);
    await page.getByRole("button", { name: `Manage ${labels.canonicalAlias}`, exact: true }).click();
    await page.getByText(`Merged into #${records.tag.label}. Older captures using this name resolve to the canonical tag.`, { exact: true }).waitFor({ timeout: 30_000 });
    await privateScreenshot(page, path.join(options.outputDir, "tag-final-merge-phone-width.png"));

    assert(pageErrors.length === 0, `Rendered taxonomy operation raised browser errors: ${pageErrors.join(" | ")}`);
    assert(serverFailures.length === 0, `Rendered taxonomy operation received server failures: ${JSON.stringify(serverFailures)}`);
    await clearRenderedSession(page, PRODUCTION_ORIGIN, "retained-production-tag-taxonomy");
    sessionCleared = true;

    const screenshots = ["tag-former-name-search-desktop.png", "tag-rollback-restored-desktop.png", "tag-final-merge-phone-width.png"];
    const receiptPath = path.join(options.outputDir, "operation.json");
    await writePrivateAtomicReceipt(receiptPath, {
      schema: RECEIPT_SCHEMA,
      ok: true,
      completedAt: new Date().toISOString(),
      origin: PRODUCTION_ORIGIN,
      operationKey: options.operationKey,
      nativeReceipt: options.nativeReceipt,
      identity: { email: OPERATOR_EMAIL, renderedLogin: true },
      records: {
        project: { id: records.project.id, slug: records.project.slug },
        task: { id: records.task.id, canonicalTagId: records.tag.id },
        note: { id: records.note.id, stableId: records.note.stableId, canonicalTagId: records.tag.id },
        goal: { id: records.goal.id, canonicalTagId: records.tag.id },
        sourceTag: { id: finalSource.id, label: finalSource.label, aliases: finalSource.aliases, mergedInto: finalSource.mergedInto },
        canonicalTag: { id: finalSnapshot.target.id, label: finalSnapshot.target.label, usageCount: finalSnapshot.target.usageCount },
      },
      lifecycle: { createdAndAssigned: true, renamed: true, formerNameSearchable: true, merged: true, exactRollbackApplied: true, remerged: true, finalRedirectPreserved: true },
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
        realCollaboratorRecordsChanged: false,
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
    console.log(JSON.stringify({ ok: true, production: true, retained: true, tagCreated: true, aliasPreserved: true, mergeRollbackProved: true, canonicalFinalState: true, screenshots: screenshots.length, receipt: receiptPath, credentialsPrinted: false, tokensPrinted: false, externalSideEffects: false }, null, 2));
  } finally {
    if (signedIn && !sessionCleared) await clearRenderedSession(page, PRODUCTION_ORIGIN, "retained-production-tag-taxonomy").catch(() => {});
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
