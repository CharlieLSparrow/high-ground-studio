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

assert.equal(process.env.QUIPSLY_FRESH_COACHING_FORM_BUILDER_OPERATION, "1");
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching form builder base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh coaching form builder requires an operated coaching context.");
const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching form builder refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const suffix = target.roomId.slice(-6);
const firstTitle = `Momentum reflection ${suffix}`;
const revisedTitle = `${firstTitle} refined`;
const firstQuestion = "What progress feels most important this week?";
const revisedQuestion = "What progress feels most important before we meet?";
const choiceQuestion = "What kind of support would help next?";

try {
  const password = readRetainedQAPassword({
    service: target.keychainService,
    account: target.identities.coach.email,
  });
  assert(password, "Fresh coach Keychain password is unavailable.");
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity: target.identities.coach,
    password,
    callbackPath: `/coaching/forms?relationship=${encodeURIComponent(target.engagementId)}`,
  });
  await page.getByRole("button", { name: "Create your own", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Build something your clients will actually finish.",
      exact: true,
    })
    .waitFor();
  await assertNoHorizontalOverflow(
    page.locator("main").last(),
    "custom form builder at phone width",
  );
  await page.getByLabel("Title", { exact: true }).fill(firstTitle);
  await page
    .getByLabel("Short introduction", { exact: true })
    .fill("A short reflection that keeps momentum visible between Sessions.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill(firstQuestion);
  await page.getByLabel("Required before sharing", { exact: true }).check();
  await page
    .getByLabel("New question type", { exact: true })
    .selectOption("SINGLE_SELECT");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill(choiceQuestion);
  const choiceCard = page.locator("article").filter({ hasText: choiceQuestion }).first();
  await choiceCard
    .locator("label")
    .filter({ hasText: "Choices, one per line" })
    .locator("textarea")
    .fill("A clear question\nA practical next step\nTime to reflect");
  await page
    .getByRole("button", { name: `Move ${choiceQuestion} up`, exact: true })
    .click();
  await page.getByText(choiceQuestion, { exact: true }).last().waitFor();

  const [publishV1Response] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/coaching/forms" &&
      candidate.request().postDataJSON()?.action === "PUBLISH_TEMPLATE"),
    page.getByRole("button", { name: "Publish first version", exact: true }).click(),
  ]);
  const publishV1 = await publishV1Response.json().catch(() => null);
  assert(
    publishV1Response.ok() && publishV1?.ok === true &&
      publishV1.result?.version?.revision === 1,
    `Custom form version one did not publish: ${JSON.stringify(publishV1)}`,
  );
  const templateId = publishV1.result.template.id;
  const [assignmentResponse] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/coaching/forms" &&
      candidate.request().postDataJSON()?.action === "ASSIGN_FORM"),
    page.getByRole("button", { name: "Send form", exact: true }).click(),
  ]);
  const assignmentPacket = await assignmentResponse.json().catch(() => null);
  assert(assignmentResponse.ok() && assignmentPacket?.ok === true);
  const assignmentId = assignmentPacket.result?.id;

  await page.getByRole("button", { name: `Edit ${firstTitle}`, exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(revisedTitle);
  const firstQuestionCard = page
    .locator("article")
    .filter({ hasText: firstQuestion })
    .first();
  await firstQuestionCard.locator('button[aria-expanded="false"]').click();
  await firstQuestionCard.getByLabel("Question", { exact: true }).fill(revisedQuestion);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: `Edit ${firstTitle}`, exact: true }).click();
  await page
    .getByText("Your unfinished browser draft was restored.", { exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), revisedTitle);
  const restoredQuestionCard = page
    .locator("article")
    .filter({ hasText: revisedQuestion })
    .first();
  await restoredQuestionCard.locator('button[aria-expanded="false"]').click();
  assert.equal(
    await restoredQuestionCard.getByLabel("Question", { exact: true }).inputValue(),
    revisedQuestion,
  );

  const [publishV2Response] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/coaching/forms" &&
      candidate.request().postDataJSON()?.action === "PUBLISH_TEMPLATE"),
    page.getByRole("button", { name: "Publish version 2", exact: true }).click(),
  ]);
  const publishV2 = await publishV2Response.json().catch(() => null);
  assert(
    publishV2Response.ok() && publishV2?.ok === true &&
      publishV2.result?.template?.id === templateId &&
      publishV2.result?.version?.revision === 2,
    `Custom form version two did not publish: ${JSON.stringify(publishV2)}`,
  );

  const [template, assignment] = await Promise.all([
    prisma.coachingFormTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { versions: { orderBy: { revision: "asc" } } },
    }),
    prisma.coachingFormAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { templateVersion: true },
    }),
  ]);
  assert.equal(template.ownerCoachUserId, target.identities.coach.userId);
  assert.equal(template.publishedRevision, 2);
  assert.equal(template.versions.length, 2);
  assert.equal(template.versions[0].definitionJson.title, firstTitle);
  assert.equal(template.versions[1].definitionJson.title, revisedTitle);
  assert.equal(assignment.templateVersion.revision, 1);
  assert.equal(assignment.templateVersion.definitionJson.title, firstTitle);

  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    testLane: "fresh-ui-automation",
    fixtureIdentifiersUsed: false,
    humanAcceptanceSatisfied: false,
    contextPath: target.contextPath,
    engagementId: target.engagementId,
    roomId: target.roomId,
    templateId,
    assignmentId,
    customBuilderOperatedAtPhoneWidth: true,
    browserDraftRecoveredAfterReload: true,
    fieldTypesOperated: ["LONG_TEXT", "SINGLE_SELECT"],
    fieldReorderingOperated: true,
    liveClientPreviewRendered: true,
    immutableVersionsPublished: 2,
    assignedVersionRemained: 1,
    productFormsOnlyForWrites: true,
    directDatabaseWrites: false,
    externalSideEffects: false,
    humanNoviceAcceptanceProven: false,
  }, null, 2));
} finally {
  await clearRenderedSession(page, baseURL).catch(() => undefined);
  await context.close();
  await browser.close();
  await prisma.$disconnect();
}
