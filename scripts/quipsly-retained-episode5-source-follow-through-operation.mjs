#!/usr/bin/env node

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { chromium } from "playwright";

const appOrigin = process.env.QUIPSLY_LOCAL_NEST_URL || "http://127.0.0.1:3012";
const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const projectSlug = "high-ground-odyssey-manuscript";
const sourceSetId = "cmsjgd5k60006zkxlnzdm3h2e";
const boardId = "52996a24-e0ba-4ad7-be07-7e9a481168fc";
const cardId = "0241e22a-ed33-44b0-aef2-ffcde24c12fd";

for (const [label, value] of [["database", databaseUrl], ["Nest", appOrigin], ["Firebase Auth", authOrigin]]) {
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing retained browser follow-through against non-loopback ${label} ${parsed.hostname}.`);
  }
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const suffix = randomUUID().slice(0, 8);
const email = `episode5-follow-through-${suffix}@quipsly.test`;
const password = `Local-only-${randomUUID()}!`;
const messageText = `QA ${suffix}: retain this exact Episode 5 select for the opening visual beat.`;
const taskTitle = `QA ${suffix}: approve the Episode 5 lake reveal`;
const taskDetail = "Confirm the camera direction and editorial purpose before final conform.";
let userId = null;
let grantId = null;
let firebaseApp = null;
let firebaseUid = null;
let sessionCookie = null;
let browser = null;
let taskId = null;
let messageId = null;
let threadId = null;
let removeThread = false;

try {
  const [project, card] = await Promise.all([
    prisma.studioProject.findFirst({ where: { slug: projectSlug }, orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, name: true } }),
    prisma.studioStoryCard.findFirst({
      where: { id: cardId, project: { slug: projectSlug }, archivedAt: null, placements: { some: { boardId } } },
      select: {
        id: true,
        title: true,
        revision: true,
        sourceRange: { select: { id: true, startSeconds: true, endSeconds: true, selectorSha256: true, sourceSetId: true } },
      },
    }),
  ]);
  if (!project || !card?.sourceRange || card.sourceRange.sourceSetId !== sourceSetId) {
    throw new Error("The retained Episode 5 source card, board placement, or exact source set is unavailable.");
  }
  const threadKey = `story-card:${card.id}`;
  const existingThread = await prisma.studioNestChatThread.findUnique({
    where: { projectId_key: { projectId: project.id, key: threadKey } },
    select: { id: true },
  });
  removeThread = !existingThread;

  const user = await prisma.user.create({ data: { primaryEmail: email, name: "Episode 5 browser follow-through" }, select: { id: true } });
  userId = user.id;
  const grant = await prisma.studioProjectAccessGrant.create({
    data: { projectId: project.id, email, role: "EDITOR", status: "ACTIVE", createdByUserId: user.id, createdByEmail: email },
    select: { id: true },
  });
  grantId = grant.id;

  process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;
  process.env.GCLOUD_PROJECT = "quipsly-reef";
  process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
  firebaseApp = initializeApp({ projectId: "quipsly-reef" }, `episode5-follow-through-${suffix}`);
  const firebaseUser = await getAuth(firebaseApp).createUser({
    uid: `episode5-follow-through-${suffix}`,
    email,
    emailVerified: true,
    password,
    displayName: "Episode 5 browser follow-through",
  });
  firebaseUid = firebaseUser.uid;
  const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signInBody = await signIn.json().catch(() => ({}));
  if (signIn.status !== 200 || !signInBody.idToken) throw new Error(`Disposable Firebase sign-in failed (HTTP ${signIn.status}).`);
  const session = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: signInBody.idToken }),
  });
  const sessionBody = await session.json().catch(() => ({}));
  const setCookie = session.headers.getSetCookie().find((value) => value.startsWith("session=") && !value.startsWith("session=;"));
  sessionCookie = setCookie?.split(";")[0] ?? null;
  if (session.status !== 200 || sessionBody.success !== true || !sessionCookie) {
    throw new Error(`First-party session exchange failed (HTTP ${session.status}).`);
  }

  const [cookieName, ...cookieValueParts] = sessionCookie.split("=");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: "light" });
  await context.addCookies([{ name: cookieName, value: cookieValueParts.join("="), url: appOrigin, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const storyUrl = `${appOrigin}/nests/${encodeURIComponent(project.slug)}/story?set=${encodeURIComponent(sourceSetId)}&board=${encodeURIComponent(boardId)}`;
  await page.goto(storyUrl, { waitUntil: "networkidle" });
  const cardSurface = page.locator(`#story-card-${card.id}`).first();
  await cardSurface.waitFor({ state: "visible" });
  await cardSurface.getByRole("button", { name: `Open discussion for ${card.title}` }).click();
  await page.getByRole("heading", { name: `${card.title} · discussion` }).waitFor();
  await page.getByPlaceholder("Discuss this exact source select…").fill(messageText);
  await page.getByRole("button", { name: "Send collaboration message" }).click();
  await page.getByText(messageText, { exact: true }).waitFor();

  await page.getByRole("button", { name: "Create follow-through task" }).click();
  const titleInput = page.getByRole("textbox", { name: "Task title" });
  await titleInput.fill(taskTitle);
  await page.getByRole("textbox", { name: /What does done look like/ }).fill(taskDetail);
  await page.getByRole("button", { name: "Create Work task" }).click();
  await page.getByText(/Task saved in Work/).waitFor();
  const taskLink = page.getByRole("link", { name: "Open task" });
  const taskHref = await taskLink.getAttribute("href");
  taskId = taskHref ? new URL(taskHref, appOrigin).searchParams.get("task") : null;
  if (!taskId) throw new Error("The visible Work handoff did not return a canonical task identity.");
  await taskLink.click();
  await page.waitForURL((url) => url.pathname === "/work" && url.searchParams.get("task") === taskId);
  await page.getByRole("heading", { name: "Focused task" }).waitFor();
  await page.getByText("Exact source-card evidence", { exact: true }).waitFor();
  const returnLink = page.getByRole("link", { name: "Open exact source select" });
  const returnHref = await returnLink.getAttribute("href");
  if (!returnHref?.includes(`set=${sourceSetId}`) || !returnHref.includes(`board=${boardId}`) || !returnHref.endsWith(`#story-card-${card.id}`)) {
    throw new Error(`Work lost the exact Source Story return path: ${returnHref || "missing"}.`);
  }

  const [task, message] = await Promise.all([
    prisma.actionItem.findUnique({
      where: { id: taskId },
      include: { evidenceReceipts: { where: { kind: "SOURCE_CARD_ANCHOR" } }, tagLinks: true },
    }),
    prisma.studioNestChatMessage.findFirst({ where: { projectId: project.id, thread: { key: threadKey }, body: messageText } }),
  ]);
  messageId = message?.id ?? null;
  threadId = message?.threadId ?? existingThread?.id ?? null;
  const sourceJson = task?.sourceJson && typeof task.sourceJson === "object" && !Array.isArray(task.sourceJson) ? task.sourceJson : {};
  const anchor = sourceJson.sourceCardAnchor && typeof sourceJson.sourceCardAnchor === "object" && !Array.isArray(sourceJson.sourceCardAnchor)
    ? sourceJson.sourceCardAnchor
    : {};
  if (
    task?.assignedUserId !== user.id
    || anchor.storyCardId !== card.id
    || anchor.sourceRangeId !== card.sourceRange.id
    || anchor.sourceSetId !== sourceSetId
    || anchor.boardId !== boardId
    || task.evidenceReceipts.length !== 1
    || !messageId
  ) throw new Error("The browser journey did not retain its exact collaboration and Work evidence.");

  console.log(JSON.stringify({
    schema: "quipsly-retained-episode5-source-follow-through-v1",
    projectSlug: project.slug,
    sourceSetId,
    boardId,
    cardId: card.id,
    cardRevision: card.revision,
    sourceRange: [card.sourceRange.startSeconds, card.sourceRange.endSeconds],
    discussionPosted: true,
    canonicalTaskCreated: true,
    sourceEvidenceReceiptCount: task.evidenceReceipts.length,
    inheritedTagCount: task.tagLinks.length,
    workDeepLinkFocused: true,
    exactSourceReturnHref: returnHref,
    externalSideEffects: false,
    disposableArtifactsRemovedAfterProof: true,
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (taskId) await prisma.actionItem.deleteMany({ where: { id: taskId } });
  if (messageId) await prisma.studioNestChatMessage.deleteMany({ where: { id: messageId } });
  if (removeThread && threadId) await prisma.studioNestChatThread.deleteMany({ where: { id: threadId } });
  if (sessionCookie) await fetch(`${appOrigin}/api/auth/session`, { method: "DELETE", headers: { cookie: sessionCookie } }).catch(() => undefined);
  if (firebaseApp && firebaseUid) await getAuth(firebaseApp).deleteUser(firebaseUid).catch(() => undefined);
  if (firebaseApp) await deleteApp(firebaseApp).catch(() => undefined);
  if (grantId) await prisma.studioProjectAccessGrant.deleteMany({ where: { id: grantId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
