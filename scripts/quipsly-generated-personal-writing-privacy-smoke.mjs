#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const EMAIL_PATTERN =
  /^codex-writing-privacy-(owner|editor)-[a-f0-9]{10}@dev\.test$/i;
const PROJECT_NAME_PREFIX = "Codex personal-writing privacy ";

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function mergedEnv() {
  const env = {
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...process.env,
  };
  if (!env.FIREBASE_PROJECT_ID && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    env.FIREBASE_PROJECT_ID = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  }
  const proxyPort = env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT?.trim();
  if (proxyPort && env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    const socketHost = url.searchParams.get("host") || "";
    if (socketHost.startsWith("/cloudsql/")) {
      url.hostname = "127.0.0.1";
      url.port = proxyPort;
      url.searchParams.delete("host");
      env.DATABASE_URL = url.toString();
    }
  }
  return env;
}

export function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const equals = current.indexOf("=");
    if (equals > 2) {
      parsed.set(current.slice(2, equals), current.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(current.slice(2), next);
      index += 1;
    } else {
      parsed.set(current.slice(2), "1");
    }
  }
  return parsed;
}

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`Missing ${name}.`);
  return normalized;
}

function assert(condition, message, details = undefined) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

export function redactEmail(email) {
  return { sha256: sha256(email), domain: "dev.test" };
}

export function homeNestSlug(email) {
  return `home-${email
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)}`;
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: required(env.DATABASE_URL, "DATABASE_URL"),
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    }),
    log: ["error"],
  });
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function requestJson(url, options = {}) {
  const result = await requestText(url, options);
  let body = {};
  try {
    body = JSON.parse(result.text);
  } catch {
    body = { unparsedBodyPrefix: result.text.slice(0, 200) };
  }
  return { ...result, body };
}

export function parseSessionCookie(setCookie) {
  return (
    String(setCookie || "")
      .split(",")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith("session="))
      ?.split(";")[0] || ""
  );
}

async function firebaseApiKey(env, baseUrl) {
  if (env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY) {
    return env.QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY;
  }
  if (env.NEXT_PUBLIC_FIREBASE_API_KEY) return env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const config = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  assert(
    config.response.status === 200 &&
      config.body?.ok === true &&
      config.body?.firebase?.apiKey,
    "Preview did not return the Firebase client configuration.",
    { status: config.response.status },
  );
  return config.body.firebase.apiKey;
}

function firebaseAdmin(env) {
  const projectId =
    env.FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "quipsly-reef";
  if (!getApps().length) initializeApp({ projectId });
  return getAuth();
}

async function firebasePasswordSignIn(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  assert(
    response.ok && body.idToken,
    `Disposable Firebase sign-in failed with HTTP ${response.status}.`,
    { code: body?.error?.message || null },
  );
  return body.idToken;
}

async function createAppSession(baseUrl, idToken, email) {
  const result = await requestJson(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = parseSessionCookie(result.response.headers.get("set-cookie"));
  assert(
    result.response.status === 200 &&
      result.body?.user?.id &&
      String(result.body?.user?.email || "").toLowerCase() === email &&
      result.body?.homeNest?.slug &&
      result.body?.onboarding?.freeMembershipStatus === "ACTIVE" &&
      cookie,
    `Disposable Quipsly session exchange failed with HTTP ${result.response.status}.`,
    { body: result.body },
  );
  return {
    idToken,
    cookie,
    userId: result.body.user.id,
    homeNestSlug: result.body.homeNest.slug,
  };
}

async function createSharedNest(baseUrl, owner, suffix) {
  const clientRequestId = crypto.randomUUID();
  const name = `${PROJECT_NAME_PREFIX}${suffix}`;
  const result = await requestJson(`${baseUrl}/api/mobile/capture/projects`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name,
      description:
        "Disposable same-Nest collaborator privacy acceptance; no external effects.",
      nestKind: "production",
      clientRequestId,
    }),
  });
  assert(
    result.response.status === 200 &&
      result.body?.ok === true &&
      result.body?.project?.id &&
      result.body?.project?.slug &&
      result.body?.project?.role === "OWNER",
    `Preview could not create the disposable privacy Nest. HTTP ${result.response.status}.`,
    { body: result.body },
  );
  return {
    id: result.body.project.id,
    slug: result.body.project.slug,
    name,
  };
}

async function seedCollaboratorAndPrivateAnnotation({
  prisma,
  owner,
  ownerEmail,
  editorEmail,
  project,
  suffix,
}) {
  await prisma.studioProjectAccessGrant.upsert({
    where: { projectId_email: { projectId: project.id, email: editorEmail } },
    create: {
      projectId: project.id,
      email: editorEmail,
      role: "EDITOR",
      status: "ACTIVE",
      createdByUserId: owner.userId,
      createdByEmail: ownerEmail,
      note: "Disposable deployed personal-writing privacy proof.",
    },
    update: {
      role: "EDITOR",
      status: "ACTIVE",
      createdByUserId: owner.userId,
      createdByEmail: ownerEmail,
      note: "Disposable deployed personal-writing privacy proof.",
    },
  });

  const immutableText = [
    "Shared source text stays available to project collaborators.",
    `The private response marker is deliberately outside this source ${suffix}.`,
  ].join(" ");
  const exactText = "Shared source text stays available";
  const startOffset = immutableText.indexOf(exactText);
  const sourceFingerprint = sha256(immutableText);
  const privateResponse = `OWNER-ONLY-RESPONSE-${suffix}`;
  const source = await prisma.studioSourceUnit.create({
    data: {
      projectId: project.id,
      slug: `privacy-source-${suffix}`,
      kind: "note",
      title: `Shared privacy source ${suffix}`,
      immutableText,
      createdByEmail: ownerEmail,
      metadataJson: {
        source: "quipsly-generated-personal-writing-privacy-smoke",
        disposable: true,
        immutable: true,
      },
    },
    select: { id: true },
  });
  const annotation = await prisma.studioSourceAnnotation.create({
    data: {
      projectId: project.id,
      sourceUnitId: source.id,
      createdByUserId: owner.userId,
      createdByEmailSnapshot: ownerEmail,
      kind: "question",
      status: "active",
      visibility: "private",
      body: privateResponse,
      selectorKind: "text-quote",
      startOffset,
      endOffset: startOffset + exactText.length,
      exactText,
      prefixText: "",
      suffixText: immutableText.slice(startOffset + exactText.length, 120),
      sourceFingerprint,
      clientRequestId: crypto.randomUUID(),
      provenanceJson: {
        kind: "quipsly-source-annotation-v1",
        surface: "deployed-privacy-smoke",
        humanAuthored: true,
        sourceMutated: false,
      },
      revisions: {
        create: {
          revision: 1,
          operation: "created",
          actorUserId: owner.userId,
          snapshotJson: {
            visibility: "private",
            body: privateResponse,
            exactText,
            sourceFingerprint,
          },
        },
      },
    },
    select: { id: true, updatedAt: true },
  });
  return {
    id: annotation.id,
    updatedAt: annotation.updatedAt.toISOString(),
    privateResponse,
    sourceFingerprint,
  };
}

async function createOwnerDraft(baseUrl, owner, project, annotation) {
  const clientRequestId = crypto.randomUUID();
  const result = await requestJson(`${baseUrl}/api/mobile/capture/today`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "source-annotation-draft",
      id: annotation.id,
      projectSlug: project.slug,
      clientRequestId,
      expectedUpdatedAt: annotation.updatedAt,
    }),
  });
  assert(
    result.response.status === 200 &&
      result.body?.ok === true &&
      result.body?.documentId &&
      result.body?.blockId &&
      result.body?.responseBlockId &&
      result.body?.reused === false,
    `Owner could not create a private writing draft through the preview. HTTP ${result.response.status}.`,
    { body: result.body },
  );
  return {
    clientRequestId,
    documentId: result.body.documentId,
    evidenceBlockId: result.body.blockId,
    responseBlockId: result.body.responseBlockId,
    href: result.body.href,
  };
}

async function canonicalDraftSnapshot(prisma, owner, draft) {
  const document = await prisma.studioDocument.findUnique({
    where: { id: draft.documentId },
    select: {
      id: true,
      projectId: true,
      personalOwnerUserId: true,
      title: true,
      sourceLabel: true,
      isPrivate: true,
      tagRevision: true,
      updatedAt: true,
      blocks: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          stableId: true,
          body: true,
          externalId: true,
          updatedAt: true,
        },
      },
    },
  });
  const useCount = await prisma.studioSourceAnnotationUse.count({
    where: {
      documentId: draft.documentId,
      createdByUserId: owner.userId,
      archivedAt: null,
    },
  });
  assert(
    document?.personalOwnerUserId === owner.userId &&
      document.isPrivate === true &&
      document.sourceLabel === "Quipsly evidence draft" &&
      document.blocks.some((block) => block.id === draft.evidenceBlockId) &&
      document.blocks.some((block) => block.id === draft.responseBlockId) &&
      useCount === 1,
    "Canonical readback did not retain exactly one actor-owned private draft.",
    { document, useCount },
  );
  return {
    id: document.id,
    title: document.title,
    tagRevision: document.tagRevision,
    updatedAt: document.updatedAt.toISOString(),
    blocks: document.blocks.map((block) => ({
      id: block.id,
      stableId: block.stableId,
      body: block.body,
      externalId: block.externalId,
      updatedAt: block.updatedAt.toISOString(),
    })),
    useCount,
  };
}

export function assertIncludes(text, markers, message) {
  const missing = markers.filter((marker) => !text.includes(marker));
  assert(missing.length === 0, message, { missing });
}

export function assertExcludes(text, markers, message) {
  const leaked = markers.filter((marker) => text.includes(marker));
  assert(leaked.length === 0, message, { leaked });
}

async function proveOwnerReadback({
  baseUrl,
  owner,
  project,
  annotation,
  draft,
}) {
  const createPage = await requestText(`${baseUrl}${draft.href}`, {
    headers: { cookie: owner.cookie },
    redirect: "manual",
  });
  assert(
    createPage.response.status === 200,
    `Owner writing page returned HTTP ${createPage.response.status}.`,
  );
  assertIncludes(
    createPage.text,
    [draft.documentId, draft.responseBlockId, annotation.privateResponse],
    "Owner writing page did not render the exact private response draft.",
  );

  const library = await requestText(`${baseUrl}/library`, {
    headers: { cookie: owner.cookie },
  });
  assert(library.response.status === 200, "Owner Library did not render.");
  assertIncludes(
    library.text,
    [draft.documentId, annotation.privateResponse],
    "Owner Library did not contain the private writing draft.",
  );

  const nest = await requestText(`${baseUrl}/nests/${project.slug}`, {
    headers: { cookie: owner.cookie },
  });
  assert(nest.response.status === 200, "Owner Nest dashboard did not render.");
  assertIncludes(
    nest.text,
    [project.name, draft.documentId],
    "Owner Nest dashboard did not link the private writing document.",
  );

  const research = await requestJson(
    `${baseUrl}/api/research/export?project=${encodeURIComponent(project.slug)}`,
    { headers: { cookie: owner.cookie } },
  );
  const researchText = JSON.stringify(research.body);
  assert(
    research.response.status === 200 &&
      research.body?.boundaries?.privateWritingTargetsLimitedToCreator === true,
    "Owner Research export did not report actor-scoped writing boundaries.",
  );
  assertIncludes(
    researchText,
    [annotation.id, annotation.privateResponse, draft.documentId],
    "Owner Research export omitted the private annotation or writing target.",
  );

  const portable = await requestText(
    `${baseUrl}/api/nests/${encodeURIComponent(project.slug)}/portable-export`,
    { headers: { cookie: owner.cookie } },
  );
  assert(
    portable.response.status === 200,
    "Owner portable Nest export failed.",
  );
  assertIncludes(
    portable.text,
    [draft.documentId, annotation.privateResponse],
    "Owner portable Nest export omitted the private draft.",
  );

  return {
    createPage: true,
    library: true,
    nestDashboard: true,
    researchExport: true,
    portableExport: true,
  };
}

async function proveCollaboratorDenial({
  baseUrl,
  editor,
  project,
  annotation,
  draft,
  snapshot,
}) {
  const authorization = `Bearer ${editor.idToken}`;
  const projects = await requestJson(`${baseUrl}/api/mobile/capture/projects`, {
    headers: { authorization },
  });
  const shared = Array.isArray(projects.body?.projects)
    ? projects.body.projects.find((entry) => entry.id === project.id)
    : null;
  assert(
    projects.response.status === 200 &&
      projects.body?.ok === true &&
      shared?.role === "EDITOR" &&
      shared?.canWrite === true,
    "Second account was not a real writable collaborator in the same Nest.",
    { shared },
  );

  const nest = await requestText(`${baseUrl}/nests/${project.slug}`, {
    headers: { cookie: editor.cookie },
  });
  assert(
    nest.response.status === 200 && nest.text.includes(project.name),
    "Collaborator could not render the shared Nest.",
  );

  const privateMarkers = [
    annotation.id,
    annotation.privateResponse,
    draft.documentId,
    draft.evidenceBlockId,
    draft.responseBlockId,
  ];
  assertExcludes(
    nest.text,
    privateMarkers,
    "Collaborator Nest dashboard leaked the owner's private draft.",
  );

  const today = await requestText(`${baseUrl}/api/mobile/capture/today`, {
    headers: { authorization },
  });
  assert(
    today.response.status === 200,
    "Collaborator Today projection failed.",
  );
  assertExcludes(
    today.text,
    privateMarkers,
    "Collaborator Today projection leaked private annotation or draft identity.",
  );

  const research = await requestJson(
    `${baseUrl}/api/research/export?project=${encodeURIComponent(project.slug)}`,
    { headers: { cookie: editor.cookie } },
  );
  assert(
    research.response.status === 200 &&
      research.body?.boundaries?.privateAnnotationsLimitedToExporter === true &&
      research.body?.boundaries?.privateWritingTargetsLimitedToCreator === true,
    "Collaborator Research export did not report private actor scoping.",
  );
  assertExcludes(
    JSON.stringify(research.body),
    privateMarkers,
    "Collaborator Research export leaked private annotation or writing target.",
  );

  const library = await requestText(`${baseUrl}/library`, {
    headers: { cookie: editor.cookie },
  });
  assert(
    library.response.status === 200,
    "Collaborator Library did not render.",
  );
  assertExcludes(
    library.text,
    privateMarkers,
    "Collaborator Library leaked the owner's private draft.",
  );

  const guessed = await requestText(
    `${baseUrl}/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(draft.documentId)}&block=${encodeURIComponent(draft.responseBlockId)}`,
    { headers: { cookie: editor.cookie }, redirect: "manual" },
  );
  const guessedLocation = guessed.response.headers.get("location") || "";
  assert(
    [303, 307, 308].includes(guessed.response.status) &&
      guessedLocation.includes("/projects?") &&
      guessedLocation.includes("documentUnavailable=1"),
    "A guessed private writing URL did not fail closed to the unavailable-document surface.",
    { status: guessed.response.status, location: guessedLocation },
  );
  assertExcludes(
    guessed.text,
    privateMarkers,
    "Guessed private writing response leaked content before redirect.",
  );

  const draftAttempt = await requestJson(
    `${baseUrl}/api/mobile/capture/today`,
    {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "source-annotation-draft",
        id: annotation.id,
        projectSlug: project.slug,
        clientRequestId: crypto.randomUUID(),
        expectedUpdatedAt: annotation.updatedAt,
      }),
    },
  );
  assert(
    draftAttempt.response.status === 404 &&
      draftAttempt.body?.ok === false &&
      draftAttempt.body?.code === "NOT_FOUND",
    "Collaborator could start or replay a draft from the owner's private annotation.",
    { status: draftAttempt.response.status, body: draftAttempt.body },
  );

  const annotationAttempt = await requestJson(
    `${baseUrl}/api/mobile/capture/today`,
    {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "source-annotation-status",
        id: annotation.id,
        expectedUpdatedAt: annotation.updatedAt,
        nextStatus: "resolved",
      }),
    },
  );
  assert(
    annotationAttempt.response.status === 404 &&
      annotationAttempt.body?.ok === false,
    "Collaborator could change the owner's private annotation.",
    { status: annotationAttempt.response.status, body: annotationAttempt.body },
  );

  const responseBlock = snapshot.blocks.find(
    (block) => block.id === draft.responseBlockId,
  );
  assert(
    responseBlock,
    "Canonical response block was missing before denial attempts.",
  );
  const noteAttempt = await requestJson(
    `${baseUrl}/api/mobile/capture/work/notes/${encodeURIComponent(draft.documentId)}`,
    {
      method: "PATCH",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedContentRevision: "0".repeat(64),
        clientRequestId: crypto.randomUUID(),
        title: "Unauthorized collaborator rewrite",
        blocks: [
          {
            id: responseBlock.id,
            stableId: responseBlock.stableId,
            body: "UNAUTHORIZED-COLLABORATOR-WRITE",
          },
        ],
      }),
    },
  );
  assert(
    noteAttempt.response.status === 404 &&
      noteAttempt.body?.ok === false &&
      noteAttempt.body?.code === "NOT_FOUND",
    "Collaborator could reach the private document through canonical note editing.",
    { status: noteAttempt.response.status, body: noteAttempt.body },
  );

  const tagAttempt = await requestJson(`${baseUrl}/api/work/tags`, {
    method: "POST",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      entityKind: "document",
      entityId: draft.documentId,
      tagIds: [],
      newTagLabels: ["Unauthorized collaborator tag"],
      expectedUpdatedAt: snapshot.updatedAt,
      expectedTagRevision: snapshot.tagRevision,
      clientRequestId: crypto.randomUUID(),
    }),
  });
  assert(
    [403, 404].includes(tagAttempt.response.status) &&
      tagAttempt.body?.ok === false &&
      ["FORBIDDEN", "NOT_FOUND"].includes(tagAttempt.body?.code),
    "Collaborator could mutate tags on the owner's private document.",
    { status: tagAttempt.response.status, body: tagAttempt.body },
  );

  return {
    sameNestEditor: true,
    sharedNestRendered: true,
    todayProjectionExcluded: true,
    researchExportExcluded: true,
    libraryExcluded: true,
    guessedUrlFailedClosed: true,
    annotationDraftDenied: true,
    annotationStatusDenied: true,
    documentEditDenied: true,
    documentTagMutationDenied: true,
  };
}

async function assertCanonicalStateUnchanged({
  prisma,
  annotation,
  draft,
  before,
}) {
  const after = await prisma.studioDocument.findUnique({
    where: { id: draft.documentId },
    select: {
      personalOwnerUserId: true,
      tagRevision: true,
      updatedAt: true,
      blocks: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          stableId: true,
          body: true,
          externalId: true,
          updatedAt: true,
        },
      },
    },
  });
  const annotationAfter = await prisma.studioSourceAnnotation.findUnique({
    where: { id: annotation.id },
    select: { status: true, body: true, updatedAt: true },
  });
  const useCount = await prisma.studioSourceAnnotationUse.count({
    where: { documentId: draft.documentId, archivedAt: null },
  });
  const unauthorizedTagCount = await prisma.studioTag.count({
    where: {
      projectId: before.projectId,
      label: "Unauthorized collaborator tag",
    },
  });
  const normalizedAfter = after
    ? {
        personalOwnerUserId: after.personalOwnerUserId,
        tagRevision: after.tagRevision,
        updatedAt: after.updatedAt.toISOString(),
        blocks: after.blocks.map((block) => ({
          id: block.id,
          stableId: block.stableId,
          body: block.body,
          externalId: block.externalId,
          updatedAt: block.updatedAt.toISOString(),
        })),
      }
    : null;
  const normalizedBefore = {
    personalOwnerUserId: before.personalOwnerUserId,
    tagRevision: before.tagRevision,
    updatedAt: before.updatedAt,
    blocks: before.blocks,
  };
  assert(
    JSON.stringify(normalizedAfter) === JSON.stringify(normalizedBefore) &&
      annotationAfter?.status === "active" &&
      annotationAfter.body === annotation.privateResponse &&
      annotationAfter.updatedAt.toISOString() === annotation.updatedAt &&
      useCount === 1 &&
      unauthorizedTagCount === 0,
    "Canonical private-writing state changed during collaborator denial attempts.",
    {
      documentEqual:
        JSON.stringify(normalizedAfter) === JSON.stringify(normalizedBefore),
      annotationStatus: annotationAfter?.status,
      useCount,
      unauthorizedTagCount,
    },
  );
  return {
    documentBytesUnchanged: true,
    annotationUnchanged: true,
    oneWritingUsePreserved: true,
    unauthorizedTagAbsent: true,
  };
}

async function cleanupArtifacts({ env, emails, projectId }) {
  for (const email of emails) {
    assert(
      EMAIL_PATTERN.test(email),
      `Refusing cleanup for non-generated email ${email}.`,
    );
  }
  const prisma = createPrisma(env);
  const cleanup = {
    sharedProjects: 0,
    homeProjects: 0,
    grants: 0,
    invites: 0,
    memberships: 0,
    users: 0,
    firebaseUsers: 0,
    databaseResidueAbsent: false,
    firebaseResidueAbsent: false,
  };
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { primaryEmail: { in: emails } },
          { aliases: { some: { email: { in: emails } } } },
        ],
      },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const sharedProjects = await prisma.studioProject.findMany({
      where: {
        OR: [
          ...(projectId ? [{ id: projectId }] : []),
          {
            name: { startsWith: PROJECT_NAME_PREFIX },
            accessGrants: { some: { email: { in: emails } } },
          },
        ],
      },
      select: { id: true },
    });
    for (const project of sharedProjects) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      cleanup.sharedProjects += 1;
    }
    const homeProjects = await prisma.studioProject.findMany({
      where: {
        slug: { in: emails.map(homeNestSlug) },
        sourceLabel: "nest-kind:home",
      },
      select: { id: true },
    });
    for (const project of homeProjects) {
      await prisma.studioProject.delete({ where: { id: project.id } });
      cleanup.homeProjects += 1;
    }
    cleanup.invites = (
      await prisma.studioNestInvite.deleteMany({
        where: { email: { in: emails } },
      })
    ).count;
    cleanup.grants = (
      await prisma.studioProjectAccessGrant.deleteMany({
        where: { email: { in: emails } },
      })
    ).count;
    if (userIds.length) {
      cleanup.memberships = (
        await prisma.membership.deleteMany({
          where: { userId: { in: userIds } },
        })
      ).count;
    }
    cleanup.users = (
      await prisma.user.deleteMany({
        where: {
          OR: [
            { primaryEmail: { in: emails } },
            { aliases: { some: { email: { in: emails } } } },
          ],
        },
      })
    ).count;
    const [
      remainingUsers,
      remainingGrants,
      remainingInvites,
      remainingProjects,
    ] = await prisma.$transaction([
      prisma.user.count({
        where: {
          OR: [
            { primaryEmail: { in: emails } },
            { aliases: { some: { email: { in: emails } } } },
          ],
        },
      }),
      prisma.studioProjectAccessGrant.count({
        where: { email: { in: emails } },
      }),
      prisma.studioNestInvite.count({ where: { email: { in: emails } } }),
      prisma.studioProject.count({
        where: {
          OR: [
            { slug: { in: emails.map(homeNestSlug) } },
            {
              name: { startsWith: PROJECT_NAME_PREFIX },
              accessGrants: { some: { email: { in: emails } } },
            },
          ],
        },
      }),
    ]);
    assert(
      [
        remainingUsers,
        remainingGrants,
        remainingInvites,
        remainingProjects,
      ].every((count) => count === 0),
      "Disposable privacy database cleanup left residue.",
      { remainingUsers, remainingGrants, remainingInvites, remainingProjects },
    );
    cleanup.databaseResidueAbsent = true;
  } finally {
    await prisma.$disconnect();
  }

  const auth = firebaseAdmin(env);
  for (const email of emails) {
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
      cleanup.firebaseUsers += 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }
  for (const email of emails) {
    try {
      await auth.getUserByEmail(email);
      throw new Error(
        "Disposable Firebase privacy user remains after cleanup.",
      );
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }
  cleanup.firebaseResidueAbsent = true;
  return cleanup;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help") || args.has("h")) {
    process.stdout.write(
      [
        "Usage:",
        "  DATABASE_URL=<secret> QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT=<port> \\",
        "  node scripts/quipsly-generated-personal-writing-privacy-smoke.mjs \\",
        "    --base-url https://preview.example --expected-source-sha <sha> [--output receipt.json]",
        "",
        "The target must identify itself as a zero-traffic preview channel.",
        "Two disposable verified Firebase accounts and all canonical fixtures are removed.",
        "",
      ].join("\n"),
    );
    return;
  }

  const env = mergedEnv();
  const baseUrl = required(
    args.get("base-url") || env.QUIPSLY_PERSONAL_WRITING_PRIVACY_BASE_URL,
    "--base-url or QUIPSLY_PERSONAL_WRITING_PRIVACY_BASE_URL",
  ).replace(/\/+$/, "");
  const expectedSourceSha = required(
    args.get("expected-source-sha") ||
      env.QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA,
    "--expected-source-sha or QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA",
  );
  assert(/^https:\/\//.test(baseUrl), "Deployed privacy proof requires HTTPS.");
  const suffix = crypto.randomBytes(5).toString("hex");
  const ownerEmail = `codex-writing-privacy-owner-${suffix}@dev.test`;
  const editorEmail = `codex-writing-privacy-editor-${suffix}@dev.test`;
  const emails = [ownerEmail, editorEmail];
  const password = `${crypto.randomBytes(24).toString("base64url")}Aa9!`;
  const receipt = {
    schema: "quipsly-deployed-personal-writing-privacy-smoke-v1",
    startedAt: new Date().toISOString(),
    baseUrl,
    expectedSourceSha,
    identities: {
      owner: redactEmail(ownerEmail),
      editor: redactEmail(editorEmail),
    },
    target: null,
    ownerReadback: null,
    collaboratorDenial: null,
    canonicalState: null,
    cleanup: null,
    ok: false,
  };
  let projectId = "";
  let runError = null;
  try {
    const health = await requestJson(`${baseUrl}/api/health`);
    const release = health.body?.quipsly?.release;
    const runtime = health.body?.quipsly?.runtime;
    assert(
      health.response.status === 200 &&
        health.body?.ok === true &&
        release?.releaseChannel === "preview" &&
        release?.sourceSha === expectedSourceSha &&
        release?.imageTag === expectedSourceSha &&
        runtime?.revisionName,
      "Target is not the exact expected zero-traffic preview source.",
      { status: health.response.status, release, runtime },
    );
    receipt.target = {
      releaseChannel: release.releaseChannel,
      sourceSha: release.sourceSha,
      imageTag: release.imageTag,
      revisionName: runtime.revisionName,
    };

    const preflight = await requestJson(
      `${baseUrl}/api/auth/firebase-admin-preflight`,
    );
    assert(
      preflight.response.status === 200 && preflight.body?.ok === true,
      "Preview Firebase Admin preflight failed.",
      { status: preflight.response.status, body: preflight.body },
    );
    const apiKey = await firebaseApiKey(env, baseUrl);
    const auth = firebaseAdmin(env);
    await auth.createUser({
      email: ownerEmail,
      password,
      displayName: "Codex Privacy Owner",
      emailVerified: true,
      disabled: false,
    });
    await auth.createUser({
      email: editorEmail,
      password,
      displayName: "Codex Privacy Editor",
      emailVerified: true,
      disabled: false,
    });
    const owner = await createAppSession(
      baseUrl,
      await firebasePasswordSignIn(apiKey, ownerEmail, password),
      ownerEmail,
    );
    const editor = await createAppSession(
      baseUrl,
      await firebasePasswordSignIn(apiKey, editorEmail, password),
      editorEmail,
    );
    const project = await createSharedNest(baseUrl, owner, suffix);
    projectId = project.id;
    const prisma = createPrisma(env);
    try {
      const annotation = await seedCollaboratorAndPrivateAnnotation({
        prisma,
        owner,
        ownerEmail,
        editorEmail,
        project,
        suffix,
      });
      const draft = await createOwnerDraft(baseUrl, owner, project, annotation);
      const before = await canonicalDraftSnapshot(prisma, owner, draft);
      before.projectId = project.id;
      before.personalOwnerUserId = owner.userId;
      receipt.ownerReadback = await proveOwnerReadback({
        baseUrl,
        owner,
        project,
        annotation,
        draft,
      });
      receipt.collaboratorDenial = await proveCollaboratorDenial({
        baseUrl,
        editor,
        project,
        annotation,
        draft,
        snapshot: before,
      });
      receipt.canonicalState = await assertCanonicalStateUnchanged({
        prisma,
        annotation,
        draft,
        before,
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    runError = error;
    receipt.error = {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
    };
  } finally {
    try {
      receipt.cleanup = await cleanupArtifacts({
        env,
        emails,
        projectId,
      });
    } catch (cleanupError) {
      receipt.cleanup = {
        ok: false,
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      };
      if (!runError) runError = cleanupError;
    }
  }

  receipt.finishedAt = new Date().toISOString();
  receipt.ok =
    !runError &&
    receipt.cleanup?.databaseResidueAbsent === true &&
    receipt.cleanup?.firebaseResidueAbsent === true;
  const output = JSON.stringify(receipt, null, 2);
  const outputPath =
    args.get("output") || env.QUIPSLY_PERSONAL_WRITING_PRIVACY_OUTPUT;
  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), `${output}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${output}\n`);
  if (runError) throw runError;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(
      `QUIPSLY_PERSONAL_WRITING_PRIVACY_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
