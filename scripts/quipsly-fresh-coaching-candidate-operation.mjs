#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_CANDIDATE_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_COACHING_CANDIDATE_OPERATION=1 to operate fresh candidate review.",
);

const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching candidate operation base URL",
);
const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(freshContext, "Fresh coaching candidate operation requires an exact private context.");

const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching candidate operation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const coach = freshContext.identities.coach;
const client = freshContext.identities.client;
const room = await prisma.callRoom.findUnique({
  where: { id: freshContext.roomId },
  select: {
    id: true,
    bookingId: true,
    coachingEngagementId: true,
    participants: {
      where: { accessStatus: "ACTIVE" },
      select: { id: true, userId: true },
    },
  },
});
assert.equal(room?.bookingId, freshContext.bookingId);
assert.equal(room?.coachingEngagementId, freshContext.engagementId);
const clientParticipant = room.participants.find(
  (participant) => participant.userId === client.userId,
);
assert(clientParticipant, "Fresh client participant is unavailable.");
const clientSource = await prisma.recordingAsset.findFirst({
  where: {
    roomId: room.id,
    participantId: clientParticipant.id,
    status: "VERIFIED",
    transcriptJobs: { some: { status: "COMPLETED" } },
  },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    transcriptJobs: {
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    },
  },
});
assert(clientSource?.transcriptJobs[0]?.id, "Fresh client transcript source is unavailable.");

const reviewedTitle = "Send the coaching recording to the instructor";
const [actionsBefore, existingAcceptedAction, deliveriesBefore, calendarLinksBefore] = await Promise.all([
  prisma.actionItem.count({ where: { roomId: room.id } }),
  prisma.actionItem.findFirst({
    where: { roomId: room.id, title: reviewedTitle },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  }),
  prisma.deliveryEvent.count(),
  prisma.calendarEventLink.count(),
]);
const password = readRetainedQAPassword({
  service: freshContext.keychainService,
  account: coach.email,
});
assert(password, "Fresh coach Keychain password is unavailable.");

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  const callbackPath = `/sessions/${encodeURIComponent(room.id)}?mode=transcript&source=${encodeURIComponent(clientSource.id)}`;
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity: coach,
    password,
    callbackPath,
  });
  const queueHeading = page.getByRole("heading", {
    name: "Session follow-up",
    exact: true,
  });
  await queueHeading.waitFor({ state: "visible", timeout: 30_000 });
  const queue = queueHeading.locator("xpath=ancestor::section[1]");
  await queue
    .getByText(/Every suggestion stays linked to the exact moment/i)
    .waitFor({ state: "visible", timeout: 20_000 });

  const candidateCreatedThisRun = !existingAcceptedAction;
  if (candidateCreatedThisRun) {
    const taskCard = queue
      .getByRole("button", {
        name: "Review and save task",
        exact: true,
      })
      .locator("xpath=ancestor::article[1]")
      .filter({ hasText: /send the recording to my instructor/i })
      .first();
    await taskCard.waitFor({ state: "visible", timeout: 20_000 });
    await taskCard
      .getByRole("button", { name: "Review and save task", exact: true })
      .click();
    const titleInput = page.getByLabel("Task title", { exact: true });
    await titleInput.waitFor({ state: "visible", timeout: 10_000 });
    await titleInput.fill(reviewedTitle);
    await page
      .getByRole("combobox", { name: /Owner/i })
      .selectOption("me");
    assert.equal(
      await page.getByLabel(/^Due/).inputValue(),
      "",
      "Candidate review inferred a hidden due date instead of leaving it visible and optional.",
    );
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await page
      .getByText(/^Task saved(?:\.| with)/)
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  // The visual middle dot is aria-hidden, so the accessible name is
  // "Done <count>" rather than the exact painted label "Done · <count>".
  await queue.getByRole("button", { name: /^Done\s+\d+/i }).click();
  const decidedCard = queue
    .locator("article")
    .filter({ hasText: reviewedTitle })
    .first();
  await decidedCard.waitFor({ state: "visible", timeout: 20_000 });
  assert.match(
    await decidedCard.innerText(),
    /Saved as a task\./,
    "The decided candidate did not render its durable task readback.",
  );
  const taskLink = decidedCard.getByRole("link", {
    name: "Open task",
    exact: true,
  });
  const taskHref = await taskLink.getAttribute("href");
  assert.match(taskHref || "", /^\/work\?task=[A-Za-z0-9_-]+$/);
  const actionItemId = new URL(taskHref, baseURL).searchParams.get("task");
  assert(actionItemId, "Saved task did not expose its canonical Work identity.");

  const [action, actionsAfter, deliveriesAfter, calendarLinksAfter] =
    await Promise.all([
      prisma.actionItem.findUnique({
        where: { id: actionItemId },
        select: {
          id: true,
          roomId: true,
          assignedUserId: true,
          title: true,
          detail: true,
          dueAt: true,
          status: true,
          sourceJson: true,
        },
      }),
      prisma.actionItem.count({ where: { roomId: room.id } }),
      prisma.deliveryEvent.count(),
      prisma.calendarEventLink.count(),
    ]);
  assert.equal(actionsAfter, actionsBefore + (candidateCreatedThisRun ? 1 : 0));
  assert.equal(action?.roomId, room.id);
  assert.equal(action?.assignedUserId, coach.userId);
  assert.equal(action?.title, reviewedTitle);
  assert.equal(action?.dueAt, null);
  assert.equal(action?.status, "OPEN");
  assert.match(JSON.stringify(action?.sourceJson || {}), /transcript/i);
  assert.match(JSON.stringify(action?.sourceJson || {}), /segment/i);
  assert.equal(deliveriesAfter, deliveriesBefore);
  assert.equal(calendarLinksAfter, calendarLinksBefore);
  assert.equal(pageErrors.length, 0);

  const receiptPath = path.join(
    path.dirname(freshContext.contextPath),
    "candidate-follow-through-receipt.json",
  );
  const receipt = {
    schema: "quipsly-fresh-coaching-candidate-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    testLane: freshContext.testLane,
    fixtureIdentifiersUsed: false,
    humanAcceptanceSatisfied: false,
    contextPath: freshContext.contextPath,
    roomId: room.id,
    transcriptJobId: clientSource.transcriptJobs[0].id,
    recordingAssetId: clientSource.id,
    candidateSuggestionRendered: true,
    candidateEditedBeforeCommit: true,
    candidateCreatedThisRun,
    existingAcceptedCandidateReadback: !candidateCreatedThisRun,
    visibleOwnerConfirmed: true,
    hiddenDueDateInferred: false,
    canonicalActionItemId: action.id,
    canonicalTaskOpenedInWork: taskHref,
    transcriptAndSegmentProvenanceRetained: true,
    deliveryEventCreated: false,
    calendarEventCreated: false,
    pageErrors: 0,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await clearRenderedSession(page, baseURL, coach.role).catch(() => undefined);
  await context.close();
  await browser.close();
  await prisma.$disconnect();
}
