#!/usr/bin/env node

import { createRequire } from "node:module";

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
const PRIOR_ROOM_ID = "retained-coaching-follow-up-20260731";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const PRIOR_ROOM_TITLE = "Retained coaching follow-up rehearsal";
const NEXT_ROOM_TITLE = "QA Retained · Coaching continuity Session 2";
const IDENTITIES = [
  {
    role: "coach",
    email: "quipsly-coach-retained-20260731@example.test",
    viewport: { width: 1440, height: 1000 },
  },
  {
    role: "client",
    email: "quipsly-client-retained-20260731@example.test",
    viewport: { width: 390, height: 844 },
  },
  {
    role: "outsider",
    email: "quipsly-followup-outsider-retained-20260731@example.test",
    viewport: { width: 390, height: 844 },
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Retained continuity operation refuses non-local databases.",
  );
  return url.toString();
}

async function verifyCoach(page, baseURL, identity, password) {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password,
    callbackPath: `/sessions/${PRIOR_ROOM_ID}?mode=work`,
  });
  await page.getByRole("heading", { name: "Next-session continuity", exact: true }).waitFor({ timeout: 20_000 });
  const save = page.getByRole("button", { name: "Save private brief", exact: true });
  await save.waitFor();
  assert(await save.isEnabled(), "Coach continuity snapshot was not eligible to save.");
  await save.click();
  await page.getByText(
    /Private next-session brief saved|This exact private brief already existed/i,
  ).waitFor({ timeout: 20_000 });

  await page.goto(`${baseURL}/sessions/${NEXT_ROOM_ID}?mode=prepare`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NEXT_ROOM_TITLE, exact: true }).waitFor({ timeout: 20_000 });
  const priorHeading = page.getByRole("heading", { name: PRIOR_ROOM_TITLE, exact: true });
  await priorHeading.waitFor({ timeout: 20_000 });
  const surface = priorHeading.locator("xpath=ancestor::section[1]");
  const surfaceText = await surface.innerText();
  const normalizedSurfaceText = surfaceText.toLowerCase();
  assert(surfaceText.includes("Next-session continuity"), "Coach lost the exact saved continuity body.");
  assert(surfaceText.includes("Current truth"), "Coach continuity body lost its canonical receipt summary.");
  assert(normalizedSurfaceText.includes("current session unchanged"), "Coach surface lost the no-mutation boundary.");
  const sourceLink = surface.getByRole("link", { name: "Open source Session", exact: true });
  await sourceLink.waitFor();
  assert(
    await sourceLink.getAttribute("href") === `/sessions/${PRIOR_ROOM_ID}?mode=work`,
    "Coach continuity source link no longer targets the exact prior Session.",
  );
  await assertNoHorizontalOverflow(surface, identity.role);
  await clearRenderedSession(page, baseURL, identity.role);
  return {
    role: identity.role,
    priorBrief: "visible",
    exactSourceLink: true,
    currentSessionMutated: false,
    viewport: `${identity.viewport.width}x${identity.viewport.height}`,
  };
}

async function verifyNonAuthor(page, baseURL, identity, password) {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password,
    callbackPath: `/sessions/${NEXT_ROOM_ID}?mode=prepare`,
  });
  await page.getByRole("heading", { name: NEXT_ROOM_TITLE, exact: true }).waitFor({ timeout: 20_000 });
  const emptyHeading = page.getByRole("heading", { name: "No saved prior brief", exact: true });
  await emptyHeading.waitFor({ timeout: 20_000 });
  const surface = emptyHeading.locator("xpath=ancestor::section[1]");
  const surfaceText = await surface.innerText();
  assert(!surfaceText.includes(PRIOR_ROOM_TITLE), `${identity.role} learned the coach-private source Session title.`);
  assert(!surfaceText.includes("Current truth"), `${identity.role} learned the coach-private continuity body.`);
  await assertNoHorizontalOverflow(surface, identity.role);
  await clearRenderedSession(page, baseURL, identity.role);
  return {
    role: identity.role,
    priorBrief: "concealed",
    currentSessionMutated: false,
    viewport: `${identity.viewport.width}x${identity.viewport.height}`,
  };
}

async function verifyIdentity(browser, baseURL, identity) {
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: identity.email,
  });
  assert(password, `${identity.role} has no retained Keychain password.`);
  const context = await browser.newContext({
    viewport: identity.viewport,
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const result = identity.role === "coach"
      ? await verifyCoach(page, baseURL, identity, password)
      : await verifyNonAuthor(page, baseURL, identity, password);
    assert(pageErrors.length === 0, `${identity.role} rendered continuity journey raised a browser exception.`);
    return { ...result, browserExceptions: 0, sessionClear: "passed" };
  } finally {
    await context.close();
  }
}

async function readCanonicalState(databaseURL) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL }),
    log: ["error"],
  });
  try {
    const [coach, priorRoom, nextRoom] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { primaryEmail: IDENTITIES[0].email },
        select: { id: true },
      }),
      prisma.callRoom.findUniqueOrThrow({
        where: { id: PRIOR_ROOM_ID },
        select: { id: true, projectId: true, purpose: true },
      }),
      prisma.callRoom.findUniqueOrThrow({
        where: { id: NEXT_ROOM_ID },
        select: { id: true, projectId: true, purpose: true },
      }),
    ]);
    assert(priorRoom.projectId && priorRoom.projectId === nextRoom.projectId, "Sequential Sessions lost their canonical Nest identity.");
    assert(priorRoom.purpose === nextRoom.purpose, "Sequential Sessions no longer share one Session purpose.");

    const [priorNotes, nextNotes] = await Promise.all([
      prisma.coachingNote.findMany({
        where: {
          roomId: PRIOR_ROOM_ID,
          authorUserId: coach.id,
          kind: "FOLLOW_UP",
          visibility: "AUTHOR_PRIVATE",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, sourceJson: true },
      }),
      prisma.coachingNote.findMany({
        where: { roomId: NEXT_ROOM_ID },
        select: { id: true, sourceJson: true },
      }),
    ]);
    const priorBriefs = priorNotes.filter((note) => note.sourceJson?.schema === "quipsly-session-continuity-brief-v1");
    const copiedBriefs = nextNotes.filter((note) => note.sourceJson?.schema === "quipsly-session-continuity-brief-v1");
    assert(priorBriefs.length >= 1, "Rendered coach save did not persist a canonical continuity brief.");
    assert(copiedBriefs.length === 0, "Continuity projection copied a private brief into the next Session.");
    const source = priorBriefs[0].sourceJson;
    assert(source.actorUserId === coach.id, "Continuity receipt lost the exact actor identity.");
    assert(source.roomId === PRIOR_ROOM_ID, "Continuity receipt lost the exact source Session identity.");
    assert(source.visibility === "actor-private", "Continuity receipt lost its actor-private boundary.");
    assert(source.aiGenerated === false, "Continuity receipt incorrectly claims AI generation.");
    assert(source.externalSideEffects === false, "Continuity receipt incorrectly claims external effects.");
    assert(/^[a-f0-9]{64}$/.test(String(source.integrity?.snapshotSha256 || "")), "Continuity receipt lost its snapshot SHA-256.");
    return {
      projectID: priorRoom.projectId,
      priorRoomID: priorRoom.id,
      nextRoomID: nextRoom.id,
      retainedBriefCount: priorBriefs.length,
      copiedBriefCount: copiedBriefs.length,
      snapshotSha256: source.integrity.snapshotSha256,
      actorPrivate: true,
      aiGenerated: false,
      externalSideEffects: false,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const identities = [];
    for (const identity of IDENTITIES) {
      identities.push(await verifyIdentity(browser, baseURL, identity));
    }
    const canonical = await readCanonicalState(databaseURL);
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      baseURL,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: false,
      secretsPrinted: false,
      externalSideEffects: false,
      identities,
      canonical,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

await main();
