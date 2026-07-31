#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const GOAL_TITLE =
  "QA Retained · Prove one complete Capture-to-Nest episode loop";
const PROGRESS_PERCENT = 25;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function requireLocalDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      Boolean(url.pathname) &&
      url.pathname !== "/",
    "Retained product operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

export function requireRetainedEvidenceNote(value) {
  const note = typeof value === "string" ? value.trim() : "";
  assert(
    note.startsWith("QA Retained · "),
    "Evidence must start with the visible `QA Retained · ` label.",
  );
  assert(note.length <= 800, "Retained progress evidence is limited to 800 characters.");
  return note;
}

export function parseArguments(argv) {
  let note = "";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--note") {
      note = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--help") {
      return { help: true, note: "" };
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return { help: false, note: requireRetainedEvidenceNote(note) };
}

async function loadGoalState(prisma) {
  const user = await prisma.user.findUnique({
    where: { primaryEmail: MEDIA_OPERATOR_EMAIL },
    select: { id: true, isActive: true, emailVerified: true },
  });
  assert(user?.id, "The retained media operator is missing from PostgreSQL.");
  assert(user.isActive, "The retained media operator is inactive.");
  assert(user.emailVerified, "The retained media operator is not verified.");

  const matchingGoals = await prisma.goal.findMany({
    where: { ownerUserId: user.id, title: GOAL_TITLE },
    select: {
      id: true,
      ownerUserId: true,
      updatedAt: true,
      sourceJson: true,
      _count: { select: { progressReceipts: true } },
      progressReceipts: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          actorUserId: true,
          kind: true,
          progressPercent: true,
          note: true,
          evidenceJson: true,
          occurredAt: true,
        },
      },
    },
  });
  const currentGoals = matchingGoals.filter(
    (goal) => goal.sourceJson?.schema !== "quipsly-portable-goal-restore-v1",
  );
  assert(
    currentGoals.length === 1,
    `Expected one current retained goal; found ${currentGoals.length}.`,
  );
  const goal = currentGoals[0];
  assert(goal?.id, "The retained Capture-to-Nest goal is missing.");
  assert(goal.ownerUserId === user.id, "The retained goal owner drifted.");
  return { user, goal };
}

async function operateRenderedProgress({ baseURL, note, password }) {
  const identity = { role: "media-operator", email: MEDIA_OPERATOR_EMAIL };
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let signedIn = false;
  let sessionCleared = false;
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: "/work",
    });
    signedIn = true;
    await page.getByRole("heading", { name: "Work Queue", exact: true }).waitFor();

    const goalCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: GOAL_TITLE, exact: true }),
    });
    await goalCard.waitFor({ timeout: 20_000 });
    await goalCard.getByLabel("Progress", { exact: true }).selectOption(
      String(PROGRESS_PERCENT),
    );
    await goalCard.getByLabel("Evidence note", { exact: true }).fill(note);
    await goalCard.getByRole("button", { name: "Save progress", exact: true }).click();
    await goalCard.getByRole("status").filter({
      hasText: "Progress evidence saved. Goal status did not change automatically.",
    }).waitFor({ timeout: 20_000 });
    await goalCard.getByText(note, { exact: false }).waitFor({ timeout: 20_000 });
    assert(
      pageErrors.length === 0,
      "Retained progress operation raised a browser exception.",
    );
    await clearRenderedSession(page, baseURL, identity.role);
    sessionCleared = true;
    return { sessionCleared, browserExceptions: pageErrors.length };
  } finally {
    if (signedIn && !sessionCleared) {
      await clearRenderedSession(page, baseURL, identity.role).catch(() => {});
    }
    await context.close();
    await browser.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  DATABASE_URL=postgresql://... pnpm quipsly:retained:product-progress -- \\
    --note "QA Retained · Visible progress evidence"

This loopback-only operation signs in through the rendered Work UI, appends one
real progress receipt to the fixed retained Capture-to-Nest goal, preserves it,
and independently reads the canonical receipt back from PostgreSQL.`);
    return;
  }

  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const databaseURL = requireLocalDatabaseUrl(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });

  try {
    const before = await loadGoalState(prisma);
    assert(
      before.goal.progressReceipts[0]?.note !== options.note,
      "This exact evidence is already the latest retained progress receipt; use a new note for a new operation.",
    );
    const rendered = await operateRenderedProgress({
      baseURL,
      note: options.note,
      password,
    });
    const after = await loadGoalState(prisma);
    const latest = after.goal.progressReceipts[0];
    const latestEvidence = latest?.evidenceJson;
    const sourceReceipt = after.goal.sourceJson?.lastProgressReceipt;

    assert(
      after.goal._count.progressReceipts ===
        before.goal._count.progressReceipts + 1,
      "Rendered operation did not append exactly one progress receipt.",
    );
    assert(latest?.kind === "PROGRESS", "Latest goal receipt is not progress evidence.");
    assert(
      latest.progressPercent === PROGRESS_PERCENT,
      "Latest goal progress percentage drifted.",
    );
    assert(latest.note === options.note, "Latest goal progress note drifted.");
    assert(latest.actorUserId === after.user.id, "Latest goal actor drifted.");
    assert(
      latestEvidence?.id && latestEvidence.id === sourceReceipt?.id,
      "Goal source receipt and append-only progress evidence do not agree.",
    );
    assert(
      latestEvidence?.externalSideEffects === false,
      "Goal progress receipt claimed an external side effect.",
    );

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProductMutation: true,
      canonicalReadback: true,
      goalIdSha256: sha256(after.goal.id),
      receiptRowIdSha256: sha256(latest.id),
      receiptEvidenceIdSha256: sha256(latestEvidence.id),
      evidenceNoteSha256: sha256(options.note),
      progressPercent: latest.progressPercent,
      receiptCountBefore: before.goal._count.progressReceipts,
      receiptCountAfter: after.goal._count.progressReceipts,
      sessionClear: rendered.sessionCleared ? "passed" : "failed",
      browserExceptions: rendered.browserExceptions,
      artifactPreserved: true,
      screenshotsCaptured: false,
      secretsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
