#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
  process.env.QUIPSLY_FRESH_COACHING_FORM_AUTOMATION_OPERATION,
  "1",
);
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching form automation base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh coaching form automation requires an operated context.");
const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching form automation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const firebaseProjectId =
  process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "quipsly-reef";
if (!getApps().length) initializeApp({ projectId: firebaseProjectId });
const auth = getAuth();

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const callbackPath = `/coaching/forms?relationship=${encodeURIComponent(target.engagementId)}`;
const runSuffix = randomUUID().slice(0, 6);
const beforeTitle = `Session compass ${runSuffix}`;
const afterTitle = `Session reflection ${runSuffix}`;

async function createSimpleForm({ title, question }) {
  await page.getByRole("button", { name: "Create your own", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Build something your clients will actually finish.",
      exact: true,
    })
    .waitFor();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Short introduction", { exact: true })
    .fill("A short reflection placed around this exact coaching Session.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill(question);
  await page.getByLabel("Required before sharing", { exact: true }).check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/coaching/forms" &&
        candidate.request().postDataJSON()?.action === "PUBLISH_TEMPLATE",
    ),
    page.getByRole("button", { name: "Publish first version", exact: true }).click(),
  ]);
  const packet = await response.json().catch(() => null);
  assert(
    response.ok() && packet?.ok === true && packet.result?.version?.revision === 1,
    JSON.stringify(packet),
  );
  await page.getByRole("heading", { name: title, exact: true }).last().waitFor();
  return packet.result.template.id;
}

async function addRhythm({ title, trigger }) {
  await page.getByRole("button", { name: "Add rhythm", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "What should happen around each Session?",
      exact: true,
    })
    .waitFor();
  const setup = page
    .getByRole("heading", {
      name: "What should happen around each Session?",
      exact: true,
    })
    .locator("xpath=../../..");
  await setup
    .locator("label")
    .filter({ hasText: /^Form/ })
    .locator("select")
    .selectOption({ label: `${title} · v1` });
  await setup
    .locator("label")
    .filter({ hasText: /^Client/ })
    .locator("select")
    .selectOption(target.engagementId);
  await setup
    .locator("label")
    .filter({ hasText: /^When/ })
    .locator("select")
    .selectOption(trigger);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/coaching/forms" &&
        candidate.request().postDataJSON()?.action ===
          "SAVE_AUTOMATION_POLICY",
    ),
    page.getByRole("button", { name: "Save rhythm", exact: true }).click(),
  ]);
  const packet = await response.json().catch(() => null);
  assert(response.ok() && packet?.ok === true, JSON.stringify(packet));
  return packet.result.policy.id;
}

try {
  const coachPassword = readRetainedQAPassword({
    service: target.keychainService,
    account: target.identities.coach.email,
  });
  const clientPassword = readRetainedQAPassword({
    service: target.keychainService,
    account: target.identities.client.email,
  });
  assert(coachPassword && clientPassword, "Fresh QA Keychain passwords are unavailable.");
  for (const [identity, password] of [
    [target.identities.coach, coachPassword],
    [target.identities.client, clientPassword],
  ]) {
    const existing = await auth.getUserByEmail(identity.email).catch((error) => {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    });
    if (existing) {
      await auth.updateUser(existing.uid, {
        password,
        emailVerified: true,
        displayName: identity.displayName,
      });
    } else {
      await auth.createUser({
        email: identity.email,
        password,
        emailVerified: true,
        displayName: identity.displayName,
      });
    }
  }

  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity: target.identities.coach,
    password: coachPassword,
    callbackPath,
  });
  await page
    .getByRole("heading", { name: "Set it once. Stay in control.", exact: true })
    .waitFor();
  await assertNoHorizontalOverflow(
    page.locator("main").last(),
    "empty automation workspace at phone width",
  );

  const beforeTemplateId = await createSimpleForm({
    title: beforeTitle,
    question: "What would make this Session especially useful?",
  });
  const beforePolicyId = await addRhythm({
    title: beforeTitle,
    trigger: "BEFORE_SESSION",
  });
  const beforeCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: beforeTitle, exact: true }),
  }).last();
  await beforeCard.getByText("Active", { exact: true }).waitFor();
  await beforeCard.getByText(/1 receipt/).waitFor();
  await beforeCard.getByText(/1 day before each Session/).waitFor();

  const [pauseResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.request().postDataJSON()?.action === "SAVE_AUTOMATION_POLICY",
    ),
    beforeCard.getByRole("button", { name: "Pause", exact: true }).click(),
  ]);
  assert(pauseResponse.ok());
  await beforeCard.getByText("Paused", { exact: true }).waitFor();
  const [resumeResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.request().postDataJSON()?.action === "SAVE_AUTOMATION_POLICY",
    ),
    beforeCard.getByRole("button", { name: "Resume", exact: true }).click(),
  ]);
  assert(resumeResponse.ok());
  await page.getByText(`${beforeTitle} automation is active.`, { exact: true }).waitFor();

  const afterTemplateId = await createSimpleForm({
    title: afterTitle,
    question: "What do you want to carry forward from this Session?",
  });
  const afterPolicyId = await addRhythm({
    title: afterTitle,
    trigger: "AFTER_SESSION",
  });
  const afterCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: afterTitle, exact: true }),
  }).last();
  await afterCard.getByText("No forms sent yet", { exact: false }).waitFor();
  await afterCard.locator("summary").click();
  const [sendNowResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.request().postDataJSON()?.action ===
          "SAVE_AUTOMATION_OVERRIDE",
    ),
    afterCard.getByRole("button", { name: "Send now", exact: true }).click(),
  ]);
  const sendNowPacket = await sendNowResponse.json().catch(() => null);
  assert(sendNowResponse.ok() && sendNowPacket?.result?.reconciliation?.created === 1);
  await page.getByText(`${afterTitle} was sent now.`, { exact: true }).waitFor();
  await assertNoHorizontalOverflow(
    page.locator("main").last(),
    "operated automation workspace at phone width",
  );

  const policies = await prisma.coachingFormAutomationPolicy.findMany({
    where: { id: { in: [beforePolicyId, afterPolicyId] } },
    include: {
      revisions: { orderBy: { revision: "asc" } },
      receipts: {
        include: { assignment: true, templateVersion: true },
      },
      overrides: { orderBy: { revision: "asc" } },
    },
  });
  assert.equal(policies.length, 2);
  const before = policies.find((policy) => policy.id === beforePolicyId);
  const after = policies.find((policy) => policy.id === afterPolicyId);
  assert.equal(before?.status, "ACTIVE");
  assert.equal(before?.revision, 3);
  assert.equal(before?.revisions.length, 3);
  assert.equal(before?.receipts.length, 1);
  assert.equal(after?.receipts.length, 1);
  assert.equal(after?.receipts[0].manualOverride, true);
  assert.equal(after?.overrides.at(-1)?.action, "SEND_NOW");
  assert(
    policies.every((policy) =>
      policy.receipts.every(
        (receipt) =>
          receipt.assignment.templateVersionId === receipt.templateVersionId &&
          receipt.assignment.engagementId === target.engagementId,
      ),
    ),
  );

  await clearRenderedSession(page, baseURL);
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity: target.identities.client,
    password: clientPassword,
    callbackPath,
  });
  const outstandingHeading = page.getByRole("heading", {
    name: /reflections? to complete/,
  });
  await outstandingHeading.waitFor();
  const outstandingText = await outstandingHeading.innerText();
  const outstandingCount = Number(outstandingText.match(/^\d+/)?.[0] || 0);
  assert(
    outstandingCount >= 2,
    `The client did not receive both automated forms: ${outstandingText}`,
  );
  assert.equal(
    await page.getByText("Automatic rhythm", { exact: true }).count(),
    0,
  );
  await page.getByText(beforeTitle, { exact: true }).last().waitFor();
  await page.getByText(afterTitle, { exact: true }).last().waitFor();
  await assertNoHorizontalOverflow(
    page.locator("main").last(),
    "client automatic assignments at phone width",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        testLane: "fresh-ui-automation",
        fixtureIdentifiersUsed: false,
        humanAcceptanceSatisfied: false,
        contextPath: target.contextPath,
        engagementId: target.engagementId,
        bookingId: target.bookingId,
        roomId: target.roomId,
        beforeTemplateId,
        afterTemplateId,
        beforePolicyId,
        afterPolicyId,
        beforeTitle,
        afterTitle,
        coachCreatedPoliciesInRenderedProduct: 2,
        automaticAssignmentReceipts: 2,
        policyPauseResumeRevisions: 3,
        manualSendNowReceipt: true,
        clientReadback: true,
        phoneWidthOperated: true,
        productFormsOnlyForWrites: true,
        directDatabaseWrites: false,
        externalSideEffects: false,
        humanNoviceAcceptanceProven: false,
      },
      null,
      2,
    ),
  );
} finally {
  await clearRenderedSession(page, baseURL).catch(() => undefined);
  await context.close();
  await browser.close();
  await prisma.$disconnect();
}
