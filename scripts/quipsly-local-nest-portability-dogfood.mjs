#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = process.cwd();
const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const nestOrigin = loopbackOrigin(
  process.env.QUIPSLY_LOCAL_NEST_URL || "http://127.0.0.1:3012",
  "QUIPSLY_LOCAL_NEST_URL",
);
const authOrigin = loopbackOrigin(
  process.env.QUIPSLY_LOCAL_FIREBASE_AUTH_URL || "http://127.0.0.1:9099",
  "QUIPSLY_LOCAL_FIREBASE_AUTH_URL",
);
const databaseURL = loopbackDatabaseURL(
  process.env.QUIPSLY_LOCAL_DATABASE_URL
    || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
const firebaseProject = process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT || "quipsly-reef";
const firebaseApiKey = process.env.QUIPSLY_LOCAL_FIREBASE_API_KEY || "local-emulator-key";
const identityToolkit = `${authOrigin}/identitytoolkit.googleapis.com`;
const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
const email = `quipsly-portability-${nonce}@example.test`;
const password = `Local-only-${nonce}!`;
const expectedHomeSlug = `home-${email.replace("@", "-at-").replace(".", "-")}`;
const sourceName = `QA Portable Source ${nonce}`;
const destinationName = `QA Portable Destination ${nonce}`;
const sourceSlug = `qa-portable-source-${nonce}`;
const destinationSlug = `qa-portable-destination-${nonce}`;
const sourceNoteTitle = `Portable note ${nonce}`;
const sourceTaskTitle = `Portable task ${nonce}`;
const sourceGoalTitle = `Portable goal ${nonce}`;
const resultBundle = `/private/tmp/quipsly-nest-portability-authenticated-${nonce}.xcresult`;
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseURL,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }),
  log: ["error"],
});

let idToken = "";
let firebaseDeleted = false;
let actorUserId = "";
let workspaceId = "";
let sourceProjectId = "";
let destinationProjectId = "";

function assert(condition, message, details = undefined) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function loopbackOrigin(raw, label) {
  const url = new URL(raw);
  assert(url.protocol === "http:", `${label} must use HTTP.`);
  assert(
    url.hostname === "127.0.0.1" || url.hostname === "localhost",
    `${label} must use a loopback host.`,
  );
  assert(
    !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
    `${label} must be a credential-free origin.`,
  );
  return url.origin;
}

function loopbackDatabaseURL(raw) {
  const url = new URL(raw);
  assert(
    url.protocol === "postgresql:" || url.protocol === "postgres:",
    "QUIPSLY_LOCAL_DATABASE_URL must be PostgreSQL.",
  );
  assert(
    url.hostname === "127.0.0.1" || url.hostname === "localhost",
    "QUIPSLY_LOCAL_DATABASE_URL must use a loopback host.",
  );
  return url.toString();
}

async function readJson(response, label, expectedStatus = undefined) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  if (expectedStatus !== undefined) {
    assert(response.status === expectedStatus, `${label} returned HTTP ${response.status}.`, body);
  } else {
    assert(response.ok, `${label} returned HTTP ${response.status}.`, body);
  }
  return { response, body };
}

async function localFetch(input, init = {}) {
  const url = new URL(input);
  assert(
    url.hostname === "127.0.0.1" || url.hostname === "localhost",
    `Local portability dogfood refused a non-loopback request to ${url.origin}.`,
  );
  const headers = new Headers(init.headers);
  // xcodebuild runs synchronously for long enough that Node's pooled loopback
  // sockets can be closed by the local Nest/Auth servers. A fresh connection
  // keeps the first post-Xcode export and cleanup request deterministic without
  // retrying an ambiguously completed mutation.
  headers.set("connection", "close");
  try {
    return await fetch(url, { ...init, headers });
  } catch (error) {
    throw new Error(`Loopback request failed for ${url.origin}${url.pathname}.`, {
      cause: error,
    });
  }
}

async function firebasePost(route, payload, label) {
  const response = await localFetch(
    `${identityToolkit}/v1/${route}?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return (await readJson(response, label)).body;
}

function stringField(body, key, label) {
  const value = body?.[key];
  assert(typeof value === "string" && value.length > 0, `${label} did not return ${key}.`);
  return value;
}

async function createVerifiedIdentity() {
  const signUp = await firebasePost(
    "accounts:signUp",
    { email, password, returnSecureToken: true },
    "Firebase emulator sign-up",
  );
  idToken = stringField(signUp, "idToken", "Firebase emulator sign-up");
  await firebasePost(
    "accounts:sendOobCode",
    { requestType: "VERIFY_EMAIL", idToken },
    "Firebase emulator verification request",
  );
  const oob = await readJson(
    await localFetch(`${authOrigin}/emulator/v1/projects/${encodeURIComponent(firebaseProject)}/oobCodes`),
    "Firebase emulator OOB lookup",
  );
  const verification = (Array.isArray(oob.body?.oobCodes) ? oob.body.oobCodes : [])
    .find((entry) => entry?.email === email && entry?.requestType === "VERIFY_EMAIL");
  assert(verification?.oobCode, "Firebase emulator did not return the exact verification code.");
  await firebasePost(
    "accounts:update",
    { oobCode: verification.oobCode },
    "Firebase emulator email verification",
  );
  const signIn = await firebasePost(
    "accounts:signInWithPassword",
    { email, password, returnSecureToken: true },
    "Firebase emulator verified sign-in",
  );
  idToken = stringField(signIn, "idToken", "Firebase emulator verified sign-in");
}

async function createCanonicalFixtures() {
  const session = await readJson(
    await localFetch(`${nestOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    }),
    "Nest local onboarding",
  );
  assert(session.body?.homeNest?.slug === expectedHomeSlug, "Nest returned the wrong Home Nest.");

  const actor = await prisma.user.findUniqueOrThrow({
    where: { primaryEmail: email },
    select: { id: true },
  });
  actorUserId = actor.id;
  const workspace = await prisma.studioWorkspace.create({
    data: {
      slug: `qa-portability-${nonce}`,
      name: `QA portability ${nonce}`,
      isPrivate: true,
    },
  });
  workspaceId = workspace.id;
  const [source, destination] = await Promise.all([
    prisma.studioProject.create({
      data: {
        workspaceId,
        slug: sourceSlug,
        name: sourceName,
        description: "Disposable source for authenticated iPhone portability acceptance.",
        sourceLabel: "nest-kind:writing;origin:local-portability-dogfood",
        isPrivate: true,
      },
    }),
    prisma.studioProject.create({
      data: {
        workspaceId,
        slug: destinationSlug,
        name: destinationName,
        description: "Disposable destination for authenticated portability acceptance.",
        sourceLabel: "nest-kind:writing;origin:local-portability-dogfood",
        isPrivate: true,
      },
    }),
  ]);
  sourceProjectId = source.id;
  destinationProjectId = destination.id;
  await prisma.studioProjectAccessGrant.createMany({
    data: [source.id, destination.id].map((projectId) => ({
      projectId,
      email,
      role: "OWNER",
      status: "ACTIVE",
      createdByUserId: actor.id,
      createdByEmail: email,
      note: "Disposable local portability acceptance",
    })),
  });

  const sourceTag = await prisma.studioTag.create({
    data: {
      projectId: source.id,
      slug: `proof-listen-${nonce}`,
      label: `Proof listen ${nonce}`,
      category: "review",
      nodeType: "source_note",
      isPrivate: true,
    },
  });
  await prisma.studioTagRevision.create({
    data: {
      tagId: sourceTag.id,
      revision: 1,
      operation: "created",
      actorUserId: actor.id,
      snapshotJson: { label: sourceTag.label, origin: "local-portability-dogfood" },
    },
  });
  const note = await prisma.studioDocument.create({
    data: {
      projectId: source.id,
      stableId: `qa-portable-note-${nonce}`,
      title: sourceNoteTitle,
      sourceLabel: "document-kind:note;origin:local-portability-dogfood",
      projectionStatus: "private",
      isPrivate: true,
    },
  });
  const noteBody = "Listen against the exact source before publishing.";
  const block = await prisma.studioDocumentBlock.create({
    data: {
      documentId: note.id,
      stableId: `qa-portable-block-${nonce}`,
      order: 0,
      body: noteBody,
      sourceLabel: "document-kind:note;origin:local-portability-dogfood",
      projectionStatus: "private",
      isPrivate: true,
    },
  });
  await Promise.all([
    prisma.studioDocumentTagLink.create({
      data: {
        documentId: note.id,
        tagId: sourceTag.id,
        createdByUserId: actor.id,
        sourceJson: { explicit: true, origin: "local-portability-dogfood" },
      },
    }),
    prisma.studioTaggedSpan.create({
      data: {
        documentId: note.id,
        blockId: block.id,
        tagId: sourceTag.id,
        startOffset: 0,
        endOffset: 6,
        selectedText: "Listen",
        documentStableId: note.stableId,
        documentTitleSnapshot: note.title,
        blockStableId: block.stableId,
        projectionStatus: "private",
        isPrivate: true,
        createdByLabel: email,
      },
    }),
  ]);
  const [task, goal] = await Promise.all([
    prisma.actionItem.create({
      data: {
        projectId: source.id,
        assignedUserId: actor.id,
        title: sourceTaskTitle,
        detail: "Verify the portable episode evidence.",
        dueAt: new Date(Date.now() + 86_400_000),
        sourceJson: { origin: "local-portability-dogfood" },
      },
    }),
    prisma.goal.create({
      data: {
        projectId: source.id,
        ownerUserId: actor.id,
        title: sourceGoalTitle,
        description: "Publish with evidence and retained source truth.",
        targetAt: new Date(Date.now() + 172_800_000),
        sourceJson: { origin: "local-portability-dogfood" },
      },
    }),
  ]);
  await Promise.all([
    prisma.actionItemTagLink.create({
      data: { actionItemId: task.id, tagId: sourceTag.id, createdByUserId: actor.id },
    }),
    prisma.goalTagLink.create({
      data: { goalId: goal.id, tagId: sourceTag.id, createdByUserId: actor.id },
    }),
    prisma.taskReminder.create({
      data: {
        id: `qa-portable-reminder-${nonce}`,
        actionItemId: task.id,
        ownerUserId: actor.id,
        remindAt: new Date(Date.now() + 82_800_000),
        sourceJson: { activeOnlyInSource: true },
      },
    }),
    prisma.goalProgressReceipt.create({
      data: {
        goalId: goal.id,
        actorUserId: actor.id,
        kind: "check-in",
        progressPercent: 20,
        note: "Source fixture ready.",
        occurredAt: new Date(),
        evidenceJson: { origin: "local-portability-dogfood" },
      },
    }),
    prisma.goalTaskLink.create({
      data: {
        goalId: goal.id,
        actionItemId: task.id,
        relationship: "CONTRIBUTES",
        createdByUserId: actor.id,
        sourceJson: { explicit: true },
      },
    }),
  ]);
  await prisma.workPlanBlock.create({
    data: {
      ownerUserId: actor.id,
      actionItemId: task.id,
      startsAt: new Date(Date.now() + 90_000_000),
      endsAt: new Date(Date.now() + 93_000_000),
      timezone: "America/Denver",
      sourceJson: { origin: "local-portability-dogfood" },
    },
  });
}

function runAuthenticatedIPhoneExport() {
  const script = path.join(
    repoRoot,
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  );
  const result = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: nestOrigin,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME: sourceName,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "nest-portability",
      QUIPSLY_CAPTURE_UI_TEST_DESTINATION:
        process.env.QUIPSLY_CAPTURE_UI_TEST_DESTINATION
        || "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3.1",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH:
        process.env.QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH
        || path.join(repoRoot, "apps/mobile-capture/HighGroundCapture/DerivedData"),
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(result.status === 0, `Authenticated iPhone portability journey exited ${result.status}.`);
}

async function operateAuthenticatedRestore() {
  const authorization = { authorization: `Bearer ${idToken}` };
  const exportedResponse = await localFetch(
    `${nestOrigin}/api/nests/${encodeURIComponent(sourceSlug)}/portable-export`,
    { headers: { ...authorization, accept: "application/json" } },
  );
  const exportedText = await exportedResponse.text();
  assert(exportedResponse.status === 200, "Authenticated portable export failed.", exportedText.slice(0, 200));
  const bundle = JSON.parse(exportedText);
  assert(bundle?.integrity?.manifestSha256, "Portable export has no manifest receipt.");
  assert(bundle.notes?.some((note) => note.title === sourceNoteTitle), "Portable export omitted the source note.");
  assert(bundle.tasks?.some((task) => task.title === sourceTaskTitle), "Portable export omitted the actor task.");
  assert(bundle.goals?.some((goal) => goal.title === sourceGoalTitle), "Portable export omitted the actor goal.");

  const restoreURL = `${nestOrigin}/api/nests/${encodeURIComponent(destinationSlug)}/portable-restore`;
  const restoreRequest = async (mode, planSha256 = "") => readJson(
    await localFetch(`${restoreURL}?mode=${mode}`, {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
        ...(planSha256 ? { "x-quipsly-restore-plan-sha256": planSha256 } : {}),
      },
      body: exportedText,
    }),
    `Portable restore ${mode}`,
  );

  const firstValidation = await restoreRequest("validate");
  assert(firstValidation.body?.requiresExplicitApply === true, "Validation did not require explicit apply.");
  assert(firstValidation.body?.plan?.overwrites === 0, "Validation proposed an overwrite.");
  assert(firstValidation.body?.plan?.externalSideEffects === 0, "Validation proposed an external effect.");
  const stalePlanSha256 = stringField(firstValidation.body, "planSha256", "Portable validation");

  await prisma.studioTag.create({
    data: {
      projectId: destinationProjectId,
      slug: `proof-listen-${nonce}`,
      label: `Destination meaning ${nonce}`,
      category: "meaning",
      nodeType: "principle",
      isPrivate: false,
    },
  });
  const staleApply = await readJson(
    await localFetch(`${restoreURL}?mode=apply`, {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
        "x-quipsly-restore-plan-sha256": stalePlanSha256,
      },
      body: exportedText,
    }),
    "Portable stale-plan apply",
    409,
  );
  assert(staleApply.body?.ok === false, "Stale apply did not fail closed.");
  const zeroAfterStale = await Promise.all([
    prisma.studioDocument.count({ where: { projectId: destinationProjectId } }),
    prisma.actionItem.count({ where: { projectId: destinationProjectId } }),
    prisma.goal.count({ where: { projectId: destinationProjectId } }),
  ]);
  assert(zeroAfterStale.every((count) => count === 0), "Stale apply wrote destination records.", zeroAfterStale);

  const currentValidation = await restoreRequest("validate");
  const currentPlanSha256 = stringField(currentValidation.body, "planSha256", "Portable revalidation");
  assert(currentPlanSha256 !== stalePlanSha256, "Destination drift did not change the reviewed plan token.");
  const firstApply = await restoreRequest("apply", currentPlanSha256);
  assert(firstApply.body?.receipt?.integrityRecomputed === true, "Apply did not recompute package integrity.");
  assert(firstApply.body?.planSha256 === currentPlanSha256, "Apply returned a different plan token.");
  assert(firstApply.body?.boundaries?.externalSideEffects === false, "Apply reported an external effect.");

  const staleRetry = await readJson(
    await localFetch(`${restoreURL}?mode=apply`, {
      method: "POST",
      headers: {
        ...authorization,
        "content-type": "application/json",
        "x-quipsly-restore-plan-sha256": currentPlanSha256,
      },
      body: exportedText,
    }),
    "Portable ambiguous retry with stale preview",
    409,
  );
  assert(staleRetry.body?.ok === false, "Retry reused a stale create plan.");
  const retryValidation = await restoreRequest("validate");
  assert(retryValidation.body?.plan?.noteCreates === 0, "Retry preview did not reuse the restored note.");
  assert(retryValidation.body?.plan?.taskCreates === 0, "Retry preview did not reuse the restored task.");
  assert(retryValidation.body?.plan?.goalCreates === 0, "Retry preview did not reuse the restored goal.");
  await restoreRequest(
    "apply",
    stringField(retryValidation.body, "planSha256", "Portable retry validation"),
  );

  const [notes, tasks, goals, planBlocks, reminders, sourceNotes] = await Promise.all([
    prisma.studioDocument.findMany({
      where: { projectId: destinationProjectId, title: sourceNoteTitle },
      select: { id: true, isPrivate: true, blocks: { select: { id: true } } },
    }),
    prisma.actionItem.findMany({
      where: { projectId: destinationProjectId, title: sourceTaskTitle },
      select: { id: true, assignedUserId: true },
    }),
    prisma.goal.findMany({
      where: { projectId: destinationProjectId, title: sourceGoalTitle },
      select: { id: true, ownerUserId: true },
    }),
    prisma.workPlanBlock.findMany({
      where: { ownerUserId: actorUserId, actionItem: { projectId: destinationProjectId } },
      select: { id: true, status: true, sourceJson: true },
    }),
    prisma.taskReminder.count({
      where: { actionItem: { projectId: destinationProjectId } },
    }),
    prisma.studioDocument.count({
      where: { projectId: sourceProjectId, title: sourceNoteTitle },
    }),
  ]);
  assert(notes.length === 1 && notes[0].isPrivate && notes[0].blocks.length === 1, "Restored note readback failed.", notes);
  assert(tasks.length === 1 && tasks[0].assignedUserId === actorUserId, "Restored task readback failed.", tasks);
  assert(goals.length === 1 && goals[0].ownerUserId === actorUserId, "Restored goal readback failed.", goals);
  assert(
    planBlocks.length === 1
      && planBlocks[0].status === "CANCELED"
      && planBlocks[0].sourceJson?.restoredCanceledForSafety === true,
    "Restored focus block was not canceled for safety.",
    planBlocks,
  );
  assert(reminders === 0, "Restore activated a reminder.", { reminders });
  assert(sourceNotes === 1, "Restore mutated the source note graph.", { sourceNotes });
}

async function deleteFirebaseIdentity() {
  if (!idToken || firebaseDeleted) return;
  await firebasePost("accounts:delete", { idToken }, "Firebase emulator identity cleanup");
  firebaseDeleted = true;
}

async function cleanup() {
  try {
    await deleteFirebaseIdentity();
  } catch (error) {
    console.error(`WARN Firebase cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const homeProject = await prisma.studioProject.findFirst({
    where: { slug: expectedHomeSlug, sourceLabel: "nest-kind:home" },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.studioProjectAccessGrant.deleteMany({ where: { email } });
    if (sourceProjectId || destinationProjectId) {
      await tx.studioProject.deleteMany({
        where: { id: { in: [sourceProjectId, destinationProjectId].filter(Boolean) } },
      });
    }
    if (workspaceId) await tx.studioWorkspace.deleteMany({ where: { id: workspaceId } });
    if (homeProject) await tx.studioProject.deleteMany({ where: { id: homeProject.id } });
    await tx.user.deleteMany({ where: { primaryEmail: email } });
  });
  const [users, projects, grants, workspaces] = await Promise.all([
    prisma.user.count({ where: { primaryEmail: email } }),
    prisma.studioProject.count({ where: { slug: { in: [sourceSlug, destinationSlug, expectedHomeSlug] } } }),
    prisma.studioProjectAccessGrant.count({ where: { email } }),
    prisma.studioWorkspace.count({ where: { id: workspaceId || "missing" } }),
  ]);
  assert(users === 0 && projects === 0 && grants === 0 && workspaces === 0, "Disposable database cleanup left residue.", {
    users,
    projects,
    grants,
    workspaces,
  });
  const deletedSignIn = await localFetch(
    `${identityToolkit}/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert(!deletedSignIn.ok, "Disposable Firebase emulator identity still signs in.");
}

async function main() {
  let primaryError;
  try {
    await readJson(await localFetch(`${nestOrigin}/api/health`), "Local Nest health");
    await createVerifiedIdentity();
    await createCanonicalFixtures();
    console.log("PASS Disposable verified owner and canonical portability fixtures created.");
    runAuthenticatedIPhoneExport();
    console.log("PASS Compiled iPhone created two versioned authenticated Nest backups.");
    await operateAuthenticatedRestore();
    console.log("PASS Authenticated HTTP restore refused drift, revalidated, restored, and replayed safely.");
  } catch (error) {
    primaryError = error;
    console.error(`FAIL Operated portability journey: ${error instanceof Error ? error.stack : String(error)}`);
    if (error?.cause instanceof Error) console.error(`Caused by: ${error.cause.stack}`);
  }

  try {
    await cleanup();
    console.log("PASS Disposable Firebase and PostgreSQL portability fixtures are absent after cleanup.");
  } catch (cleanupError) {
    if (primaryError) {
      console.error(`Cleanup also failed: ${cleanupError instanceof Error ? cleanupError.stack : String(cleanupError)}`);
    } else {
      primaryError = cleanupError;
    }
  } finally {
    await prisma.$disconnect();
  }

  if (primaryError) throw primaryError;
  console.log(JSON.stringify({
    ok: true,
    resultBundle,
    sourceName,
    destinationName,
    authenticatedHTTP: true,
    physicalIPhone: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  if (error?.details !== undefined) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
