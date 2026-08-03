#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function requireLoopbackDatabaseUrl(value) {
  const url = new URL(String(value || ""));
  assert(
    url.protocol === "postgresql:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && Boolean(url.pathname.slice(1)),
    "Client follow-up attention operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function canonicalSnapshot(prisma, outputId) {
  const output = await prisma.sessionOutput.findUniqueOrThrow({
    where: { id: outputId },
    select: {
      id: true,
      roomId: true,
      status: true,
      title: true,
      revision: true,
      recipientUserId: true,
      contentSha256: true,
      bodyJson: true,
      releasedAt: true,
      updatedAt: true,
      deliveries: {
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          kind: true,
          status: true,
          actorUserId: true,
          recipientUserId: true,
          contentSha256: true,
          occurredAt: true,
        },
      },
    },
  });
  const body = output.bodyJson || {};
  const taskIds = Array.isArray(body.tasks) ? body.tasks.map((item) => item.id) : [];
  const goalIds = Array.isArray(body.goals) ? body.goals.map((item) => item.id) : [];
  const [tasks, goals, calendarCount] = await Promise.all([
    prisma.actionItem.findMany({
      where: { id: { in: taskIds } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, title: true, detail: true, dueAt: true, updatedAt: true },
    }),
    prisma.goal.findMany({
      where: { id: { in: goalIds } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, title: true, description: true, targetAt: true, updatedAt: true },
    }),
    prisma.calendarEventLink.count(),
  ]);
  return normalize({ output, tasks, goals, calendarCount });
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const databaseURL = requireLoopbackDatabaseUrl(process.env.DATABASE_URL);
  const artifactRoot = process.env.QUIPSLY_RETAINED_CLIENT_ATTENTION_ARTIFACT_ROOT
    || "/Volumes/My Passport/Quipsly QA Artifacts/Client Follow-up Today Attention 2026-08-03";
  const artifactDirectory = path.join(artifactRoot, stamp());
  await mkdir(artifactDirectory, { recursive: true });

  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: CLIENT_EMAIL,
  });
  assert(password, "The retained client Keychain password is unavailable.");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL }),
    log: ["error"],
  });
  const latest = await prisma.sessionOutput.findFirstOrThrow({
    where: {
      kind: "CLIENT_FOLLOW_UP",
      status: "RELEASED",
      recipient: { primaryEmail: CLIENT_EMAIL },
    },
    orderBy: [{ releasedAt: "desc" }, { revision: "desc" }, { id: "desc" }],
    select: { id: true, roomId: true, title: true, contentSha256: true, revision: true, recipientUserId: true },
  });
  const before = await canonicalSnapshot(prisma, latest.id);
  assert(
    !before.output.deliveries.some((event) => event.kind === "OPENED_IN_APP"),
    "The latest retained release already has an open receipt; prepare a new explicit local test release before rerunning.",
  );

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "client", email: CLIENT_EMAIL },
      password,
      callbackPath: "/today",
    });
    const attention = page.getByTestId("today-client-follow-up-attention");
    await attention.waitFor({ timeout: 30_000 });
    await attention.getByRole("heading", { name: latest.title, exact: true }).waitFor();
    await attention.getByText(/Opening the Session does not complete a task or goal/i).waitFor();
    const open = attention.getByRole("link", { name: "Open follow-up", exact: true });
    assert(
      await open.getAttribute("href")
        === `/sessions/${encodeURIComponent(latest.roomId)}?mode=outputs#client-follow-up`,
      "Today did not retain the exact released Session identity.",
    );
    await assertNoHorizontalOverflow(attention, "client Today follow-up attention");
    await attention.screenshot({ path: path.join(artifactDirectory, "client-today-attention.png") });

    await open.click();
    await page.waitForURL((url) => (
      url.pathname === `/sessions/${latest.roomId}`
      && url.searchParams.get("mode") === "outputs"
    ), { timeout: 30_000 });
    const followUp = page.locator("#client-follow-up");
    await followUp.waitFor({ timeout: 30_000 });
    await followUp.getByRole("heading", { name: latest.title, exact: true }).waitFor();
    await followUp.getByText(/does not complete its goals or tasks/i).waitFor();
    const confirm = followUp.getByRole("button", { name: "Confirm follow-up opened", exact: true });
    assert(await confirm.isEnabled(), "The exact recipient could not explicitly confirm the released snapshot.");
    await assertNoHorizontalOverflow(followUp, "client Session follow-up");
    await followUp.screenshot({ path: path.join(artifactDirectory, "client-session-before-confirm.png") });
    await confirm.click();
    await followUp.getByText(/recipient-confirmed in-app open receipt for this exact content hash/i).waitFor({ timeout: 30_000 });
    await followUp.getByRole("button", { name: "Confirm follow-up opened", exact: true }).waitFor();
    await followUp.screenshot({ path: path.join(artifactDirectory, "client-session-after-confirm.png") });

    await page.goto(`${baseURL}/today`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Do the next useful thing/i }).waitFor({ timeout: 30_000 });
    assert(
      await page.getByTestId("today-client-follow-up-attention").count() === 0,
      "Acknowledged follow-up remained in the new-attention position on Today.",
    );
    await page.screenshot({ path: path.join(artifactDirectory, "client-today-after-confirm.png"), fullPage: true });
    await clearRenderedSession(page, baseURL, "client");
  } finally {
    await context.close();
    await browser.close();
  }

  const after = await canonicalSnapshot(prisma, latest.id);
  const openEvents = after.output.deliveries.filter((event) => event.kind === "OPENED_IN_APP");
  assert(openEvents.length === 1, "Explicit recipient confirmation did not create exactly one open receipt.");
  assert(
    openEvents[0].status === "CONFIRMED"
      && openEvents[0].actorUserId === latest.recipientUserId
      && openEvents[0].recipientUserId === latest.recipientUserId
      && openEvents[0].contentSha256 === latest.contentSha256,
    "The open receipt did not preserve exact recipient and content-hash identity.",
  );
  assert(after.output.status === before.output.status, "Recipient readback changed release status.");
  assert(after.output.revision === before.output.revision, "Recipient readback changed release revision.");
  assert(after.output.contentSha256 === before.output.contentSha256, "Recipient readback rewrote the release body hash.");
  assert(JSON.stringify(after.tasks) === JSON.stringify(before.tasks), "Recipient readback mutated a canonical task.");
  assert(JSON.stringify(after.goals) === JSON.stringify(before.goals), "Recipient readback mutated a canonical goal.");
  assert(after.calendarCount === before.calendarCount, "Recipient readback mutated Calendar evidence.");
  assert(pageErrors.length === 0, `Rendered client operation raised ${pageErrors.length} browser exception(s).`);

  const receipt = {
    schema: "quipsly-retained-client-follow-up-attention-operation-v1",
    operatedAt: new Date().toISOString(),
    baseURL,
    output: {
      id: latest.id,
      roomId: latest.roomId,
      title: latest.title,
      revision: latest.revision,
      contentSha256: latest.contentSha256,
    },
    boundaries: {
      intendedRecipientOnly: true,
      exactSessionHandoff: true,
      acknowledgmentExplicit: true,
      releasedSnapshotMutated: false,
      canonicalTaskMutated: false,
      canonicalGoalMutated: false,
      providerCalendarMutated: false,
      externalMessageSent: false,
      publicationPerformed: false,
    },
    artifacts: {
      directory: artifactDirectory,
      todayBefore: "client-today-attention.png",
      sessionBefore: "client-session-before-confirm.png",
      sessionAfter: "client-session-after-confirm.png",
      todayAfter: "client-today-after-confirm.png",
    },
  };
  await writeFile(
    path.join(artifactDirectory, "client-follow-up-attention-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 },
  );
  await prisma.$disconnect();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
