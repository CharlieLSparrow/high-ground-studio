#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const enabled =
  process.env.QUIPSLY_RETAINED_COACHING_ENGAGEMENT_BROWSER_OPERATION === "1";
if (!enabled)
  throw new Error(
    "Set QUIPSLY_RETAINED_COACHING_ENGAGEMENT_BROWSER_OPERATION=1 to authorize rendered local dogfood.",
  );
const baseURL = new URL(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
).origin;
const engagementId = "retained-coaching-engagement-20260731";
const clientEmail = "quipsly-client-retained-20260731@example.test";
const outsiderEmail = "quipsly-engagement-outsider-retained@example.test";
const password = `Qp-${randomBytes(18).toString("base64url")}!26`;
const authEmulatorHost =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
if (
  !baseURL.startsWith("http://127.0.0.1:") &&
  !baseURL.startsWith("http://localhost:")
)
  throw new Error("Rendered operation is loopback-only.");

process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.GCLOUD_PROJECT = "quipsly-reef";
process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
process.env.DATABASE_URL =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";

const firebaseApp = initializeApp(
  { projectId: "quipsly-reef" },
  `coaching-engagement-browser-${Date.now()}`,
);
const auth = getAuth(firebaseApp);
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });

async function ensureFirebaseUser(email, uid) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName: uid,
    });
  }
}

try {
  await ensureFirebaseUser(clientEmail, "retained-coaching-engagement-client");
  await ensureFirebaseUser(
    outsiderEmail,
    "retained-coaching-engagement-outsider",
  );
  const clientContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const clientPage = await clientContext.newPage();
  await signInThroughRenderedLogin({
    page: clientPage,
    baseURL,
    identity: { role: "retained coaching client", email: clientEmail },
    password,
    callbackPath: `/coaching/engagements/${engagementId}`,
  });
  await clientPage
    .getByRole("heading", {
      name: "Quipsly Retained Client coaching",
      exact: true,
    })
    .waitFor();
  await clientPage
    .getByText("Engagement-scoped privacy", { exact: true })
    .waitFor();
  await clientPage
    .getByRole("heading", { name: "Sessions", exact: true })
    .waitFor();
  await clientPage
    .getByText("Retained coaching follow-up rehearsal", { exact: true })
    .waitFor();
  await clientPage
    .getByText("QA Retained · Coaching continuity Session 2", { exact: true })
    .waitFor();
  const work = clientPage.getByRole("region", {
    name: "Notes, tasks, and goals",
  });
  await work.waitFor();
  const addWork = work
    .locator("details")
    .filter({ hasText: "Add note, task, or goal" });
  if (!(await addWork.evaluate((element) => element.open))) {
    await addWork.locator("summary").click();
    await addWork.evaluate((element) => {
      if (!element.open)
        throw new Error("The rendered add-work disclosure did not open.");
    });
  }
  const workForm = addWork.locator("form");
  const kindSelect = workForm.locator('select[name="kind"]');
  await kindSelect.selectOption("NOTE");
  const visibilitySelect = workForm.locator('select[name="visibility"]');
  await visibilitySelect.waitFor();
  const visibilityLabel = await visibilitySelect.evaluate(
    (element) => element.closest("label")?.textContent || "",
  );
  if (!visibilityLabel.includes("Who can read it?")) {
    throw new Error("The novice note form did not explain note visibility.");
  }
  if (await workForm.locator('select[name="ownerUserId"]').count()) {
    throw new Error("The novice note form exposed task assignment controls.");
  }
  await kindSelect.selectOption("TASK");
  const ownerSelect = workForm.locator('select[name="ownerUserId"]');
  await ownerSelect.waitFor();
  const ownerLabel = await ownerSelect.evaluate(
    (element) => element.closest("label")?.textContent || "",
  );
  if (!ownerLabel.includes("Who owns it?")) {
    throw new Error("The novice task form did not explain task ownership.");
  }
  await workForm.locator('input[name="targetAt"]').waitFor();
  if (await workForm.locator('select[name="visibility"]').count()) {
    throw new Error("The novice task form exposed note privacy controls.");
  }
  await kindSelect.selectOption("NOTE");
  async function createRelationshipWork({ kind, title, body }) {
    if (await work.getByText(title, { exact: true }).count())
      return "already retained";
    if (!(await addWork.evaluate((element) => element.open))) {
      await addWork.locator("summary").click();
    }
    await workForm.locator('select[name="kind"]').selectOption(kind);
    await workForm.locator('input[name="title"]').fill(title);
    await workForm.locator('textarea[name="body"]').fill(body);
    await workForm
      .getByRole("button", { name: "Save to coaching home", exact: true })
      .click();
    await work.getByText(title, { exact: true }).waitFor();
    return "created through rendered coaching home";
  }

  const noteOperation = await createRelationshipWork({
    kind: "NOTE",
    title: "Retained relationship reflection",
    body: "Carry this shared reflection into the next coaching Session.",
  });
  const taskOperation = await createRelationshipWork({
    kind: "TASK",
    title: "Retained between-session practice",
    body: "Practice once, then bring the result back to the next Session.",
  });
  const goalOperation = await createRelationshipWork({
    kind: "GOAL",
    title: "Retained coaching relationship goal",
    body: "Keep one durable goal visible across both retained Sessions.",
  });
  const taskCard = work
    .locator("article")
    .filter({ hasText: "Retained between-session practice" });
  const completeTask = taskCard.getByRole("button", {
    name: "Complete",
    exact: true,
  });
  let taskStatusOperation = "already completed";
  if (await completeTask.count()) {
    const [statusResponse] = await Promise.all([
      clientPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/coaching/engagements/${engagementId}/work` &&
          response.request().method() === "PATCH",
      ),
      completeTask.click(),
    ]);
    const statusBody = await statusResponse.json().catch(() => null);
    if (statusResponse.status() !== 200 || statusBody?.ok !== true) {
      throw new Error(
        `Rendered relationship task completion failed: HTTP ${statusResponse.status()} ${JSON.stringify(statusBody)}`,
      );
    }
    await taskCard.getByText("done", { exact: true }).waitFor();
    taskStatusOperation = "completed through rendered coaching home";
  }
  const retainedWork = await prisma.coachingEngagement.findUnique({
    where: { id: engagementId },
    select: {
      notes: {
        where: { title: "Retained relationship reflection" },
        select: { id: true, visibility: true },
      },
      actionItems: {
        where: { title: "Retained between-session practice" },
        select: { id: true, status: true, assignedUserId: true },
      },
      goals: {
        where: { title: "Retained coaching relationship goal" },
        select: { id: true, status: true, ownerUserId: true },
      },
    },
  });
  if (
    retainedWork?.notes.length !== 1 ||
    retainedWork.notes[0].visibility !== "SESSION_SHARED"
  )
    throw new Error(
      "Rendered relationship note did not persist once as shared work.",
    );
  if (
    retainedWork?.actionItems.length !== 1 ||
    retainedWork.actionItems[0].status !== "DONE"
  )
    throw new Error(
      "Rendered relationship task did not persist once as completed work.",
    );
  if (
    retainedWork?.goals.length !== 1 ||
    retainedWork.goals[0].status !== "ACTIVE"
  )
    throw new Error(
      "Rendered relationship goal did not persist once as active work.",
    );
  await assertNoHorizontalOverflow(
    clientPage.getByRole("main").last(),
    "client Coaching Engagement",
  );

  const message = `Rendered engagement dogfood ${new Date().toISOString()}: continuity survives between Sessions.`;
  await clientPage.getByPlaceholder("Write to everyone here…").fill(message);
  await clientPage
    .getByRole("button", { name: "Send collaboration message" })
    .click();
  await clientPage.getByText(message, { exact: true }).waitFor();
  let persisted = null;
  for (let attempt = 0; attempt < 20 && !persisted; attempt += 1) {
    persisted = await prisma.studioNestChatMessage.findFirst({
      where: { body: message },
      select: {
        id: true,
        thread: { select: { key: true } },
        metadataJson: true,
      },
    });
    if (!persisted) await clientPage.waitForTimeout(100);
  }
  if (persisted?.thread.key !== `engagement:${engagementId}`)
    throw new Error(
      "Rendered message did not persist to the exact engagement thread.",
    );
  await clearRenderedSession(clientPage, baseURL, "retained coaching client");
  await clientContext.close();

  const outsiderContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const outsiderPage = await outsiderContext.newPage();
  await signInThroughRenderedLogin({
    page: outsiderPage,
    baseURL,
    identity: { role: "separate outsider", email: outsiderEmail },
    password,
    callbackPath: "/coaching/engagements",
  });
  const response = await outsiderPage.goto(
    `${baseURL}/coaching/engagements/${engagementId}`,
    { waitUntil: "networkidle" },
  );
  if (response?.status() !== 404)
    throw new Error(
      `Separate outsider received HTTP ${response?.status()} instead of 404.`,
    );
  if (
    await outsiderPage
      .getByText("Quipsly Retained Client coaching", { exact: true })
      .count()
  )
    throw new Error("Separate outsider saw the private engagement title.");
  await outsiderContext.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        testLane: "retained-regression",
        humanAcceptanceSatisfied: false,
        fixtureIdentifiersUsed: true,
        engagementId,
        clientReadback: {
          title: true,
          sessions: 2,
          chatMessageId: persisted.id,
        },
        relationshipWork: {
          kindSpecificFormOperated: true,
          noteOperation,
          taskOperation,
          goalOperation,
          taskStatusOperation,
          retainedReadback: retainedWork,
        },
        separateAccountPrivacy: {
          outsiderStatus: 404,
          privateTitleVisible: false,
        },
        viewportChecks: ["1440x1000", "390x844"],
        externalSideEffects: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await prisma.$disconnect();
  await deleteApp(firebaseApp);
}
