#!/usr/bin/env node

import assert from "node:assert/strict";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_FORMS_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_COACHING_FORMS_OPERATION=1 to operate fresh coaching forms.",
);
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching forms base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh coaching forms require an operated coaching context.");
const neighborPath = process.env.QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT;
const neighbor = neighborPath
  ? await loadFreshCoachingAcceptanceContext({
      baseURL,
      env: {
        ...process.env,
        QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: neighborPath,
      },
    })
  : null;

const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching forms refuse non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const coachContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const clientContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const neighborContext = neighbor
  ? await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    })
  : null;
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const neighborPage = neighborContext ? await neighborContext.newPage() : null;
const formsPath = `/coaching/forms?relationship=${encodeURIComponent(target.engagementId)}`;
const clientWhyNow = `I want a calmer, repeatable coaching practice ${target.roomId.slice(-6)}.`;
const clientChange =
  "I can prepare each conversation and follow through on one clear commitment.";

try {
  const coachPassword = readRetainedQAPassword({
    service: target.keychainService,
    account: target.identities.coach.email,
  });
  assert(coachPassword, "Fresh coach Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: coachPage,
    baseURL,
    identity: target.identities.coach,
    password: coachPassword,
    callbackPath: formsPath,
  });
  await coachPage
    .getByRole("heading", { name: "Reflect without the paperwork maze." })
    .waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(
    coachPage.locator("main").last(),
    "fresh coach forms at phone width",
  );

  const firstConversationCard = coachPage
    .locator("article")
    .filter({
      has: coachPage.getByRole("heading", { name: "First conversation" }),
    })
    .first();
  await firstConversationCard.waitFor({ timeout: 30_000 });
  const addButton = firstConversationCard.getByRole("button", {
    name: "Add to library",
    exact: true,
  });
  const starterAction = firstConversationCard.getByRole("button", {
    name: /^(Add to library|Send to a client)$/,
  });
  await starterAction.waitFor({ timeout: 20_000 });
  if ((await starterAction.innerText()).trim() === "Add to library") {
    const [publishResponse] = await Promise.all([
      coachPage.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" &&
          new URL(candidate.url()).pathname === "/api/coaching/forms",
      ),
      addButton.click(),
    ]);
    const publishPacket = await publishResponse.json().catch(() => null);
    assert(
      publishResponse.ok() && publishPacket?.ok === true,
      `Starter form publication failed: ${JSON.stringify(publishPacket)}`,
    );
  } else {
    await firstConversationCard
      .getByRole("button", { name: "Send to a client", exact: true })
      .click();
  }

  const sendPanel = coachPage
    .locator("section")
    .filter({ has: coachPage.getByText("Send privately", { exact: true }) })
    .first();
  await sendPanel.waitFor({ timeout: 20_000 });
  const clientSelect = sendPanel.getByLabel("Client");
  await clientSelect.selectOption(target.engagementId);
  const [assignmentResponse] = await Promise.all([
    coachPage.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/coaching/forms",
    ),
    sendPanel.getByRole("button", { name: "Send form", exact: true }).click(),
  ]);
  const assignmentPacket = await assignmentResponse.json().catch(() => null);
  assert(
    assignmentResponse.ok() && assignmentPacket?.ok === true,
    `Form assignment failed: ${JSON.stringify(assignmentPacket)}`,
  );
  const assignmentId = assignmentPacket.result?.id;
  assert.match(assignmentId || "", /^[A-Za-z0-9_-]{8,240}$/);

  const persistedAssignment =
    await prisma.coachingFormAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        engagementId: true,
        bookingId: true,
        callRoomId: true,
        assignedByUserId: true,
        assignedToUserId: true,
        templateVersion: { select: { revision: true, definitionJson: true } },
      },
    });
  assert.equal(persistedAssignment.engagementId, target.engagementId);
  assert.equal(
    persistedAssignment.assignedByUserId,
    target.identities.coach.userId,
  );
  assert.equal(
    persistedAssignment.assignedToUserId,
    target.identities.client.userId,
  );
  assert.equal(persistedAssignment.templateVersion.revision, 1);

  const clientPassword = readRetainedQAPassword({
    service: target.keychainService,
    account: target.identities.client.email,
  });
  assert(clientPassword, "Fresh client Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page: clientPage,
    baseURL,
    identity: target.identities.client,
    password: clientPassword,
    callbackPath: `/coaching/forms?assignment=${encodeURIComponent(assignmentId)}`,
  });
  await clientPage
    .getByRole("heading", { name: "First conversation", exact: true })
    .last()
    .waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(
    clientPage.locator("main").last(),
    "fresh client form at phone width",
  );
  await clientPage
    .getByLabel("What brings you to coaching right now? required")
    .fill(clientWhyNow);
  await clientPage
    .getByLabel(
      "What change would make this coaching feel worthwhile? required",
    )
    .fill(clientChange);
  const [draftResponse] = await Promise.all([
    clientPage.waitForResponse(
      (candidate) =>
        candidate.request().method() === "PUT" &&
        new URL(candidate.url()).pathname ===
          `/api/coaching/forms/${assignmentId}/response`,
    ),
    clientPage
      .getByRole("button", { name: "Save private draft", exact: true })
      .click(),
  ]);
  const draftPacket = await draftResponse.json().catch(() => null);
  assert(
    draftResponse.ok() && draftPacket?.ok === true,
    `Private draft save failed: ${JSON.stringify(draftPacket)}`,
  );

  await coachPage.reload({ waitUntil: "domcontentloaded" });
  const coachAssignment = coachPage
    .getByRole("region", { name: "Sent forms" })
    .locator("details")
    .filter({ hasText: "First conversation" })
    .first();
  await coachAssignment
    .getByText("Client draft in progress", { exact: true })
    .waitFor();
  await coachAssignment.locator("summary").click();
  await coachAssignment
    .getByText("Draft answers remain private.", { exact: false })
    .waitFor();
  assert.equal(
    await coachAssignment.getByText(clientWhyNow, { exact: true }).count(),
    0,
    "Coach saw an unsubmitted client draft.",
  );

  await clientPage.reload({ waitUntil: "domcontentloaded" });
  await clientPage
    .getByRole("button", { name: "Share with my coach", exact: true })
    .waitFor();
  const [submitResponse] = await Promise.all([
    clientPage.waitForResponse(
      (candidate) =>
        candidate.request().method() === "PUT" &&
        new URL(candidate.url()).pathname ===
          `/api/coaching/forms/${assignmentId}/response`,
    ),
    clientPage
      .getByRole("button", { name: "Share with my coach", exact: true })
      .click(),
  ]);
  const submitPacket = await submitResponse.json().catch(() => null);
  assert(
    submitResponse.ok() && submitPacket?.ok === true,
    `Form submission failed: ${JSON.stringify(submitPacket)}`,
  );

  await coachPage.reload({ waitUntil: "domcontentloaded" });
  const submittedAssignment = coachPage
    .getByRole("region", { name: "Sent forms" })
    .locator("details")
    .filter({ hasText: "First conversation" })
    .first();
  await submittedAssignment
    .getByText("Shared by client", { exact: true })
    .waitFor();
  await submittedAssignment.locator("summary").click();
  await submittedAssignment.getByText(clientWhyNow, { exact: true }).waitFor();
  await submittedAssignment.getByText(clientChange, { exact: true }).waitFor();

  let neighboringAccountDenied = null;
  if (neighbor && neighborPage) {
    const neighborPassword = readRetainedQAPassword({
      service: neighbor.keychainService,
      account: neighbor.identities.coach.email,
    });
    assert(
      neighborPassword,
      "Neighbor coach Keychain password is unavailable.",
    );
    await signInThroughRenderedLogin({
      page: neighborPage,
      baseURL,
      identity: neighbor.identities.coach,
      password: neighborPassword,
      callbackPath: `/coaching/forms?assignment=${encodeURIComponent(assignmentId)}`,
    });
    neighboringAccountDenied = await neighborPage.evaluate(
      async ({ assignmentId }) => {
        const list = await fetch("/api/coaching/forms", { cache: "no-store" });
        const listPacket = await list.json();
        const write = await fetch(
          `/api/coaching/forms/${encodeURIComponent(assignmentId)}/response`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: crypto.randomUUID(),
              state: "DRAFT",
              answers: {},
            }),
          },
        );
        return {
          listStatus: list.status,
          listContainsAssignment: Boolean(
            listPacket?.result?.assignments?.some(
              (item) => item.id === assignmentId,
            ),
          ),
          writeStatus: write.status,
        };
      },
      { assignmentId },
    );
    assert.deepEqual(neighboringAccountDenied, {
      listStatus: 200,
      listContainsAssignment: false,
      writeStatus: 404,
    });
  }

  const readback = await prisma.coachingFormAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: {
      status: true,
      currentResponseRevision: true,
      responseRevisions: {
        orderBy: { revision: "asc" },
        select: { state: true, actorUserId: true, answersJson: true },
      },
    },
  });
  assert.equal(readback.status, "SUBMITTED");
  assert.deepEqual(
    readback.responseRevisions.map((item) => item.state),
    ["DRAFT", "SUBMITTED"],
  );
  assert.equal(
    readback.responseRevisions.every(
      (item) => item.actorUserId === target.identities.client.userId,
    ),
    true,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        testLane: target.testLane,
        fixtureIdentifiersUsed: target.fixtureIdentifiersUsed,
        humanAcceptanceSatisfied: false,
        contextPath: target.contextPath,
        engagementId: target.engagementId,
        roomId: target.roomId,
        assignmentId,
        coachPublishedStarterThroughRenderedProduct: true,
        coachAssignedExactVersionThroughRenderedProduct: true,
        clientSavedPrivateDraftThroughRenderedProduct: true,
        draftHiddenFromCoach: true,
        clientSubmittedThroughRenderedProduct: true,
        submittedResponseVisibleToCoach: true,
        phoneWidthOverflow: false,
        neighboringAccountDenied,
        boundaries: {
          productFormsOnlyForWrites: true,
          directDatabaseWrites: false,
          externalSideEffects: false,
          immutableAssignedVersion: true,
          clientDraftPrivateUntilSubmit: true,
          humanNoviceAcceptanceProven: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await clearRenderedSession(coachPage, baseURL, "fresh coach forms").catch(
    () => undefined,
  );
  await clearRenderedSession(clientPage, baseURL, "fresh client forms").catch(
    () => undefined,
  );
  if (neighborPage) {
    await clearRenderedSession(
      neighborPage,
      baseURL,
      "neighbor coach forms",
    ).catch(() => undefined);
  }
  await coachContext.close();
  await clientContext.close();
  await neighborContext?.close();
  await browser.close();
  await prisma.$disconnect();
}
