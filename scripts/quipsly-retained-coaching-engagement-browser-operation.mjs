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

const enabled = process.env.QUIPSLY_RETAINED_COACHING_ENGAGEMENT_BROWSER_OPERATION === "1";
if (!enabled) throw new Error("Set QUIPSLY_RETAINED_COACHING_ENGAGEMENT_BROWSER_OPERATION=1 to authorize rendered local dogfood.");
const baseURL = new URL(process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012").origin;
const engagementId = "retained-coaching-engagement-20260731";
const clientEmail = "quipsly-client-retained-20260731@example.test";
const outsiderEmail = "quipsly-engagement-outsider-retained@example.test";
const password = `Qp-${randomBytes(18).toString("base64url")}!26`;
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
if (!baseURL.startsWith("http://127.0.0.1:") && !baseURL.startsWith("http://localhost:")) throw new Error("Rendered operation is loopback-only.");

process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.GCLOUD_PROJECT = "quipsly-reef";
process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";

const firebaseApp = initializeApp({ projectId: "quipsly-reef" }, `coaching-engagement-browser-${Date.now()}`);
const auth = getAuth(firebaseApp);
const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });

async function ensureFirebaseUser(email, uid) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({ uid, email, password, emailVerified: true, displayName: uid });
  }
}

try {
  await ensureFirebaseUser(clientEmail, "retained-coaching-engagement-client");
  await ensureFirebaseUser(outsiderEmail, "retained-coaching-engagement-outsider");
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const clientPage = await clientContext.newPage();
  await signInThroughRenderedLogin({
    page: clientPage,
    baseURL,
    identity: { role: "retained coaching client", email: clientEmail },
    password,
    callbackPath: `/coaching/engagements/${engagementId}`,
  });
  await clientPage.getByRole("heading", { name: "Quipsly Retained Client coaching", exact: true }).waitFor();
  await clientPage.getByText("Engagement-scoped privacy", { exact: true }).waitFor();
  await clientPage.getByRole("heading", { name: "Sessions", exact: true }).waitFor();
  await clientPage.getByText("Retained coaching follow-up rehearsal", { exact: true }).waitFor();
  await clientPage.getByText("QA Retained · Coaching continuity Session 2", { exact: true }).waitFor();
  await assertNoHorizontalOverflow(clientPage.getByRole("main").last(), "client Coaching Engagement");

  const message = `Rendered engagement dogfood ${new Date().toISOString()}: continuity survives between Sessions.`;
  await clientPage.getByPlaceholder("Write to everyone here…").fill(message);
  await clientPage.getByRole("button", { name: "Send collaboration message" }).click();
  await clientPage.getByText(message, { exact: true }).waitFor();
  const persisted = await prisma.studioNestChatMessage.findFirst({
    where: { body: message },
    select: { id: true, thread: { select: { key: true } }, metadataJson: true },
  });
  if (persisted?.thread.key !== `engagement:${engagementId}`) throw new Error("Rendered message did not persist to the exact engagement thread.");
  await clearRenderedSession(clientPage, baseURL, "retained coaching client");
  await clientContext.close();

  const outsiderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const outsiderPage = await outsiderContext.newPage();
  await signInThroughRenderedLogin({
    page: outsiderPage,
    baseURL,
    identity: { role: "separate outsider", email: outsiderEmail },
    password,
    callbackPath: "/coaching/engagements",
  });
  const response = await outsiderPage.goto(`${baseURL}/coaching/engagements/${engagementId}`, { waitUntil: "networkidle" });
  if (response?.status() !== 404) throw new Error(`Separate outsider received HTTP ${response?.status()} instead of 404.`);
  if (await outsiderPage.getByText("Quipsly Retained Client coaching", { exact: true }).count()) throw new Error("Separate outsider saw the private engagement title.");
  await outsiderContext.close();

  console.log(JSON.stringify({
    ok: true,
    engagementId,
    clientReadback: { title: true, sessions: 2, chatMessageId: persisted.id },
    separateAccountPrivacy: { outsiderStatus: 404, privateTitleVisible: false },
    viewportChecks: ["1440x1000", "390x844"],
    externalSideEffects: false,
  }, null, 2));
} finally {
  await browser.close();
  await prisma.$disconnect();
  await deleteApp(firebaseApp);
}
