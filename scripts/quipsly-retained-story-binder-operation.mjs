#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(`Refusing retained binder operation against non-loopback database ${parsedDatabase.hostname}.`);
}

const appOrigin = "http://127.0.0.1:3012";
const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const projectSlug = process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey-manuscript";
const email = "source-story-retained-route@quipsly.test";
const productiveTitle = "Insta360 selects — editorial spine";
const productiveSynopsis = "Organize Homer's strongest spatial moments into an opening promise, evidence, turns, and payoff before committing them to an Episode timeline.";
const qaTitle = "Binder lifecycle QA · retained writing";
const qaSynopsis = "A deliberately empty retained section used to prove revisioned writing and safe archive behavior.";

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
let firebaseApp = null;
let cookie = null;

try {
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true },
  });
  if (!project) throw new Error(`Retained Nest not found: ${projectSlug}`);
  const operator = await prisma.user.upsert({
    where: { primaryEmail: email },
    update: { name: "Retained Source Story route operator" },
    create: { primaryEmail: email, name: "Retained Source Story route operator" },
    select: { id: true },
  });
  const board = await prisma.studioStoryBoard.findFirst({
    where: { projectId: project.id, slug: "homer-insta360-selects", archivedAt: null },
    select: { id: true, title: true },
  });
  if (!board) throw new Error("The retained Homer Insta360 board is unavailable.");

  const password = `Local-only-${randomUUID()}!`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;
  process.env.GCLOUD_PROJECT = "quipsly-reef";
  process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
  firebaseApp = initializeApp({ projectId: "quipsly-reef" }, `retained-binder-${randomUUID().slice(0, 8)}`);
  const firebaseAuth = getAuth(firebaseApp);
  const firebaseUid = "source-story-retained-route";
  const existingFirebaseUser = await firebaseAuth.getUser(firebaseUid).catch(() => null);
  if (existingFirebaseUser) await firebaseAuth.updateUser(firebaseUid, { email, emailVerified: true, password, displayName: "Retained Source Story route operator" });
  else await firebaseAuth.createUser({ uid: firebaseUid, email, emailVerified: true, password, displayName: "Retained Source Story route operator" });
  const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const auth = await signIn.json().catch(() => ({}));
  if (signIn.status !== 200 || !auth.idToken) throw new Error("The retained binder operator could not sign in to the Firebase emulator.");
  const session = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: auth.idToken }),
  });
  const sessionBody = await session.json().catch(() => ({}));
  const sessionCookie = session.headers.getSetCookie().filter((value) => value.startsWith("session=") && !value.startsWith("session=;")).at(-1);
  cookie = sessionCookie?.split(";")[0] ?? null;
  if (session.status !== 200 || sessionBody.success !== true || !cookie) throw new Error("The retained binder operator could not establish a first-party session.");

  async function mutate(body) {
    const response = await fetch(`${appOrigin}/api/nests/${encodeURIComponent(project.slug)}/source-story`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "cache-control": "no-cache" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status !== 200 || !payload.workspace) {
      throw new Error(`${body.action} failed through the authenticated app boundary (HTTP ${response.status}: ${payload.error || "unknown error"}).`);
    }
    return payload;
  }

  async function currentBoard() {
    const response = await fetch(`${appOrigin}/api/nests/${encodeURIComponent(project.slug)}/source-story`, { headers: { cookie, "cache-control": "no-cache" } });
    const payload = await response.json().catch(() => ({}));
    const projected = payload?.workspace?.boards?.find((candidate) => candidate?.id === board.id);
    if (response.status !== 200 || !projected) throw new Error("The retained board did not project through the authenticated app.");
    return projected;
  }

  async function boardOperation(requestId) {
    return prisma.studioStoryBoardOperation.findUnique({
      where: { boardId_actorUserId_clientRequestId: { boardId: board.id, actorUserId: operator.id, clientRequestId: requestId } },
    });
  }

  async function sectionOperation(sectionId, requestId) {
    return prisma.studioStoryBoardSectionOperation.findUnique({
      where: { sectionId_actorUserId_clientRequestId: { sectionId, actorUserId: operator.id, clientRequestId: requestId } },
    });
  }

  async function createSection(title, synopsis, requestLabel) {
    const clientRequestId = deterministicUuid(`${project.id}:${board.id}:${requestLabel}:create-v1`);
    const prior = await boardOperation(clientRequestId);
    const projected = await currentBoard();
    const payload = await mutate({
      action: "create-board-section",
      boardId: board.id,
      expectedBoardRevision: prior?.previousRevision ?? projected.revision,
      clientRequestId,
      title,
      synopsis,
    });
    const sectionId = payload.operation?.section?.id || prior?.snapshotJson?.sectionId;
    if (!sectionId) throw new Error(`The ${requestLabel} section returned no durable identity.`);
    const section = await prisma.studioStoryBoardSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new Error(`The ${requestLabel} section was not retained in PostgreSQL.`);
    return { section, replayed: payload.operation?.replayed === true };
  }

  async function updateSection(section, title, synopsis, requestLabel) {
    const clientRequestId = deterministicUuid(`${project.id}:${section.id}:${requestLabel}:update-v1`);
    const prior = await sectionOperation(section.id, clientRequestId);
    const current = await prisma.studioStoryBoardSection.findUniqueOrThrow({ where: { id: section.id } });
    const payload = await mutate({
      action: "update-board-section",
      boardId: board.id,
      sectionId: section.id,
      expectedRevision: prior?.previousRevision ?? current.revision,
      clientRequestId,
      title,
      synopsis,
    });
    return { section: await prisma.studioStoryBoardSection.findUniqueOrThrow({ where: { id: section.id } }), replayed: payload.operation?.replayed === true };
  }

  async function openWriting(section, requestLabel) {
    const clientRequestId = deterministicUuid(`${project.id}:${section.id}:${requestLabel}:writing-v1`);
    const prior = await sectionOperation(section.id, clientRequestId);
    const current = await prisma.studioStoryBoardSection.findUniqueOrThrow({ where: { id: section.id } });
    const payload = await mutate({
      action: "open-section-writing",
      boardId: board.id,
      sectionKey: current.key,
      expectedRevision: prior?.previousRevision ?? current.revision,
      clientRequestId,
    });
    const documentId = payload.operation?.document?.id || current.documentId;
    if (!documentId) throw new Error(`The ${requestLabel} section returned no writing document.`);
    return { documentId, replayed: payload.operation?.replayed === true };
  }

  const productiveCreated = await createSection(productiveTitle, productiveSynopsis, "productive-binder-section");
  const productiveUpdated = await updateSection(productiveCreated.section, productiveTitle, productiveSynopsis, "productive-binder-section");
  const productiveWriting = await openWriting(productiveUpdated.section, "productive-binder-section");

  const arrangeRequestId = deterministicUuid(`${project.id}:${board.id}:productive-binder-order-v1`);
  const priorArrangement = await boardOperation(arrangeRequestId);
  let projected = await currentBoard();
  let orderedSectionIds;
  if (priorArrangement && Array.isArray(priorArrangement.snapshotJson?.sectionOrder)) {
    orderedSectionIds = priorArrangement.snapshotJson.sectionOrder;
  } else {
    const withoutProductive = projected.sections.filter((section) => section.id !== productiveCreated.section.id).map((section) => section.id);
    const episodeOpenIndex = projected.sections.findIndex((section) => section.key === "episode-open");
    const insertionIndex = episodeOpenIndex >= 0 ? episodeOpenIndex + 1 : 0;
    orderedSectionIds = [...withoutProductive];
    orderedSectionIds.splice(Math.min(insertionIndex, orderedSectionIds.length), 0, productiveCreated.section.id);
  }
  const arrangement = await mutate({
    action: "arrange-board-sections",
    boardId: board.id,
    expectedBoardRevision: priorArrangement?.previousRevision ?? projected.revision,
    clientRequestId: arrangeRequestId,
    orderedSectionIds,
  });

  const qaCreated = await createSection(qaTitle, qaSynopsis, "archive-lifecycle-section");
  const qaUpdated = await updateSection(qaCreated.section, qaTitle, qaSynopsis, "archive-lifecycle-section");
  const qaWriting = await openWriting(qaUpdated.section, "archive-lifecycle-section");
  const archiveRequestId = deterministicUuid(`${project.id}:${qaCreated.section.id}:archive-lifecycle-v1`);
  const priorArchive = await boardOperation(archiveRequestId);
  projected = await currentBoard();
  const currentQa = await prisma.studioStoryBoardSection.findUniqueOrThrow({ where: { id: qaCreated.section.id } });
  const priorSectionArchive = await sectionOperation(currentQa.id, archiveRequestId);
  const archive = await mutate({
    action: "archive-board-section",
    boardId: board.id,
    sectionId: currentQa.id,
    expectedBoardRevision: priorArchive?.previousRevision ?? projected.revision,
    expectedSectionRevision: priorSectionArchive?.previousRevision ?? currentQa.revision,
    clientRequestId: archiveRequestId,
  });

  const finalBoard = await currentBoard();
  const finalProductive = finalBoard.sections.find((section) => section.id === productiveCreated.section.id);
  const archivedQa = await prisma.studioStoryBoardSection.findUniqueOrThrow({
    where: { id: qaCreated.section.id },
    include: { operations: { orderBy: { revision: "asc" } }, document: true },
  });
  const storyUrl = `${appOrigin}/nests/${encodeURIComponent(project.slug)}/story?board=${encodeURIComponent(board.id)}`;
  const writingUrl = `${appOrigin}/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(productiveWriting.documentId)}&storyBoard=${encodeURIComponent(board.id)}&storySection=${encodeURIComponent(productiveCreated.section.key)}`;
  const [storyPage, writingPage, deniedStoryPage, workspaceResponse] = await Promise.all([
    fetch(storyUrl, { headers: { cookie, "cache-control": "no-cache" } }),
    fetch(writingUrl, { headers: { cookie, "cache-control": "no-cache" } }),
    fetch(storyUrl, { redirect: "manual", headers: { "cache-control": "no-cache" } }),
    fetch(`${appOrigin}/api/nests/${encodeURIComponent(project.slug)}/source-story`, { headers: { cookie, "cache-control": "no-cache" } }),
  ]);
  const [storyHtml, writingHtml, deniedStoryHtml] = await Promise.all([storyPage.text(), writingPage.text(), deniedStoryPage.text()]);
  const workspacePayload = await workspaceResponse.json().catch(() => ({}));
  const storyEvidence = [productiveTitle, productiveSynopsis, "Add an empty section or story beat", "Section details and lifecycle", "Source bin", "Working", "Attention", "Browse ready", "Render ready", "Exact selects", "Group, filter, and sort"];
  const writingEvidence = ["Source-to-story writing context", productiveTitle];
  if (storyPage.status !== 200 || storyEvidence.some((value) => !storyHtml.includes(value))) throw new Error("The retained Story page did not render the complete binder controls and productive section.");
  const sourceInventoryWindow = workspacePayload?.workspace?.sourceInventoryWindow;
  const retainedSpatialPackage = workspacePayload?.workspace?.sourceSets?.find((sourceSet) => sourceSet?.displayName?.includes("Insta360"));
  if (workspaceResponse.status !== 200 || !sourceInventoryWindow || !retainedSpatialPackage) throw new Error("The authenticated Source bin did not project retained inventory capacity and the Insta360 package.");
  if (writingPage.status !== 200 || writingEvidence.some((value) => !writingHtml.includes(value))) throw new Error("The retained writing page did not render its binder context.");
  if (!finalProductive || finalProductive.document?.id !== productiveWriting.documentId) throw new Error("The productive section lost its writing document in the final projection.");
  if (!archivedQa.archivedAt || !archivedQa.document || finalBoard.sections.some((section) => section.id === archivedQa.id)) throw new Error("The QA section did not archive while retaining its writing.");
  const deniedByRedirect = [302, 307].includes(deniedStoryPage.status);
  const deniedByShell = deniedStoryPage.status === 200 && deniedStoryHtml.includes("Sign in") && !deniedStoryHtml.includes(productiveTitle);
  if (!deniedByRedirect && !deniedByShell) throw new Error(`The signed-out binder page did not preserve its auth boundary (HTTP ${deniedStoryPage.status}).`);

  console.log(JSON.stringify({
    schema: "quipsly-retained-story-binder-operation-v1",
    project: project.name,
    board: { id: board.id, title: board.title, revision: finalBoard.revision },
    productiveSection: {
      id: finalProductive.id,
      key: finalProductive.key,
      title: finalProductive.title,
      synopsis: finalProductive.synopsis,
      revision: finalProductive.revision,
      sortOrder: finalProductive.sortOrder,
      documentId: productiveWriting.documentId,
      createReplayed: productiveCreated.replayed,
      updateReplayed: productiveUpdated.replayed,
      writingReplayed: productiveWriting.replayed,
    },
    arrangement: { replayed: arrangement.operation?.replayed === true, orderedSectionIds: finalBoard.sections.map((section) => section.id) },
    archivedQaSection: {
      id: archivedQa.id,
      revision: archivedQa.revision,
      documentId: archivedQa.document.id,
      operations: archivedQa.operations.map((operation) => ({ revision: operation.revision, operation: operation.operation })),
      archiveReplayed: archive.operation?.replayed === true,
      absentFromActiveProjection: true,
    },
    appReadback: { storyPageStatus: storyPage.status, writingPageStatus: writingPage.status, signedOutStatus: deniedStoryPage.status, signedOutShell: deniedByShell },
    sourceBin: {
      sourceSetId: retainedSpatialPackage.id,
      sourceSetName: retainedSpatialPackage.displayName,
      completeness: retainedSpatialPackage.completeness,
      collaborationProxyReady: Boolean(retainedSpatialPackage.sourceClockRevision?.collaborationProxy),
      spatialStitchMasterReady: Boolean(retainedSpatialPackage.sourceClockRevision?.spatialStitchMaster),
      inventoryWindow: sourceInventoryWindow,
    },
  }, null, 2));
} finally {
  if (cookie) await fetch(`${appOrigin}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => undefined);
  if (firebaseApp) await deleteApp(firebaseApp).catch(() => undefined);
  await prisma.$disconnect();
}
