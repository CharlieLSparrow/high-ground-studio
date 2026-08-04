#!/usr/bin/env node

import { createRequire } from "node:module";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

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
const COACH_CONTINUITY_TASK_ID = "retained-coaching-continuity-task-20260803";
const TRANSCRIPT_SEGMENT_ID = "retained-coaching-continuity-segment-20260803";
const PLAYBACK_SOURCE_ID = "retained-coaching-continuity-source-20260803";
const PRIOR_ROOM_TITLE = "Retained coaching follow-up rehearsal";
const NEXT_ROOM_TITLE = "QA Retained · Coaching continuity Session 2";
const IDENTITIES = [
  {
    role: "coach",
    email: "quipsly-coach-retained-20260731@example.test",
    viewport: { width: 1440, height: 1000 },
  },
  {
    role: "coach-mobile",
    email: "quipsly-coach-retained-20260731@example.test",
    viewport: { width: 390, height: 844 },
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
  {
    role: "privacy-outsider",
    email: "quipsly-privacy-outsider-retained-20260802@example.test",
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

function retainedPassword(identity) {
  const store = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "keychain",
  ).trim().toLowerCase();
  if (store === "keychain") {
    return readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: identity.email });
  }
  assert(store === "temporary", "Credential store must be temporary or keychain.");
  const configuredDirectory = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY || "",
  ).trim();
  assert(configuredDirectory, "Temporary retained credential directory is required.");
  const directory = path.resolve(configuredDirectory);
  const directoryInfo = lstatSync(directory);
  assert(
    directoryInfo.isDirectory()
      && !directoryInfo.isSymbolicLink()
      && directoryInfo.uid === process.getuid?.()
      && (directoryInfo.mode & 0o077) === 0,
    "Temporary retained credential directory must be owner-only and cannot be a symlink.",
  );
  const credentialPath = path.join(directory, `${identity.role}.json`);
  const credentialInfo = lstatSync(credentialPath);
  assert(
    credentialInfo.isFile()
      && !credentialInfo.isSymbolicLink()
      && credentialInfo.uid === process.getuid?.()
      && (credentialInfo.mode & 0o077) === 0,
    `Temporary ${identity.role} credential must be an owner-only regular file.`,
  );
  const credential = JSON.parse(readFileSync(credentialPath, "utf8"));
  assert(credential.email === identity.email, `Temporary ${identity.role} credential belongs to a different identity.`);
  assert(
    typeof credential.password === "string" && credential.password.length >= 16,
    `Temporary ${identity.role} password is invalid.`,
  );
  return credential.password;
}

async function inspectProtectedPlayback(page) {
  return page.evaluate(async (sourceId) => {
    const response = await fetch(`/api/ingest/media/${encodeURIComponent(sourceId)}`, {
      credentials: "same-origin",
      headers: { Range: "bytes=0-43" },
    });
    const bytes = response.ok ? Array.from(new Uint8Array(await response.arrayBuffer())) : [];
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentRange: response.headers.get("content-range"),
      bytes,
    };
  }, PLAYBACK_SOURCE_ID);
}

async function verifyCoach(page, baseURL, identity, password) {
  const spectralTileResponses = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/media-vault/audio-spectral-evidence/tile")) {
      spectralTileResponses.push({
        status: response.status(),
        contentType: response.headers()["content-type"] || null,
      });
    }
  });
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
  assert(surfaceText.includes("Name the smallest repeatable boundary"), "Coach continuity lost the canonical task carrying reviewed evidence.");
  assert(surfaceText.includes("I can name the smallest repeatable boundary before the next Session."), "Coach continuity lost the reviewed transcript wording.");
  assert(surfaceText.includes("Append-only reviewed evidence"), "Coach continuity lost the append-only task boundary.");
  const evidenceLink = surface.getByRole("link", { name: "Return to 1:03–1:11", exact: true });
  await evidenceLink.waitFor();
  assert(
    await evidenceLink.getAttribute("href") === `/sessions/${PRIOR_ROOM_ID}?mode=transcript#transcript-segment-${TRANSCRIPT_SEGMENT_ID}`,
    "Coach continuity evidence link no longer targets the exact reviewed transcript segment.",
  );
  await assertNoHorizontalOverflow(surface, identity.role);
  await evidenceLink.click();
  await page.locator(`#transcript-segment-${TRANSCRIPT_SEGMENT_ID}`).waitFor({ timeout: 20_000 });
  await page.getByText("I can name the smallest repeatable boundary before the next Session.", { exact: true }).first().waitFor({ timeout: 20_000 });
  const spectralEvidence = page.getByRole("region", { name: "High-resolution spectral evidence", exact: true });
  await spectralEvidence.waitFor({ timeout: 20_000 });
  await spectralEvidence.scrollIntoViewIfNeeded();
  await spectralEvidence.getByText("completed", { exact: true }).waitFor({ timeout: 20_000 });
  const sharedNavigator = spectralEvidence.getByRole("region", { name: "Shared spectral evidence navigator", exact: true });
  await sharedNavigator.waitFor({ timeout: 20_000 });
  const nextSharedEvidence = sharedNavigator.getByRole("button", { name: "Next evidence →", exact: true });
  assert(await nextSharedEvidence.isEnabled(), "Coach spectral view has no operable transcript/signal/capture review point.");
  await nextSharedEvidence.click();
  await spectralEvidence.getByRole("region", { name: "Shared evidence at selected time", exact: true }).waitFor({ timeout: 20_000 });
  await spectralEvidence.getByRole("region", { name: "Shared spectral evidence legend", exact: true }).waitFor({ timeout: 20_000 });
  const spectralCanvas = spectralEvidence.getByRole("slider", { name: /Spectral evidence from/i });
  await spectralCanvas.waitFor({ timeout: 20_000 });
  const wholeLabel = await spectralCanvas.getAttribute("aria-label");
  await spectralEvidence.getByRole("button", { name: "One minute", exact: true }).click();
  await page.waitForTimeout(250);
  assert(await spectralCanvas.getAttribute("aria-label") !== wholeLabel, "Coach could not operate the one-minute protected spectral view.");
  await spectralEvidence.getByRole("button", { name: "Ten seconds", exact: true }).click();
  await page.waitForTimeout(500);
  assert(spectralTileResponses.length >= 3, "Coach did not receive protected overview, browse, and detail spectral tiles.");
  assert(spectralTileResponses.every((response) => response.status === 200), "Coach received a failed protected spectral tile response.");
  assert(spectralTileResponses.every((response) => response.contentType === "application/vnd.quipsly.spectral-tile; format=gray8"), `Coach received an unexpected protected spectral tile type: ${JSON.stringify(spectralTileResponses)}`);
  await assertNoHorizontalOverflow(spectralEvidence, "coach high-resolution spectral evidence");
  const playback = await inspectProtectedPlayback(page);
  assert(playback.status === 206, "Authorized coach could not range-read the exact protected playback source.");
  assert(playback.contentType === "audio/wav", "Protected playback returned an unexpected media type.");
  assert(playback.contentRange === "bytes 0-43/1280044", "Protected playback lost its exact immutable byte boundary.");
  assert(String.fromCharCode(...playback.bytes.slice(0, 4)) === "RIFF", "Protected playback did not return the expected WAV header.");
  assert(String.fromCharCode(...playback.bytes.slice(8, 12)) === "WAVE", "Protected playback did not return the expected WAV identity.");
  await clearRenderedSession(page, baseURL, identity.role);
  return {
    role: identity.role,
    priorBrief: "visible",
    exactSourceLink: true,
    exactTaskEvidenceSource: true,
    highResolutionSpectralEvidence: "overview-browse-detail-operated",
    sharedTranscriptSignalOverlay: "operated-and-explained",
    protectedSpectralTileResponses: spectralTileResponses.length,
    protectedPlaybackRange: "authorized",
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
    protectedPlaybackRange: "not-probed",
    currentSessionMutated: false,
    viewport: `${identity.viewport.width}x${identity.viewport.height}`,
  };
}

async function verifyCoachMobile(page, baseURL, identity, password) {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password,
    callbackPath: `/sessions/${PRIOR_ROOM_ID}?mode=transcript`,
  });
  const spectralEvidence = page.getByRole("region", { name: "High-resolution spectral evidence", exact: true });
  await spectralEvidence.waitFor({ timeout: 20_000 });
  await spectralEvidence.getByText("completed", { exact: true }).waitFor({ timeout: 20_000 });
  const navigator = spectralEvidence.getByRole("region", { name: "Shared spectral evidence navigator", exact: true });
  await navigator.waitFor();
  const next = navigator.getByRole("button", { name: "Next evidence →", exact: true });
  assert(await next.isEnabled(), "Mobile coach has no keyboard/touch reachable evidence point.");
  await next.click();
  await spectralEvidence.getByRole("region", { name: "Shared evidence at selected time", exact: true }).waitFor();
  await spectralEvidence.getByRole("button", { name: "Ten seconds", exact: true }).click();
  const canvas = spectralEvidence.getByRole("slider", { name: /Spectral evidence from/i });
  await canvas.focus();
  const before = Number(await canvas.getAttribute("aria-valuenow"));
  await canvas.press("ArrowRight");
  await page.waitForFunction(({ label, prior }) => {
    const node = [...document.querySelectorAll('canvas[role="slider"]')].find((candidate) => candidate.getAttribute("aria-label")?.startsWith(label));
    return node && Number(node.getAttribute("aria-valuenow")) !== prior;
  }, { label: "Spectral evidence from", prior: before });
  await assertNoHorizontalOverflow(spectralEvidence, "mobile coach shared spectral evidence");
  await clearRenderedSession(page, baseURL, identity.role);
  return {
    role: identity.role,
    highResolutionSpectralEvidence: "mobile-overlay-keyboard-operated",
    sharedTranscriptSignalOverlay: "operated-and-explained",
    currentSessionMutated: false,
    viewport: `${identity.viewport.width}x${identity.viewport.height}`,
  };
}

async function verifyPrivacyOutsider(page, baseURL, identity, password) {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password,
    callbackPath: "/dashboard",
  });
  const playback = await inspectProtectedPlayback(page);
  assert(
    playback.status !== 200 && playback.status !== 206 && playback.bytes.length === 0,
    "A separate-account outsider could read protected coaching audio by guessing its stable ID.",
  );
  await clearRenderedSession(page, baseURL, identity.role);
  return {
    role: identity.role,
    priorBrief: "not-requested",
    protectedPlaybackRange: "denied",
    currentSessionMutated: false,
    viewport: `${identity.viewport.width}x${identity.viewport.height}`,
  };
}

async function verifyIdentity(browser, baseURL, identity) {
  const password = retainedPassword(identity);
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
      : identity.role === "coach-mobile"
        ? await verifyCoachMobile(page, baseURL, identity, password)
      : identity.role === "privacy-outsider"
        ? await verifyPrivacyOutsider(page, baseURL, identity, password)
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

    const [priorNotes, canonicalTask, nextNotes] = await Promise.all([
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
      prisma.actionItem.findUniqueOrThrow({
        where: { id: COACH_CONTINUITY_TASK_ID },
        select: {
          id: true,
          title: true,
          detail: true,
          status: true,
          assignedUserId: true,
          roomId: true,
          evidenceReceipts: {
            where: { kind: "TRANSCRIPT_CANDIDATE_MERGED" },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true, evidenceJson: true },
          },
        },
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
    const snapshotTask = source.snapshot?.tasks?.find((task) => task.id === COACH_CONTINUITY_TASK_ID);
    assert(snapshotTask?.lastMergedTranscriptEvidence?.sourceAnchor?.segmentId === TRANSCRIPT_SEGMENT_ID,
      "Continuity snapshot lost the append-only task evidence receipt.");
    assert(canonicalTask.title === "Name the smallest repeatable boundary"
      && canonicalTask.detail === "Bring the client's own wording back into the next coaching conversation."
      && canonicalTask.status === "OPEN"
      && canonicalTask.assignedUserId === coach.id
      && canonicalTask.roomId === PRIOR_ROOM_ID,
    "Continuity operation mutated the canonical task definition or lifecycle.");
    assert(canonicalTask.evidenceReceipts[0]?.evidenceJson?.candidateSource?.segmentId === TRANSCRIPT_SEGMENT_ID,
      "Canonical task evidence receipt lost its exact source segment.");
    return {
      projectID: priorRoom.projectId,
      priorRoomID: priorRoom.id,
      nextRoomID: nextRoom.id,
      retainedBriefCount: priorBriefs.length,
      copiedBriefCount: copiedBriefs.length,
      snapshotSha256: source.integrity.snapshotSha256,
      actorPrivate: true,
      exactTaskEvidenceSource: true,
      canonicalTaskMutated: false,
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
    const credentialStore = String(
      process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "keychain",
    ).trim().toLowerCase();
    const operatedIdentities = credentialStore === "temporary"
      ? IDENTITIES
      : IDENTITIES.filter((identity) => identity.role !== "privacy-outsider");
    const identities = [];
    for (const identity of operatedIdentities) {
      identities.push(await verifyIdentity(browser, baseURL, identity));
    }
    const canonical = await readCanonicalState(databaseURL);
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      baseURL,
      credentialStore: credentialStore === "temporary"
        ? "owner-only temporary directory"
        : "macOS Keychain",
      separateAccountPrivacyBoundary: credentialStore === "temporary" ? "probed" : "not-probed",
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
