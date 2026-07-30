#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function applyCloudSqlProxyRewrite(env) {
  const proxyPort = env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT?.trim();
  if (!proxyPort || !env.DATABASE_URL) return env;

  const url = new URL(env.DATABASE_URL);
  const socketHost = url.searchParams.get("host") || "";
  if (!socketHost.startsWith("/cloudsql/")) return env;

  url.hostname = "127.0.0.1";
  url.port = proxyPort;
  url.searchParams.delete("host");

  return {
    ...env,
    DATABASE_URL: url.toString(),
  };
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

  return applyCloudSqlProxyRewrite(env);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function baseUrlFromEnv(env) {
  return normalizeBaseUrl(
    args.get("base-url")
      || env.QUIPSLY_MOBILE_CAPTURE_BASE_URL
      || env.QUIPSLY_NATIVE_SMOKE_BASE_URL
      || env.QUIPSLY_AUTH_SMOKE_BASE_URL
      || "http://127.0.0.1:3000",
  );
}

function requiredEnv(env, name, fallback = undefined) {
  const value = env[name] || fallback;
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function isGeneratedMobileEmail(email) {
  return /^codex-mobile-capture-[a-f0-9]{8}@dev\.test$/i.test(String(email || "").trim());
}

function redactGeneratedEmail(email) {
  return String(email || "").replace(/^codex-mobile-capture-([a-f0-9]{4})[a-f0-9]{4}/i, "codex-mobile-capture-$1****");
}

function slugifyEmailForHomeNest(email) {
  return email
    .toLowerCase()
    .trim()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function prismaConnectionTimeoutMillis(env) {
  return Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000;
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: prismaConnectionTimeoutMillis(env),
    }),
    log: ["error"],
  });
}

async function requestJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const safeToRetry = method === "GET" || method === "HEAD";
  const attempts = safeToRetry ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const requestOptions = attempt === 0
        ? options
        : {
          ...options,
          headers: {
            ...Object.fromEntries(new Headers(options.headers || {}).entries()),
            connection: "close",
          },
        };
      const response = await fetch(url, requestOptions);
      const text = await response.text();
      let body = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { unparsedBodyPrefix: text.slice(0, 160) };
      }
      return { response, body, text };
    } catch (error) {
      if (attempt + 1 >= attempts) {
        const causeCode = error?.cause?.code
          ? ` (${String(error.cause.code)})`
          : "";
        throw new Error(
          `${method} ${new URL(url).pathname} transport failed after ${attempts} attempt${attempts === 1 ? "" : "s"}${causeCode}.`,
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`${method} ${new URL(url).pathname} transport failed.`);
}

async function assertServerFirebaseAdminPreflight(baseUrl) {
  const preflight = await requestJson(`${baseUrl}/api/auth/firebase-admin-preflight`);
  if (preflight.response.status === 200 && preflight.body?.ok === true) return;

  if (preflight.response.status === 503 && preflight.body?.error === "Firebase Admin credential unavailable") {
    throw new Error(
      [
        "Server Firebase Admin preflight failed before generated mobile capture smoke.",
        preflight.body?.action || "Refresh ADC or provide server Firebase Admin credentials.",
        preflight.body?.firebaseAdminRuntime
          ? `Runtime: ${JSON.stringify(preflight.body.firebaseAdminRuntime)}`
          : "",
      ].filter(Boolean).join(" "),
    );
  }

  throw new Error(
    `Server Firebase Admin preflight returned HTTP ${preflight.response.status}: ${preflight.text.slice(0, 160)}`,
  );
}

async function fetchFirebaseApiKey(env, baseUrl) {
  if (env.QUIPSLY_MOBILE_CAPTURE_SMOKE_FIREBASE_API_KEY) return env.QUIPSLY_MOBILE_CAPTURE_SMOKE_FIREBASE_API_KEY;
  if (env.NEXT_PUBLIC_FIREBASE_API_KEY) return env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const config = await requestJson(`${baseUrl}/api/mac/firebase-client-config`);
  assert(
    config.response.status === 200 && config.body?.ok === true && config.body?.firebase?.apiKey,
    `Firebase client config endpoint did not return an API key. HTTP ${config.response.status}`,
    { body: config.body },
  );
  return config.body.firebase.apiKey;
}

async function firebaseSelfServeSignup(env, baseUrl, email, password) {
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  assert(
    response.ok && body.idToken && body.localId,
    `Firebase generated mobile capture signup failed with HTTP ${response.status}`,
    { firebaseErrorCode: body?.error?.message || undefined },
  );
  return body;
}

async function markGeneratedFirebaseEmailVerified(env, email, firebaseUid) {
  if (!isGeneratedMobileEmail(email)) {
    throw new Error(`Refusing to verify non-generated mobile capture smoke email: ${email}`);
  }

  const firebaseProjectId =
    env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef";
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  }

  const firebaseUser = await getAuth().getUser(firebaseUid);
  assert(
    String(firebaseUser.email || "").trim().toLowerCase() === email.toLowerCase(),
    "Generated Firebase UID did not resolve to the disposable smoke email.",
  );
  await getAuth().updateUser(firebaseUid, { emailVerified: true });
}

async function firebasePasswordSignIn(env, baseUrl, email, password) {
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  assert(
    response.ok && body.idToken && body.localId,
    `Firebase generated mobile capture verified sign-in failed with HTTP ${response.status}`,
    { firebaseErrorCode: body?.error?.message || undefined },
  );
  return body;
}

async function deleteFirebaseUserWithRest(env, baseUrl, idToken) {
  if (!idToken) return false;
  const firebaseApiKey = await fetchFirebaseApiKey(env, baseUrl);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (response.ok) return true;
  const body = await response.json().catch(() => ({}));
  const code = body?.error?.message || "";
  if (code === "USER_NOT_FOUND" || code === "USER_NOT_FOUND : User not found") return false;
  throw new Error(`Firebase REST cleanup failed with HTTP ${response.status}: ${code || "unknown error"}`);
}

async function cleanupGeneratedMobileArtifacts(env, baseUrl, email, firebaseDeleteIdToken) {
  if (env.QUIPSLY_MOBILE_CAPTURE_SMOKE_KEEP_ARTIFACTS === "1" || args.get("keep-artifacts") === "1") {
    return { skipped: "QUIPSLY_MOBILE_CAPTURE_SMOKE_KEEP_ARTIFACTS=1 or --keep-artifacts" };
  }

  if (!isGeneratedMobileEmail(email)) {
    throw new Error(`Refusing to clean up non-generated mobile capture smoke email: ${email}`);
  }

  const cleanup = {
    deletedInvites: 0,
    deletedGrants: 0,
    deletedCallRooms: 0,
    deletedSourceAnnotationUses: 0,
    deletedSourceAnnotations: 0,
    deletedCreatedProjects: 0,
    deletedHomeProjects: 0,
    deletedMemberships: 0,
    deletedUsers: 0,
    deletedFirebaseUser: false,
    deletedFirebaseUserViaRest: false,
    firebaseUserMissing: false,
    databaseArtifactsAbsentAfterCleanup: false,
    firebaseUserAbsentAfterCleanup: false,
  };

  const prisma = createPrisma(env);
  const homeSlug = `home-${slugifyEmailForHomeNest(email)}`;
  const deletedRoomIds = [];
  const deletedProjectIds = [];
  let generatedUserId = null;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true },
    });
    generatedUserId = user?.id || null;

    if (user?.id) {
      const callRooms = await prisma.callRoom.findMany({
        where: {
          OR: [
            { createdByUserId: user.id },
            { participants: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      });

      for (const room of callRooms) {
        await prisma.callRoom.delete({ where: { id: room.id } });
        deletedRoomIds.push(room.id);
        cleanup.deletedCallRooms += 1;
      }
    }

    cleanup.deletedInvites = (await prisma.studioNestInvite.deleteMany({ where: { email } })).count;

    const createdProjects = await prisma.studioProject.findMany({
      where: {
        sourceLabel: { not: "nest-kind:home" },
        accessGrants: {
          some: {
            email,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
        documentOperations: {
          some: {
            actorEmail: email,
            operationType: "create-nest",
          },
        },
      },
      select: { id: true },
    });
    for (const project of createdProjects) {
      cleanup.deletedSourceAnnotationUses += (
        await prisma.studioSourceAnnotationUse.deleteMany({
          where: { projectId: project.id },
        })
      ).count;
      cleanup.deletedSourceAnnotations += (
        await prisma.studioSourceAnnotation.deleteMany({
          where: { projectId: project.id },
        })
      ).count;
      await prisma.studioProject.delete({ where: { id: project.id } });
      deletedProjectIds.push(project.id);
      cleanup.deletedCreatedProjects += 1;
    }

    cleanup.deletedGrants = (await prisma.studioProjectAccessGrant.deleteMany({ where: { email } })).count;

    const homeProjects = await prisma.studioProject.findMany({
      where: {
        slug: homeSlug,
        sourceLabel: "nest-kind:home",
      },
      select: { id: true },
    });

    for (const project of homeProjects) {
      cleanup.deletedSourceAnnotationUses += (
        await prisma.studioSourceAnnotationUse.deleteMany({
          where: { projectId: project.id },
        })
      ).count;
      cleanup.deletedSourceAnnotations += (
        await prisma.studioSourceAnnotation.deleteMany({
          where: { projectId: project.id },
        })
      ).count;
      await prisma.studioProject.delete({ where: { id: project.id } });
      deletedProjectIds.push(project.id);
      cleanup.deletedHomeProjects += 1;
    }

    if (user?.id) {
      cleanup.deletedMemberships = (await prisma.membership.deleteMany({ where: { userId: user.id } })).count;
    }

    cleanup.deletedUsers = (await prisma.user.deleteMany({ where: { primaryEmail: email } })).count;

    const [
      remainingInvites,
      remainingGrants,
      remainingRooms,
      remainingProjects,
      remainingMemberships,
      remainingUsers,
    ] = await prisma.$transaction([
      prisma.studioNestInvite.count({ where: { email } }),
      prisma.studioProjectAccessGrant.count({ where: { email } }),
      prisma.callRoom.count({
        where: deletedRoomIds.length ? { id: { in: deletedRoomIds } } : { id: "__none__" },
      }),
      prisma.studioProject.count({
        where: deletedProjectIds.length ? { id: { in: deletedProjectIds } } : { id: "__none__" },
      }),
      prisma.membership.count({
        where: generatedUserId ? { userId: generatedUserId } : { userId: "__none__" },
      }),
      prisma.user.count({
        where: {
          OR: [
            { primaryEmail: email },
            { aliases: { some: { email } } },
          ],
        },
      }),
    ]);
    const residue = {
      invites: remainingInvites,
      grants: remainingGrants,
      rooms: remainingRooms,
      projects: remainingProjects,
      memberships: remainingMemberships,
      users: remainingUsers,
    };
    assert(
      Object.values(residue).every((count) => count === 0),
      "Generated mobile cleanup left canonical database artifacts behind.",
      { residue },
    );
    cleanup.databaseArtifactsAbsentAfterCleanup = true;
  } finally {
    await prisma.$disconnect();
  }

  const firebaseProjectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "quipsly-reef";
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  }

  try {
    const firebaseUser = await getAuth().getUserByEmail(email);
    await getAuth().deleteUser(firebaseUser.uid);
    cleanup.deletedFirebaseUser = true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      cleanup.firebaseUserMissing = true;
    } else {
      cleanup.deletedFirebaseUserViaRest = await deleteFirebaseUserWithRest(env, baseUrl, firebaseDeleteIdToken);
      if (!cleanup.deletedFirebaseUserViaRest) throw error;
    }
  }

  try {
    await getAuth().getUserByEmail(email);
    throw new Error("Generated mobile cleanup left the Firebase user behind.");
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    cleanup.firebaseUserAbsentAfterCleanup = true;
  }

  return cleanup;
}

async function createGeneratedCaptureSession(env, email, sessionBody) {
  const prisma = createPrisma(env);
  const now = new Date();
  const scheduledEnd = new Date(now.getTime() + 30 * 60 * 1000);
  const roomSeed = crypto.randomBytes(6).toString("hex");
  const homeNestSlug = sessionBody?.homeNest?.slug || `home-${slugifyEmailForHomeNest(email)}`;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true, name: true, primaryEmail: true },
    });

    assert(user?.id, "Session exchange succeeded, but no app-owned user was available for capture room seeding.");

    const room = await prisma.callRoom.create({
      data: {
        createdByUserId: user.id,
        purpose: "PODCAST",
        status: "OPEN",
        provider: "livekit",
        providerRoomId: `codex-mobile-capture-smoke-${roomSeed}`,
        title: "Codex generated mobile capture smoke room",
        scheduledStart: now,
        scheduledEnd,
        nestSlug: homeNestSlug,
        projectSlug: homeNestSlug,
        recordingPolicyJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          explicitConsentRequired: true,
          visibleRecordingIndicatorRequired: true,
        },
        transcriptPolicyJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          transcriptRequiresVerifiedRecording: true,
        },
        metadataJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          generatedEmail: email,
          disposable: true,
        },
        participants: {
          create: {
            userId: user.id,
            displayName: user.name || "Codex Mobile Capture Smoke",
            email: user.primaryEmail || email,
            role: "HOST",
            deviceLabel: "Generated auth smoke",
            connectionJson: {
              source: "quipsly-mobile-capture-generated-auth-smoke",
            },
          },
        },
        recordingConsents: {
          create: {
            userId: user.id,
            status: "GRANTED",
            consentText: "Generated smoke-test consent for local contract verification only.",
            canRecordAudio: true,
            canRecordVideo: true,
            canTranscribe: true,
            consentedAt: now,
            metadataJson: {
              source: "quipsly-mobile-capture-generated-auth-smoke",
              disposable: true,
            },
          },
        },
      },
      select: { id: true, providerRoomId: true },
    });

    return room;
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedProjectWork(baseUrl, idToken, suffix, { seedGoalTarget = false } = {}) {
  const authorization = `Bearer ${idToken}`;
  const name = `Codex mobile project ${suffix}`;
  const clientRequestId = crypto.randomUUID();
  const projectRequest = {
    name,
    description: "Disposable generated acceptance for iPhone project, work, and tag persistence.",
    nestKind: "production",
    clientRequestId,
  };
  const created = await requestJson(`${baseUrl}/api/mobile/capture/projects`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(projectRequest),
  });
  assert(
    created.response.status === 200
      && created.body?.ok === true
      && created.body?.project?.role === "OWNER"
      && created.body?.project?.canWrite === true
      && created.body?.boundaries?.canonicalProjectCreated === true
      && created.body?.boundaries?.slugCollisionCannotGrantExistingOwnership === true,
    `Generated project creation failed with HTTP ${created.response.status}: ${created.text.slice(0, 240)}`,
    { body: created.body },
  );
  const projectId = created.body.project.id;
  assert(
    typeof projectId === "string" && projectId.length > 0,
    "Generated project creation did not return a canonical project ID.",
    { body: created.body },
  );

  const replay = await requestJson(`${baseUrl}/api/mobile/capture/projects`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(projectRequest),
  });
  assert(
    replay.response.status === 200
      && replay.body?.ok === true
      && replay.body?.idempotentReplay === true
      && replay.body?.project?.id === projectId
      && replay.body?.receiptId === created.body?.receiptId,
    `Generated project retry did not return the original project. HTTP ${replay.response.status}`,
    { body: replay.body },
  );

  const conflict = await requestJson(`${baseUrl}/api/mobile/capture/projects`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...projectRequest,
      name: `${name} changed`,
    }),
  });
  assert(
    conflict.response.status === 409
      && conflict.body?.ok === false
      && conflict.body?.code === "PROJECT_REQUEST_ID_CONFLICT",
    `Generated project retry identity conflict returned HTTP ${conflict.response.status}.`,
    { body: conflict.body },
  );

  const capturedAt = new Date().toISOString();
  const taskRequest = {
    clientRequestId: crypto.randomUUID(),
    callRoomId: null,
    projectId,
    kind: "TASK",
    title: "Prepare the first Quipsly recording",
    body: "Confirm local originals, consent, and assembled playback.",
    tagIds: [],
    newTagLabels: ["Episode workflow", "Proof listen"],
    capturedAt,
    dueAt: null,
    reminderAt: null,
    recurrence: null,
  };
  const task = await requestJson(`${baseUrl}/api/mobile/capture/quick-entry`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(taskRequest),
  });
  assert(
    task.response.status === 200
      && task.body?.ok === true
      && task.body?.entry?.projectId === projectId
      && task.body?.entry?.destination === "NEST"
      && task.body?.tagVocabulary?.createdCount === 2
      && Array.isArray(task.body?.entry?.tags)
      && task.body.entry.tags.length === 2,
    `Generated project task and tag creation failed with HTTP ${task.response.status}: ${task.text.slice(0, 240)}`,
    { body: task.body },
  );

  const taskReplay = await requestJson(`${baseUrl}/api/mobile/capture/quick-entry`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(taskRequest),
  });
  assert(
    taskReplay.response.status === 200
      && taskReplay.body?.ok === true
      && taskReplay.body?.idempotentReplay === true
      && taskReplay.body?.entry?.id === task.body?.entry?.id,
    `Generated project task retry did not return the original record. HTTP ${taskReplay.response.status}`,
    { body: taskReplay.body },
  );

  const episodeTag = task.body.entry.tags.find((tag) => tag.label === "Episode workflow");
  const proofTag = task.body.entry.tags.find((tag) => tag.label === "Proof listen");
  assert(
    typeof episodeTag?.id === "string" && typeof proofTag?.id === "string",
    "Generated project task did not return both canonical tag identities.",
    { tags: task.body.entry.tags },
  );

  const noteTitle = "Recording rehearsal notes";
  const noteBody = "The iPhone copy must survive interruption until verified upload.";
  const note = await requestJson(`${baseUrl}/api/mobile/capture/quick-entry`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      callRoomId: null,
      projectId,
      kind: "NOTE",
      title: noteTitle,
      body: noteBody,
      tagIds: [episodeTag.id],
      newTagLabels: ["Field notes"],
      capturedAt,
      dueAt: null,
      reminderAt: null,
      recurrence: null,
    }),
  });
  assert(
    note.response.status === 200
      && note.body?.ok === true
      && note.body?.entry?.projectId === projectId
      && note.body?.tagVocabulary?.createdCount === 1
      && note.body?.tagVocabulary?.reusedCount === 0
      && note.body?.entry?.tags?.some((tag) => tag.id === episodeTag.id)
      && note.body?.entry?.tags?.some((tag) => tag.label === "Field notes"),
    `Generated project note and mixed tag assignment failed with HTTP ${note.response.status}: ${note.text.slice(0, 240)}`,
    { body: note.body },
  );

  const goalTitle = "Complete a trustworthy physical-device rehearsal";
  const goal = await requestJson(`${baseUrl}/api/mobile/capture/quick-entry`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      callRoomId: null,
      projectId,
      kind: "GOAL",
      title: goalTitle,
      body: "Review every source and the assembled timeline before publication.",
      tagIds: [proofTag.id],
      newTagLabels: [],
      capturedAt,
      dueAt: null,
      reminderAt: null,
      recurrence: null,
    }),
  });
  assert(
    goal.response.status === 200
      && goal.body?.ok === true
      && goal.body?.entry?.projectId === projectId
      && goal.body?.tagVocabulary?.createdCount === 0
      && goal.body?.tagVocabulary?.reusedCount === 0
      && goal.body?.entry?.tags?.some((tag) => tag.id === proofTag.id),
    `Generated project goal and canonical tag reuse failed with HTTP ${goal.response.status}: ${goal.text.slice(0, 240)}`,
    { body: goal.body },
  );
  let goalTargetLocalDate = null;
  if (seedGoalTarget) {
    goalTargetLocalDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    const goalTarget = await requestJson(`${baseUrl}/api/mobile/capture/today`, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "goal-edit",
        id: goal.body.entry.id,
        expectedUpdatedAt: goal.body.entry.updatedAt,
        title: goalTitle,
        description: "Review every source and the assembled timeline before publication.",
        targetDecision: "SET",
        targetLocalDate: goalTargetLocalDate,
        timezone: "UTC",
      }),
    });
    assert(
      goalTarget.response.status === 200
        && goalTarget.body?.ok === true
        && goalTarget.body?.action === "goal-edit"
        && goalTarget.body?.id === goal.body.entry.id
        && String(goalTarget.body?.targetAt || "").slice(0, 10) === goalTargetLocalDate
        && typeof goalTarget.body?.receiptId === "string"
        && goalTarget.body.receiptId.length > 0,
      `Generated project goal target setup failed with HTTP ${goalTarget.response.status}: ${goalTarget.text.slice(0, 240)}`,
      { body: goalTarget.body },
    );
  }

  const work = await requestJson(
    `${baseUrl}/api/mobile/capture/work?projectId=${encodeURIComponent(projectId)}`,
    {
      headers: { authorization },
    },
  );
  assert(
    work.response.status === 200
      && work.body?.ok === true
      && work.body?.selectedProjectId === projectId
      && work.body?.workspace?.project?.id === projectId,
    `Generated project Work readback failed with HTTP ${work.response.status}: ${work.text.slice(0, 240)}`,
    { body: work.body },
  );
  const tasks = Array.isArray(work.body?.workspace?.tasks) ? work.body.workspace.tasks : [];
  const notes = Array.isArray(work.body?.workspace?.notes) ? work.body.workspace.notes : [];
  const goals = Array.isArray(work.body?.workspace?.goals) ? work.body.workspace.goals : [];
  const tags = Array.isArray(work.body?.workspace?.tags) ? work.body.workspace.tags : [];
  assert(
    tasks.some((entry) => entry.id === task.body.entry.id)
      && notes.some((entry) => entry.id === note.body.entry.id)
      && goals.some((entry) => entry.id === goal.body.entry.id),
    "Generated project Work readback did not retain its exact task, note, and goal identities.",
    {
      taskCount: tasks.length,
      noteCount: notes.length,
      goalCount: goals.length,
    },
  );
  const workNote = notes.find((entry) => entry.id === note.body.entry.id);
  assert(
    workNote?.canEditContent === true
      && typeof workNote?.contentRevision === "string"
      && /^[0-9a-f]{64}$/.test(workNote.contentRevision)
      && Array.isArray(workNote?.blocks)
      && workNote.blocks.length === 1
      && workNote.blocks[0]?.body === noteBody,
    "Generated project Work readback did not expose the canonical note's stable editable block and content revision.",
    { note: workNote },
  );
  assert(
    tags.length === 3
      && tags.some((tag) => tag.id === episodeTag.id && tag.usageCount === 2)
      && tags.some((tag) => tag.id === proofTag.id && tag.usageCount === 2)
      && tags.some((tag) => tag.label === "Field notes" && tag.usageCount === 1),
    "Generated project Work readback did not preserve the canonical reusable tag vocabulary and usage counts.",
    { tags },
  );

  return {
    taskId: task.body.entry.id,
    taskTitle: taskRequest.title,
    goalId: goal.body.entry.id,
    goalTitle,
    goalTargetLocalDate,
    noteId: note.body.entry.id,
    noteTitle,
    noteBody,
    noteBodyBlockId: workNote.blocks[0].id,
    noteBodyBlockStableId: workNote.blocks[0].stableId,
    noteInitialContentRevision: workNote.contentRevision,
    noteTagIds: workNote.tagIds,
    episodeTagId: episodeTag.id,
    episodeTagLabel: episodeTag.label,
    projectId,
    projectSlug: created.body.project.slug,
    projectName: name,
    projectIdPresent: true,
    ownerRole: created.body.project.role,
    projectRetrySafe: replay.body.idempotentReplay === true,
    projectConflictHeld: conflict.body.code === "PROJECT_REQUEST_ID_CONFLICT",
    taskRetrySafe: taskReplay.body.idempotentReplay === true,
    taskPersisted: true,
    notePersisted: true,
    goalPersisted: true,
    canonicalTagCount: tags.length,
    tagUsageCountsProven: true,
    externalSideEffects: false,
  };
}

async function createGeneratedSourceInboxCapture(
  env,
  baseUrl,
  idToken,
  email,
  suffix,
  projectWorkProof,
) {
  const prisma = createPrisma(env);
  const title = `Generated private source ${suffix}`;
  const immutableText = [
    "A trustworthy creative system keeps the original passage unchanged.",
    "Filing is a deliberate human decision that creates shared Research evidence.",
  ].join(" ");
  const sourceUrl = `https://example.com/quipsly-source-${suffix}`;
  const sourceFingerprint = crypto
    .createHash("sha256")
    .update(`${sourceUrl}\n${immutableText}`, "utf8")
    .digest("hex");
  const capturedAt = new Date(Date.now() - 1_000);

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true },
    });
    assert(user?.id, "Generated source Inbox seeding could not resolve the canonical actor.");

    const snippet = await prisma.snippet.create({
      data: {
        userId: user.id,
        collectionId: null,
        sourceUrl,
        sourceTitle: title,
        highlightedText: immutableText,
        note: "Private Inbox context must remain private after Research filing.",
        metadataJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          capturedAt: capturedAt.toISOString(),
          disposable: true,
          privateInbox: true,
        },
        captureFingerprint: sourceFingerprint,
      },
      select: {
        id: true,
        userId: true,
        sourceTitle: true,
        sourceUrl: true,
        highlightedText: true,
        note: true,
        updatedAt: true,
      },
    });

    await prisma.studioPersonalSourceCaptureReceipt.createMany({
      data: [0, 1].map((index) => ({
        createdByUserId: user.id,
        createdByEmailSnapshot: email,
        clientRequestId: crypto.randomUUID(),
        captureType: "SNIPPET",
        snippetId: snippet.id,
        sourceFingerprint,
        capturedAt: new Date(capturedAt.getTime() + index),
        captureSnapshotJson: {
          kind: "quipsly-personal-source-capture-v1",
          sourceTitle: title,
          sourceUrl,
          immutableTextSha256: crypto
            .createHash("sha256")
            .update(immutableText, "utf8")
            .digest("hex"),
          privateInbox: true,
          externalSideEffects: false,
        },
      })),
    });

    const inbox = await requestJson(`${baseUrl}/api/mobile/capture/inbox`, {
      headers: { authorization: `Bearer ${idToken}` },
    });
    const projected = Array.isArray(inbox.body?.sources)
      ? inbox.body.sources.find((source) => source.id === snippet.id)
      : null;
    const destination = Array.isArray(inbox.body?.destinations)
      ? inbox.body.destinations.find(
        (candidate) => candidate.id === projectWorkProof.projectId,
      )
      : null;
    const canonicalTag = Array.isArray(inbox.body?.tagCatalog)
      ? inbox.body.tagCatalog.find(
        (tag) => tag.id === projectWorkProof.episodeTagId,
      )
      : null;
    assert(
      inbox.response.status === 200
        && inbox.body?.ok === true
        && inbox.body?.inboxKind === "quipsly-mobile-source-inbox-v1"
        && inbox.body?.boundaries?.actorOwnedPrivateInbox === true
        && inbox.body?.boundaries?.writableResearchDestinationsOnly === true
        && inbox.body?.boundaries?.optionalSourceAnnotation === true
        && inbox.body?.boundaries?.exactWholeCaptureAnchor === true
        && inbox.body?.boundaries?.canonicalProjectTagsOnly === true
        && inbox.body?.boundaries?.annotationMutatesSource === false
        && projected?.captureType === "SNIPPET"
        && projected?.title === title
        && projected?.excerpt === immutableText
        && projected?.sourceUrl === sourceUrl
        && projected?.captureCount === 2
        && projected?.updatedAt === snippet.updatedAt.toISOString()
        && destination?.role === "OWNER"
        && canonicalTag?.projectId === projectWorkProof.projectId
        && canonicalTag?.label === projectWorkProof.episodeTagLabel,
      "The real authenticated private source Inbox did not project the exact actor-owned capture, writable Research destination, and canonical tag vocabulary.",
      {
        status: inbox.response.status,
        sourceCount: Array.isArray(inbox.body?.sources) ? inbox.body.sources.length : null,
        destinationCount: Array.isArray(inbox.body?.destinations)
          ? inbox.body.destinations.length
          : null,
        projected: projected
          ? {
            id: projected.id,
            captureType: projected.captureType,
            captureCount: projected.captureCount,
            updatedAt: projected.updatedAt,
          }
          : null,
      },
    );

    return {
      captureId: snippet.id,
      captureType: "SNIPPET",
      actorUserId: user.id,
      title,
      immutableText,
      immutableTextSha256: crypto
        .createHash("sha256")
        .update(immutableText, "utf8")
        .digest("hex"),
      sourceUrl,
      note: snippet.note,
      initialUpdatedAt: snippet.updatedAt.toISOString(),
      projectId: projectWorkProof.projectId,
      projectSlug: projectWorkProof.projectSlug,
      projectName: projectWorkProof.projectName,
      annotationBody: "Use this source to frame the episode's opening question.",
      annotationKind: "note",
      annotationVisibility: "project",
      annotationTagId: projectWorkProof.episodeTagId,
      annotationTagLabel: projectWorkProof.episodeTagLabel,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedSourceInboxFiled(
  env,
  baseUrl,
  idToken,
  sourceInboxProof,
) {
  const authorization = `Bearer ${idToken}`;
  const inbox = await requestJson(`${baseUrl}/api/mobile/capture/inbox`, {
    headers: { authorization },
  });
  assert(
    inbox.response.status === 200
      && inbox.body?.ok === true
      && Array.isArray(inbox.body?.sources)
      && !inbox.body.sources.some(
        (source) => source.id === sourceInboxProof.captureId,
      ),
    "The acknowledged filing remained in the unfiled private Inbox projection.",
    { status: inbox.response.status, body: inbox.body },
  );

  const prisma = createPrisma(env);
  let filing;
  try {
    const filings = await prisma.studioPersonalSourceFiling.findMany({
      where: {
        projectId: sourceInboxProof.projectId,
        snippetId: sourceInboxProof.captureId,
      },
      include: {
        sourceUnit: {
          include: {
            annotations: {
              where: { createdByUserId: sourceInboxProof.actorUserId },
              include: {
                tags: { select: { tagId: true } },
                revisions: {
                  orderBy: { revision: "asc" },
                  select: {
                    revision: true,
                    operation: true,
                    snapshotJson: true,
                  },
                },
              },
            },
          },
        },
        snippet: true,
      },
    });
    assert(
      filings.length === 1,
      "The operated iPhone filing must create exactly one canonical receipt and source.",
      { filingCount: filings.length },
    );
    filing = filings[0];
    const annotation = filing.sourceUnit.annotations[0];
    const sourceHash = crypto
      .createHash("sha256")
      .update(filing.sourceUnit.immutableText || "", "utf8")
      .digest("hex");
    assert(
      filing.captureType === sourceInboxProof.captureType
        && filing.projectId === sourceInboxProof.projectId
        && filing.snippetId === sourceInboxProof.captureId
        && UUID_PATTERN.test(filing.clientRequestId)
        && filing.sourceUnit.projectId === sourceInboxProof.projectId
        && filing.sourceUnit.immutableText === sourceInboxProof.immutableText
        && filing.sourceUnit.sourceUrl === sourceInboxProof.sourceUrl
        && sourceHash === sourceInboxProof.immutableTextSha256
        && filing.snippet?.sourceTitle === sourceInboxProof.title
        && filing.snippet?.highlightedText === sourceInboxProof.immutableText
        && filing.snippet?.sourceUrl === sourceInboxProof.sourceUrl
        && filing.snippet?.note === sourceInboxProof.note
        && filing.snippet?.updatedAt.toISOString()
          === sourceInboxProof.initialUpdatedAt
        && filing.captureSnapshotJson?.privateCaptureMutated === false
        && filing.captureSnapshotJson?.externalSideEffects === false
        && filing.captureSnapshotJson?.immutableTextSha256
          === sourceInboxProof.immutableTextSha256
        && filing.sourceUnit.metadataJson?.privateCaptureMutated === false
        && filing.sourceUnit.metadataJson?.externalSideEffects === false
        && filing.sourceUnit.annotations.length === 1
        && annotation?.projectId === sourceInboxProof.projectId
        && annotation?.sourceUnitId === filing.sourceUnitId
        && annotation?.clientRequestId
        && UUID_PATTERN.test(annotation.clientRequestId)
        && annotation?.kind === sourceInboxProof.annotationKind
        && annotation?.visibility === sourceInboxProof.annotationVisibility
        && annotation?.body === sourceInboxProof.annotationBody
        && annotation?.status === "active"
        && annotation?.selectorKind === "text-quote"
        && annotation?.startOffset === 0
        && annotation?.endOffset === sourceInboxProof.immutableText.length
        && annotation?.exactText === sourceInboxProof.immutableText
        && annotation?.sourceFingerprint === sourceInboxProof.immutableTextSha256
        && annotation?.provenanceJson?.surface === "ios-capture"
        && annotation?.provenanceJson?.humanAuthored === true
        && annotation?.provenanceJson?.sourceMutated === false
        && annotation?.tags.length === 1
        && annotation?.tags[0]?.tagId === sourceInboxProof.annotationTagId
        && annotation?.revisions.length === 1
        && annotation?.revisions[0]?.revision === 1
        && annotation?.revisions[0]?.operation === "created"
        && annotation?.revisions[0]?.snapshotJson?.sourceFingerprint
          === sourceInboxProof.immutableTextSha256
        && JSON.stringify(annotation?.revisions[0]?.snapshotJson?.tagIds)
          === JSON.stringify([sourceInboxProof.annotationTagId]),
      "The canonical filing did not preserve exact identity, immutable text, annotation anchor, canonical tag, and no-side-effect provenance.",
      {
        captureType: filing.captureType,
        sourceHash,
        privateCaptureUpdatedAt: filing.snippet?.updatedAt.toISOString(),
        initialUpdatedAt: sourceInboxProof.initialUpdatedAt,
        annotationId: annotation?.id || null,
        annotationTagIds: annotation?.tags.map((tag) => tag.tagId) || [],
        annotationRevisionCount: annotation?.revisions.length || 0,
      },
    );
  } finally {
    await prisma.$disconnect();
  }

  const replay = await requestJson(`${baseUrl}/api/mobile/capture/inbox`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "file-source",
      captureId: sourceInboxProof.captureId,
      captureType: sourceInboxProof.captureType,
      projectId: sourceInboxProof.projectId,
      clientRequestId: filing.clientRequestId,
      expectedCaptureUpdatedAt: sourceInboxProof.initialUpdatedAt,
      annotation: {
        clientRequestId: filing.sourceUnit.annotations[0].clientRequestId,
        kind: sourceInboxProof.annotationKind,
        visibility: sourceInboxProof.annotationVisibility,
        body: sourceInboxProof.annotationBody,
        tagIds: [sourceInboxProof.annotationTagId],
      },
    }),
  });
  assert(
    replay.response.status === 200
      && replay.body?.ok === true
      && replay.body?.reused === true
      && replay.body?.filingId === filing.id
      && replay.body?.sourceUnitId === filing.sourceUnitId
      && replay.body?.annotation?.id === filing.sourceUnit.annotations[0].id
      && replay.body?.annotation?.clientRequestId
        === filing.sourceUnit.annotations[0].clientRequestId
      && replay.body?.annotation?.reused === true
      && JSON.stringify(replay.body?.annotation?.tagIds)
        === JSON.stringify([sourceInboxProof.annotationTagId]),
    "Retrying the exact protected iPhone filing identity did not return the same canonical receipt, source, annotation, and tag decision.",
    { status: replay.response.status, body: replay.body },
  );

  const exported = await requestJson(
    `${baseUrl}/api/research/export?project=${encodeURIComponent(sourceInboxProof.projectSlug)}`,
    { headers: { authorization } },
  );
  const exportedSource = Array.isArray(exported.body?.sources)
    ? exported.body.sources.find((source) => source.id === filing.sourceUnitId)
    : null;
  const exportedAnnotation = Array.isArray(exported.body?.annotations)
    ? exported.body.annotations.find(
      (annotation) => annotation.id === filing.sourceUnit.annotations[0].id,
    )
    : null;
  const exportedTag = Array.isArray(exported.body?.tags)
    ? exported.body.tags.find(
      (tag) => tag.id === sourceInboxProof.annotationTagId,
    )
    : null;
  assert(
    exported.response.status === 200
      && exported.body?.schemaVersion
      && exported.body?.boundaries?.actorScoped === true
      && exported.body?.boundaries?.immutableSourceTextIncluded === true
      && exported.body?.boundaries?.sourceMutated === false
      && exported.body?.boundaries?.providerMutated === false
      && exportedSource?.immutableText === sourceInboxProof.immutableText
      && exportedSource?.immutableTextSha256
        === sourceInboxProof.immutableTextSha256
      && exportedAnnotation?.sourceUnitId === filing.sourceUnitId
      && exportedAnnotation?.body === sourceInboxProof.annotationBody
      && exportedAnnotation?.kind === sourceInboxProof.annotationKind
      && exportedAnnotation?.visibility === sourceInboxProof.annotationVisibility
      && exportedAnnotation?.startOffset === 0
      && exportedAnnotation?.endOffset === sourceInboxProof.immutableText.length
      && exportedAnnotation?.exactText === sourceInboxProof.immutableText
      && exportedAnnotation?.sourceFingerprint
        === sourceInboxProof.immutableTextSha256
      && JSON.stringify(exportedAnnotation?.tagIds)
        === JSON.stringify([sourceInboxProof.annotationTagId])
      && exportedAnnotation?.revisions?.length === 1
      && exportedAnnotation?.revisions[0]?.revision === 1
      && exportedAnnotation?.revisions[0]?.operation === "created"
      && exportedTag?.label === sourceInboxProof.annotationTagLabel
      && exported.body?.integrity?.annotationCount >= 1,
    "Nest's canonical Research export did not return the exact iPhone-filed source, annotation anchor, tag, revision, and safety boundary.",
    {
      status: exported.response.status,
      sourcePresent: Boolean(exportedSource),
      exportedSourceHash: exportedSource?.immutableTextSha256 || null,
      annotationPresent: Boolean(exportedAnnotation),
      tagPresent: Boolean(exportedTag),
      annotationRevisionCount: exportedAnnotation?.revisions?.length || 0,
    },
  );

  return {
    captureRemovedFromUnfiledInbox: true,
    privateCapturePreserved: true,
    sameFilingIdentityOnRetry: true,
    oneCanonicalSourceCreated: true,
    immutableSourceHashPreserved: true,
    exactAnnotationAnchorPreserved: true,
    canonicalTagPreserved: true,
    appendOnlyAnnotationRevisionPreserved: true,
    sameAnnotationIdentityOnRetry: true,
    researchExportReadback: true,
    sourceMutated: false,
    externalSideEffects: false,
  };
}

async function createGeneratedSourceAnnotation(env, email, projectWorkProof) {
  const prisma = createPrisma(env);
  const immutableText = [
    "Quipsly preserves the source while people make review decisions around it.",
    "The same evidence should remain reachable after a decision changes.",
  ].join(" ");
  const exactText = "people make review decisions around it";
  const startOffset = immutableText.indexOf(exactText);
  const endOffset = startOffset + exactText.length;
  const sourceFingerprint = crypto
    .createHash("sha256")
    .update(immutableText, "utf8")
    .digest("hex");
  const body = "Revisit this evidence after the rehearsal and keep the original source intact.";

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      select: { id: true },
    });
    assert(user?.id, "Generated annotation seeding could not resolve the canonical actor.");

    const source = await prisma.studioSourceUnit.create({
      data: {
        projectId: projectWorkProof.projectId,
        slug: `generated-mobile-annotation-${crypto.randomBytes(5).toString("hex")}`,
        kind: "note",
        title: "Generated immutable rehearsal source",
        immutableText,
        createdByEmail: email,
        metadataJson: {
          source: "quipsly-mobile-capture-generated-auth-smoke",
          disposable: true,
          immutable: true,
        },
      },
      select: { id: true },
    });
    const annotation = await prisma.studioSourceAnnotation.create({
      data: {
        projectId: projectWorkProof.projectId,
        sourceUnitId: source.id,
        createdByUserId: user.id,
        createdByEmailSnapshot: email,
        kind: "question",
        status: "active",
        visibility: "private",
        body,
        selectorKind: "text-quote",
        startOffset,
        endOffset,
        exactText,
        prefixText: immutableText.slice(Math.max(0, startOffset - 64), startOffset),
        suffixText: immutableText.slice(endOffset, Math.min(immutableText.length, endOffset + 64)),
        sourceFingerprint,
        clientRequestId: `generated-mobile-annotation-${crypto.randomUUID()}`,
        provenanceJson: {
          kind: "quipsly-source-annotation-v1",
          surface: "generated-mobile-dogfood",
          humanAuthored: true,
          sourceMutated: false,
        },
        tags: {
          create: [{ tagId: projectWorkProof.episodeTagId }],
        },
        revisions: {
          create: {
            revision: 1,
            operation: "created",
            actorUserId: user.id,
            snapshotJson: {
              kind: "question",
              status: "active",
              visibility: "private",
              body,
              selectorKind: "text-quote",
              startOffset,
              endOffset,
              exactText,
              prefixText: immutableText.slice(Math.max(0, startOffset - 64), startOffset),
              suffixText: immutableText.slice(endOffset, Math.min(immutableText.length, endOffset + 64)),
              sourceFingerprint,
              tagIds: [projectWorkProof.episodeTagId],
            },
          },
        },
      },
      select: { id: true, updatedAt: true },
    });

    return {
      annotationId: annotation.id,
      body,
      sourceId: source.id,
      sourceFingerprint,
      immutableText,
      exactText,
      tagId: projectWorkProof.episodeTagId,
      tagLabel: projectWorkProof.episodeTagLabel,
      initialUpdatedAt: annotation.updatedAt.toISOString(),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedRoomJoin(baseUrl, idToken, room) {
  const result = await requestJson(`${baseUrl}/api/mobile/capture/rooms/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ callRoomId: room.id }),
  });

  assert(
    result.response.status === 200 && result.body?.ok === true,
    `Generated LiveKit room join failed with HTTP ${result.response.status}: ${result.text.slice(0, 240)}`,
    { body: result.body },
  );
  assert(result.body?.canJoin === true, "Generated LiveKit room join did not return canJoin=true.", { body: result.body });
  assert(result.body?.providerReadiness === "livekit-ready", "Generated LiveKit room join did not report livekit-ready.", { body: result.body });
  assert(typeof result.body?.participantToken === "string" && result.body.participantToken.length > 40, "Generated LiveKit room join did not return a short-lived participant token.");
  assert(result.body?.effects?.recordingStarted === false, "Generated LiveKit room join must not start recording.");
  assert(result.body?.providerRecording?.startsWithJoin === false, "Generated LiveKit room join must not imply provider recording starts with join.");

  return {
    canJoin: result.body.canJoin === true,
    provider: result.body.provider || "",
    providerReadiness: result.body.providerReadiness || "",
    roomNamePresent: Boolean(result.body.roomName),
    tokenReturned: Boolean(result.body.participantToken),
    tokenExpiresAtPresent: Boolean(result.body.tokenExpiresAt),
    recordingStarted: result.body.effects?.recordingStarted === true,
    providerRecordingStartsWithJoin: result.body.providerRecording?.startsWithJoin === true,
    recordingConsentGranted: result.body.recordingConsentGranted === true,
  };
}

async function assertGeneratedSessionContext(baseUrl, idToken, room) {
  const draft = {
    note: "Generated smoke context: episode prep, coaching notes, and follow-up truth stay in Quipsly.",
    goals: [
      "Prove shared session context can be saved before capture.",
      "Keep local drafts recoverable while Nest owns shared truth.",
    ],
    tasks: [
      "Review transcript packet after recording.",
      "Turn useful moments into podcast notes and coaching follow-up.",
    ],
  };

  const saved = await requestJson(`${baseUrl}/api/mobile/capture/sessions/context`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      callRoomId: room.id,
      ...draft,
    }),
  });

  assert(
    saved.response.status === 200 && saved.body?.ok === true && saved.body?.saved === true,
    `Generated session context save failed with HTTP ${saved.response.status}: ${saved.text.slice(0, 240)}`,
    { body: saved.body },
  );
  assert(
    saved.body?.sourceOfTruth === "Quipsly CallRoom.metadataJson.captureSessionContext",
    "Generated session context save did not report CallRoom metadata as source of truth.",
    { body: saved.body },
  );
  assert(saved.body?.externalSideEffects === false, "Generated session context save must not mutate external providers.", { body: saved.body });
  assert(
    saved.body?.context?.schemaVersion === 2 && typeof saved.body?.context?.revisionId === "string",
    "Generated session context save did not return a structured v2 revision.",
    { body: saved.body },
  );
  assert(
    typeof saved.body?.context?.entries?.note?.projectionId === "string"
      && typeof saved.body?.context?.entries?.goals?.[0]?.projectionId === "string"
      && typeof saved.body?.context?.entries?.tasks?.[0]?.projectionId === "string",
    "Generated session context did not expose durable note, goal, and task projection IDs.",
    { body: saved.body },
  );

  const loaded = await requestJson(
    `${baseUrl}/api/mobile/capture/sessions/context?callRoomId=${encodeURIComponent(room.id)}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${idToken}` },
    },
  );

  assert(
    loaded.response.status === 200 && loaded.body?.ok === true,
    `Generated session context load failed with HTTP ${loaded.response.status}: ${loaded.text.slice(0, 240)}`,
    { body: loaded.body },
  );
  assert(loaded.body?.context?.note === draft.note, "Generated session context note did not round-trip.", { body: loaded.body });
  assert(
    Array.isArray(loaded.body?.context?.goals) &&
      loaded.body.context.goals.length === draft.goals.length &&
      loaded.body.context.goals[0] === draft.goals[0],
    "Generated session context goals did not round-trip.",
    { body: loaded.body },
  );
  assert(
    Array.isArray(loaded.body?.context?.tasks) &&
      loaded.body.context.tasks.length === draft.tasks.length &&
      loaded.body.context.tasks[0] === draft.tasks[0],
    "Generated session context tasks did not round-trip.",
    { body: loaded.body },
  );
  assert(loaded.body?.externalSideEffects === false, "Generated session context load must not mutate external providers.", { body: loaded.body });
  assert(
    loaded.body?.context?.revisionId === saved.body?.context?.revisionId,
    "Generated session context revision did not round-trip unchanged.",
    { saved: saved.body, loaded: loaded.body },
  );

  return {
    saved: saved.body.saved === true,
    loaded: loaded.body.ok === true,
    sourceOfTruth: loaded.body.sourceOfTruth || "",
    externalSideEffects: loaded.body.externalSideEffects === true,
    noteLength: loaded.body.context?.note?.length || 0,
    goalCount: Array.isArray(loaded.body.context?.goals) ? loaded.body.context.goals.length : 0,
    taskCount: Array.isArray(loaded.body.context?.tasks) ? loaded.body.context.tasks.length : 0,
    updatedAtPresent: Boolean(loaded.body.context?.updatedAt),
  };
}

function runMobileCaptureContractSmoke(env, baseUrl, idToken) {
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts/quipsly-mobile-capture-contract-smoke.mjs"),
    `--base-url=${baseUrl}`,
    `--token=${idToken}`,
    "--json",
  ], {
    cwd: repoRoot,
    env: {
      ...env,
      QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN: idToken,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let payload = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    // Keep stderr/stdout tails for diagnostics without exposing env or tokens.
  }

  const failedChecks = Array.isArray(payload?.checks)
    ? payload.checks
      .filter((check) => check?.status === "fail")
      .map((check) => ({
        name: check.name || "",
        summary: check.summary || "",
        details: check.details || null,
      }))
    : [];

  assert(
    result.status === 0 && payload?.ok === true && payload?.authenticated === true,
    `Mobile capture authenticated contract smoke failed with exit ${result.status}.`,
    {
      statusCounts: payload?.statusCounts || null,
      failedChecks,
      stdoutTail: result.stdout.slice(-1200),
      stderrTail: result.stderr.slice(-1200),
    },
  );

  const authenticatedCheckNames = new Set(
    payload.checks
      ?.filter((check) => String(check.name || "").includes("Authenticated"))
      ?.map((check) => check.name) || [],
  );
  assert(authenticatedCheckNames.has("oneShotIngestAuthenticatedBadRequestContract"), "Missing one-shot ingest authenticated contract proof.");
  assert(authenticatedCheckNames.has("chunkIngestAuthenticatedBadRequestContract"), "Missing chunk ingest authenticated contract proof.");

  return payload;
}

async function assertGeneratedDocumentNoteRestored(
  env,
  baseUrl,
  idToken,
  projectWorkProof,
) {
  const authorization = `Bearer ${idToken}`;
  const work = await requestJson(
    `${baseUrl}/api/mobile/capture/work?projectId=${encodeURIComponent(projectWorkProof.projectId)}`,
    { headers: { authorization } },
  );
  const notes = Array.isArray(work.body?.workspace?.notes)
    ? work.body.workspace.notes
    : [];
  const note = notes.find((entry) => entry.id === projectWorkProof.noteId);
  assert(
    work.response.status === 200
      && work.body?.ok === true
      && note?.title === projectWorkProof.noteTitle
      && note?.blocks?.length === 1
      && note.blocks[0]?.id === projectWorkProof.noteBodyBlockId
      && note.blocks[0]?.stableId === projectWorkProof.noteBodyBlockStableId
      && note.blocks[0]?.body === projectWorkProof.noteBody
      && note.contentRevision === projectWorkProof.noteInitialContentRevision
      && JSON.stringify([...(note.tagIds || [])].sort())
        === JSON.stringify([...(projectWorkProof.noteTagIds || [])].sort()),
    "The operated iPhone note-edit journey did not restore the exact canonical title, stable body, content fingerprint, and tags through Work.",
    {
      status: work.response.status,
      note: note
        ? {
          id: note.id,
          title: note.title,
          contentRevision: note.contentRevision,
          blockIds: note.blocks?.map((block) => block.id),
          tagIds: note.tagIds,
        }
        : null,
    },
  );

  const prisma = createPrisma(env);
  try {
    const [saved, operations] = await Promise.all([
      prisma.studioDocument.findUnique({
        where: { id: projectWorkProof.noteId },
        select: {
          title: true,
          tagLinks: { select: { tagId: true } },
          blocks: {
            where: { archivedAt: null },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: { id: true, stableId: true, order: true, body: true },
          },
        },
      }),
      prisma.studioDocumentOperation.findMany({
        where: {
          documentId: projectWorkProof.noteId,
          operationType: "document-note-content-edit",
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          reversible: true,
          beforeJson: true,
          afterJson: true,
        },
      }),
    ]);
    const savedTagIds = (saved?.tagLinks || [])
      .map((link) => link.tagId)
      .sort();
    const expectedTagIds = [...(projectWorkProof.noteTagIds || [])].sort();
    assert(
      saved?.title === projectWorkProof.noteTitle
        && saved.blocks.some((block) =>
          block.id === projectWorkProof.noteBodyBlockId
          && block.stableId === projectWorkProof.noteBodyBlockStableId
          && block.body === projectWorkProof.noteBody)
        && JSON.stringify(savedTagIds) === JSON.stringify(expectedTagIds)
        && operations.length === 2
        && new Set(operations.map((operation) => operation.id)).size === 2
        && operations.every((operation) =>
          operation.reversible === true
          && operation.beforeJson
          && operation.afterJson?.anchorsPreserved === true
          && operation.afterJson?.tagsChanged === false
          && operation.afterJson?.structureChanged === false
          && operation.afterJson?.sourceMutated === false
          && operation.afterJson?.externalSideEffects === false),
      "The canonical database did not retain two reversible, side-effect-free note edit receipts and the restored stable block.",
      {
        title: saved?.title,
        blockIds: saved?.blocks.map((block) => block.id),
        operationCount: operations.length,
      },
    );
    return {
      exactTitleAndBodyRestored: true,
      stableBodyBlockRestored: true,
      originalContentRevisionRestored: true,
      tagsPreserved: true,
      reversibleOperationCount: operations.length,
      externalSideEffects: false,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedSourceAnnotationRestored(
  env,
  baseUrl,
  idToken,
  annotationProof,
) {
  const authorization = `Bearer ${idToken}`;
  const today = await requestJson(`${baseUrl}/api/mobile/capture/today`, {
    headers: { authorization },
  });
  const projected = Array.isArray(today.body?.sourceAnnotations)
    ? today.body.sourceAnnotations.find((entry) => entry.id === annotationProof.annotationId)
    : null;
  assert(
    today.response.status === 200
      && today.body?.ok === true
      && today.body?.boundaries?.annotationResolveReopenAvailable === true
      && today.body?.boundaries?.annotationReviewMutatesSource === false
      && projected?.status === "active"
      && projected?.body === annotationProof.body
      && projected?.exactText === annotationProof.exactText
      && projected?.createdByMe === true
      && projected?.canChangeStatus === true
      && projected?.tagLabels?.includes(annotationProof.tagLabel),
    "The operated iPhone annotation-review journey did not restore the same active source annotation through Today.",
    {
      status: today.response.status,
      projected: projected
        ? {
          id: projected.id,
          status: projected.status,
          createdByMe: projected.createdByMe,
          tagLabels: projected.tagLabels,
        }
        : null,
    },
  );

  const prisma = createPrisma(env);
  try {
    const saved = await prisma.studioSourceAnnotation.findUnique({
      where: { id: annotationProof.annotationId },
      select: {
        id: true,
        status: true,
        body: true,
        exactText: true,
        sourceFingerprint: true,
        archivedAt: true,
        sourceUnit: {
          select: { id: true, immutableText: true },
        },
        tags: {
          select: { tagId: true },
        },
        revisions: {
          orderBy: { revision: "asc" },
          select: {
            revision: true,
            operation: true,
            snapshotJson: true,
          },
        },
      },
    });
    const currentFingerprint = crypto
      .createHash("sha256")
      .update(saved?.sourceUnit?.immutableText || "", "utf8")
      .digest("hex");
    assert(
      saved?.id === annotationProof.annotationId
        && saved.status === "active"
        && saved.body === annotationProof.body
        && saved.exactText === annotationProof.exactText
        && saved.archivedAt === null
        && saved.sourceUnit?.id === annotationProof.sourceId
        && saved.sourceUnit?.immutableText === annotationProof.immutableText
        && saved.sourceFingerprint === annotationProof.sourceFingerprint
        && currentFingerprint === annotationProof.sourceFingerprint
        && saved.tags.length === 1
        && saved.tags[0]?.tagId === annotationProof.tagId
        && saved.revisions.length === 3
        && JSON.stringify(saved.revisions.map((revision) => revision.revision)) === JSON.stringify([1, 2, 3])
        && JSON.stringify(saved.revisions.map((revision) => revision.operation)) === JSON.stringify(["created", "resolved", "reopened"])
        && saved.revisions.every((revision) =>
          revision.snapshotJson?.sourceFingerprint === annotationProof.sourceFingerprint),
      "The canonical database did not retain the exact source, tag, and append-only resolve/reopen history for the same annotation ID.",
      {
        id: saved?.id,
        status: saved?.status,
        revisionCount: saved?.revisions?.length || 0,
        operations: saved?.revisions?.map((revision) => revision.operation) || [],
      },
    );
    return {
      sameAnnotationIdRestored: true,
      activeStatusRestored: true,
      immutableSourceHashPreserved: true,
      canonicalTagPreserved: true,
      revisionOperations: saved.revisions.map((revision) => revision.operation),
      sourceMutated: false,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function assertGeneratedSourceWritingDraft(
  env,
  baseUrl,
  idToken,
  annotationProof,
  projectWorkProof,
) {
  const authorization = `Bearer ${idToken}`;
  const today = await requestJson(`${baseUrl}/api/mobile/capture/today`, {
    headers: { authorization },
  });
  const projected = Array.isArray(today.body?.sourceAnnotations)
    ? today.body.sourceAnnotations.find((entry) => entry.id === annotationProof.annotationId)
    : null;
  assert(
    today.response.status === 200
      && today.body?.ok === true
      && today.body?.boundaries?.annotationWritingDraftAvailable === true
      && today.body?.boundaries?.writingDraftPrivate === true
      && today.body?.boundaries?.writingDraftSourceMutated === false
      && today.body?.boundaries?.writingDraftExternalSideEffects === false
      && projected?.canStartWriting === true
      && typeof projected?.writingDraftHref === "string"
      && projected.writingDraftHref.includes(`project=${encodeURIComponent(projectWorkProof.projectSlug)}`),
    "The operated iPhone source-to-writing journey did not project its private canonical draft through Today.",
    {
      status: today.response.status,
      projected: projected
        ? {
          id: projected.id,
          canStartWriting: projected.canStartWriting,
          writingDraftHrefPresent: Boolean(projected.writingDraftHref),
        }
        : null,
    },
  );

  const prisma = createPrisma(env);
  try {
    const annotation = await prisma.studioSourceAnnotation.findUnique({
      where: { id: annotationProof.annotationId },
      select: {
        id: true,
        body: true,
        exactText: true,
        sourceFingerprint: true,
        updatedAt: true,
        sourceUnit: {
          select: { id: true, immutableText: true },
        },
        uses: {
          where: { archivedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            annotationId: true,
            projectId: true,
            documentId: true,
            blockId: true,
            createdByUserId: true,
            clientRequestId: true,
            useKind: true,
            citationKey: true,
            quoteSnapshot: true,
            sourceJson: true,
            document: {
              select: { id: true, stableId: true, title: true, isPrivate: true },
            },
            block: {
              select: {
                id: true,
                stableId: true,
                body: true,
                externalId: true,
                isPrivate: true,
              },
            },
          },
        },
      },
    });
    const use = annotation?.uses[0];
    const operations = use
      ? await prisma.studioDocumentOperation.findMany({
        where: {
          documentId: use.documentId,
          operationType: "create-draft-from-source-annotation",
        },
        orderBy: { createdAt: "asc" },
        select: {
          origin: true,
          status: true,
          reversible: true,
          payloadJson: true,
        },
      })
      : [];
    const currentFingerprint = crypto
      .createHash("sha256")
      .update(annotation?.sourceUnit?.immutableText || "", "utf8")
      .digest("hex");
    assert(
      annotation?.id === annotationProof.annotationId
        && annotation.body === annotationProof.body
        && annotation.exactText === annotationProof.exactText
        && annotation.sourceUnit?.id === annotationProof.sourceId
        && annotation.sourceUnit?.immutableText === annotationProof.immutableText
        && annotation.sourceFingerprint === annotationProof.sourceFingerprint
        && currentFingerprint === annotationProof.sourceFingerprint
        && annotation.updatedAt.toISOString() === annotationProof.initialUpdatedAt
        && annotation.uses.length === 1
        && use?.annotationId === annotationProof.annotationId
        && use.projectId === projectWorkProof.projectId
        && /^[0-9a-f-]{36}$/i.test(use.clientRequestId || "")
        && use.useKind === "evidence"
        && use.quoteSnapshot === annotationProof.exactText
        && use.sourceJson?.kind === "quipsly-source-annotation-use-v1"
        && use.sourceJson?.annotationRevision === annotationProof.initialUpdatedAt
        && use.sourceJson?.sourceMutated === false
        && use.document.isPrivate === true
        && use.block.isPrivate === true
        && use.block.externalId === `annotation:${annotationProof.annotationId}`
        && use.block.body.includes(annotationProof.body)
        && use.block.body.includes(`> ${annotationProof.exactText}`)
        && use.block.body.includes(use.citationKey)
        && operations.length === 1
        && operations[0]?.origin === "human"
        && operations[0]?.status === "applied"
        && operations[0]?.reversible === true
        && operations[0]?.payloadJson?.annotationId === annotationProof.annotationId
        && operations[0]?.payloadJson?.sourceMutated === false,
      "The canonical database did not retain one private citation-backed draft while preserving the exact immutable source and annotation revision.",
      {
        annotationId: annotation?.id,
        useCount: annotation?.uses.length || 0,
        operationCount: operations.length,
        documentPrivate: use?.document.isPrivate,
        blockPrivate: use?.block.isPrivate,
      },
    );

    const replay = await requestJson(`${baseUrl}/api/mobile/capture/today`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization,
      },
      body: JSON.stringify({
        action: "source-annotation-draft",
        id: annotationProof.annotationId,
        projectSlug: projectWorkProof.projectSlug,
        clientRequestId: use.clientRequestId,
        expectedUpdatedAt: annotationProof.initialUpdatedAt,
      }),
    });
    assert(
      replay.response.status === 200
        && replay.body?.ok === true
        && replay.body?.reused === true
        && replay.body?.documentId === use.documentId
        && replay.body?.blockId === use.blockId
        && replay.body?.clientRequestId === use.clientRequestId,
      "Replaying the phone's exact protected writing identity did not return the same canonical document and citation block.",
      { status: replay.response.status, body: replay.body },
    );

    return {
      oneCanonicalUse: true,
      privateDocument: true,
      privateBlock: true,
      exactCitationSnapshot: true,
      immutableSourceHashPreserved: true,
      annotationRevisionPreserved: true,
      reversibleHumanOperation: true,
      exactReplayReused: true,
      sourceMutated: false,
      externalSideEffects: false,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function runCaptureRuntimeUISmoke(
  env,
  baseUrl,
  email,
  password,
  {
    mode = "surface",
    taskId = "",
    taskEditSourceTitle = "",
    taskEditUpdatedTitle = "",
    goalId = "",
    goalEditSourceTitle = "",
    goalEditUpdatedTitle = "",
    noteId = "",
    noteBodyBlockId = "",
    noteEditSourceTitle = "",
    noteEditUpdatedTitle = "",
    noteEditSourceBody = "",
    noteEditUpdatedBody = "",
    projectName = "",
    annotationId = "",
    annotationBody = "",
    sourceInboxCaptureId = "",
    sourceInboxTitle = "",
    sourceInboxAnnotationBody = "",
    sourceInboxTagLabel = "",
  } = {},
) {
  const scriptPath = path.join(
    repoRoot,
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Capture runtime UI smoke runner is missing: ${path.relative(repoRoot, scriptPath)}`);
  }

  const result = spawnSync(scriptPath, [], {
    cwd: repoRoot,
    env: {
      ...env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseUrl,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_MODE: mode,
      QUIPSLY_CAPTURE_UI_TEST_TASK_ID: taskId,
      QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_SOURCE_TITLE: taskEditSourceTitle,
      QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_UPDATED_TITLE: taskEditUpdatedTitle,
      QUIPSLY_CAPTURE_UI_TEST_GOAL_ID: goalId,
      QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_SOURCE_TITLE: goalEditSourceTitle,
      QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_UPDATED_TITLE: goalEditUpdatedTitle,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_ID: noteId,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_BODY_BLOCK_ID: noteBodyBlockId,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_TITLE: noteEditSourceTitle,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_TITLE: noteEditUpdatedTitle,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_BODY: noteEditSourceBody,
      QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_BODY: noteEditUpdatedBody,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME: projectName,
      QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_ID: annotationId,
      QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_BODY: annotationBody,
      QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_CAPTURE_ID: sourceInboxCaptureId,
      QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_TITLE: sourceInboxTitle,
      QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_ANNOTATION_BODY: sourceInboxAnnotationBody,
      QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_TAG_LABEL: sourceInboxTagLabel,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });

  assert(
    result.status === 0,
    `Capture runtime UI smoke failed with exit ${result.status}.`,
    {
      stdoutTail: result.stdout.slice(-1600),
      stderrTail: result.stderr.slice(-1600),
      signal: result.signal || null,
      spawnError: result.error?.message || null,
    },
  );

  return {
    requested: true,
    passed: true,
    mode,
    runner: path.relative(repoRoot, scriptPath),
    note: "Runtime UI smoke used generated credentials through native Firebase login; password and tokens were not printed.",
  };
}

async function main() {
  const env = mergedEnv();
  requiredEnv(env, "DATABASE_URL");

  const baseUrl = baseUrlFromEnv(env);
  const shouldRunRuntimeUISmoke =
    args.get("run-runtime-ui-smoke") === "1" ||
    env.QUIPSLY_MOBILE_CAPTURE_RUN_RUNTIME_UI_SMOKE === "1";
  const runtimeUISmokeMode = String(
    args.get("runtime-ui-mode")
      || env.QUIPSLY_MOBILE_CAPTURE_RUNTIME_UI_MODE
      || "surface",
  ).trim();
  if (!["surface", "task-edit", "goal-edit", "note-edit", "annotation-review", "annotation-writing", "source-inbox-filing"].includes(runtimeUISmokeMode)) {
    throw new Error(
      `Generated mobile Capture runtime UI mode is not supported: ${runtimeUISmokeMode}`,
    );
  }
  const workflow = String(
    args.get("workflow")
      || env.QUIPSLY_MOBILE_CAPTURE_WORKFLOW
      || "full",
  ).trim();
  if (!["full", "task-edit", "goal-edit", "note-edit", "annotation-review", "annotation-writing", "source-inbox-filing"].includes(workflow)) {
    throw new Error(`Generated mobile Capture workflow is not supported: ${workflow}`);
  }
  if (workflow !== "full" && runtimeUISmokeMode !== workflow) {
    throw new Error(`The ${workflow} workflow requires --runtime-ui-mode=${workflow}.`);
  }
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `codex-mobile-capture-${suffix}@dev.test`;
  const password = `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;

  let smokeSucceeded = false;
  let firebaseDeleteIdToken = null;
  let generatedFirebaseUserCreated = false;
  let contractReport = null;
  let sessionBody = null;
  let projectWorkProof = null;
  let roomJoinProof = null;
  let sessionContextProof = null;
  let runtimeUISmoke = { requested: shouldRunRuntimeUISmoke, passed: false };
  let noteEditRestoration = null;
  let annotationProof = null;
  let annotationReviewRestoration = null;
  let annotationWritingDraft = null;
  let sourceInboxProof = null;
  let sourceInboxFilingRestoration = null;

  try {
    await assertServerFirebaseAdminPreflight(baseUrl);
    const firebaseSignup = await firebaseSelfServeSignup(env, baseUrl, email, password);
    generatedFirebaseUserCreated = true;
    firebaseDeleteIdToken = firebaseSignup.idToken;
    await markGeneratedFirebaseEmailVerified(
      env,
      email,
      firebaseSignup.localId,
    );
    const firebaseBody = await firebasePasswordSignIn(
      env,
      baseUrl,
      email,
      password,
    );
    firebaseDeleteIdToken = firebaseBody.idToken;

    const sessionStart = await requestJson(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: firebaseBody.idToken }),
    });
    assert(
      sessionStart.response.status === 200 && sessionStart.body?.user?.email === email,
      `Session exchange failed with HTTP ${sessionStart.response.status}: ${sessionStart.text.slice(0, 240)}`,
      { body: sessionStart.body },
    );
    assert(sessionStart.body?.homeNest?.slug, "Session exchange did not create or return Home Nest truth.");
    assert(
      sessionStart.body?.onboarding?.freeMembershipStatus === "ACTIVE",
      "Session exchange did not return active free-tier onboarding truth.",
    );
    sessionBody = sessionStart.body;

    projectWorkProof = await assertGeneratedProjectWork(
      baseUrl,
      firebaseBody.idToken,
      suffix,
      { seedGoalTarget: workflow === "goal-edit" },
    );
    if (workflow === "annotation-review" || workflow === "annotation-writing") {
      annotationProof = await createGeneratedSourceAnnotation(
        env,
        email,
        projectWorkProof,
      );
    }
    if (workflow === "source-inbox-filing") {
      sourceInboxProof = await createGeneratedSourceInboxCapture(
        env,
        baseUrl,
        firebaseBody.idToken,
        email,
        suffix,
        projectWorkProof,
      );
    }
    if (workflow === "full") {
      const generatedRoom = await createGeneratedCaptureSession(env, email, sessionBody);
      roomJoinProof = await assertGeneratedRoomJoin(baseUrl, firebaseBody.idToken, generatedRoom);
      sessionContextProof = await assertGeneratedSessionContext(baseUrl, firebaseBody.idToken, generatedRoom);
      contractReport = runMobileCaptureContractSmoke(env, baseUrl, firebaseBody.idToken);
    }
    if (workflow === "source-inbox-filing") {
      await createGeneratedCaptureSession(env, email, sessionBody);
      contractReport = runMobileCaptureContractSmoke(
        env,
        baseUrl,
        firebaseBody.idToken,
      );
    }
    if (shouldRunRuntimeUISmoke) {
      runtimeUISmoke = runCaptureRuntimeUISmoke(
        env,
        baseUrl,
        email,
        password,
        {
          mode: runtimeUISmokeMode,
          taskId: projectWorkProof.taskId,
          taskEditSourceTitle: projectWorkProof.taskTitle,
          taskEditUpdatedTitle: `${projectWorkProof.taskTitle} — edited on iPhone`,
          goalId: projectWorkProof.goalId,
          goalEditSourceTitle: projectWorkProof.goalTitle,
          goalEditUpdatedTitle: `${projectWorkProof.goalTitle} — edited on iPhone`,
          noteId: projectWorkProof.noteId,
          noteBodyBlockId: projectWorkProof.noteBodyBlockId,
          noteEditSourceTitle: projectWorkProof.noteTitle,
          noteEditUpdatedTitle: `${projectWorkProof.noteTitle} — edited on iPhone`,
          noteEditSourceBody: projectWorkProof.noteBody,
          noteEditUpdatedBody: `${projectWorkProof.noteBody} Temporary operated iPhone edit.`,
          projectName: projectWorkProof.projectName,
          annotationId: annotationProof?.annotationId || "",
          annotationBody: annotationProof?.body || "",
          sourceInboxCaptureId: sourceInboxProof?.captureId || "",
          sourceInboxTitle: sourceInboxProof?.title || "",
          sourceInboxAnnotationBody: sourceInboxProof?.annotationBody || "",
          sourceInboxTagLabel: sourceInboxProof?.annotationTagLabel || "",
        },
      );
      if (workflow === "note-edit") {
        noteEditRestoration = await assertGeneratedDocumentNoteRestored(
          env,
          baseUrl,
          firebaseBody.idToken,
          projectWorkProof,
        );
      }
      if (workflow === "annotation-review") {
        annotationReviewRestoration = await assertGeneratedSourceAnnotationRestored(
          env,
          baseUrl,
          firebaseBody.idToken,
          annotationProof,
        );
      }
      if (workflow === "annotation-writing") {
        annotationWritingDraft = await assertGeneratedSourceWritingDraft(
          env,
          baseUrl,
          firebaseBody.idToken,
          annotationProof,
          projectWorkProof,
        );
      }
      if (workflow === "source-inbox-filing") {
        sourceInboxFilingRestoration = await assertGeneratedSourceInboxFiled(
          env,
          baseUrl,
          firebaseBody.idToken,
          sourceInboxProof,
        );
      }
    }
    smokeSucceeded = true;
  } finally {
    let cleanup = null;
    let cleanupWarning = null;
    if (generatedFirebaseUserCreated) {
      try {
        cleanup = await cleanupGeneratedMobileArtifacts(env, baseUrl, email, firebaseDeleteIdToken);
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : String(error);
      }
    }

    console.log(JSON.stringify({
      ok: smokeSucceeded,
      baseUrl,
      generatedEmail: redactGeneratedEmail(email),
      workflow,
      session: sessionBody
        ? {
          homeNestSlugPresent: Boolean(sessionBody.homeNest?.slug),
          freeTierStatus: sessionBody.onboarding?.freeMembershipStatus || "",
        }
        : null,
      projectWork: projectWorkProof,
      roomJoin: roomJoinProof,
      sessionContext: sessionContextProof,
      runtimeUISmoke,
      noteEditRestoration,
      annotationReview: annotationProof
        ? {
          annotationIdPresent: Boolean(annotationProof.annotationId),
          sourceIdPresent: Boolean(annotationProof.sourceId),
          tagIdPresent: Boolean(annotationProof.tagId),
          sourceFingerprintPresent: /^[0-9a-f]{64}$/.test(annotationProof.sourceFingerprint),
        }
        : null,
      annotationReviewRestoration,
      annotationWritingDraft,
      sourceInboxFiling: sourceInboxProof
        ? {
          captureIdPresent: Boolean(sourceInboxProof.captureId),
          projectIdPresent: Boolean(sourceInboxProof.projectId),
          annotationIntentPresent: Boolean(sourceInboxProof.annotationBody),
          canonicalTagPresent: Boolean(sourceInboxProof.annotationTagId),
          immutableTextSha256Present:
            /^[0-9a-f]{64}$/.test(sourceInboxProof.immutableTextSha256),
        }
        : null,
      sourceInboxFilingRestoration,
      mobileCaptureContract: contractReport
        ? {
          authenticated: contractReport.authenticated === true,
          statusCounts: contractReport.statusCounts,
          checkCount: Array.isArray(contractReport.checks) ? contractReport.checks.length : 0,
          authenticatedCheckCount: Array.isArray(contractReport.checks)
            ? contractReport.checks.filter((check) => String(check.name || "").includes("Authenticated")).length
            : 0,
        }
        : null,
      cleanup,
      cleanupWarning,
      note: "Generated password, Firebase token, session cookie, database URL, and bearer token were not printed.",
    }, null, 2));
  }

  if (!smokeSucceeded) {
    throw new Error("Generated mobile capture authenticated smoke did not complete.");
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    details: error?.details || undefined,
  }, null, 2));
  process.exit(1);
});
