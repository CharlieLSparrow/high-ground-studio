#!/usr/bin/env node

import crypto from "node:crypto";
import { createRequire } from "node:module";

const requireFromQuipsly = createRequire(
  new URL(
    "../apps/quipsly/package.json",
    import.meta.url,
  ),
);
const { PrismaClient } =
  requireFromQuipsly("@prisma/client");
const { PrismaPg } =
  requireFromQuipsly("@prisma/adapter-pg");
const {
  initializeApp,
  getApps,
} = requireFromQuipsly("firebase-admin/app");
const { getAuth } =
  requireFromQuipsly("firebase-admin/auth");

const baseUrl = String(
  process.env.QUIPSLY_ALIGNMENT_SMOKE_BASE_URL
    || "http://127.0.0.1:3012",
).replace(/\/+$/, "");
const firebaseOrigin = String(
  process.env.QUIPSLY_ALIGNMENT_SMOKE_FIREBASE_ORIGIN
    || "http://127.0.0.1:9099",
).replace(/\/+$/, "");

function requireLoopbackOrigin(
  rawValue,
  label,
) {
  const value = new URL(rawValue);
  const loopback =
    value.hostname === "127.0.0.1"
    || value.hostname === "localhost";
  if (
    value.protocol !== "http:"
    || !loopback
    || value.username
    || value.password
    || value.pathname !== "/"
    || value.search
    || value.hash
  ) {
    throw new Error(
      `${label} must be a credential-free loopback HTTP origin.`,
    );
  }
  return value;
}

const checkedBaseUrl = requireLoopbackOrigin(
  baseUrl,
  "Nest base URL",
);
const checkedFirebaseOrigin =
  requireLoopbackOrigin(
    firebaseOrigin,
    "Firebase emulator origin",
  );
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  checkedFirebaseOrigin.host;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run with the local Nest environment file.`,
    );
  }
  return value;
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        requiredEnv("DATABASE_URL"),
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    }),
  });
}

function assert(
  condition,
  message,
  details = undefined,
) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function requestJson(
  path,
  options = {},
) {
  const response = await fetch(
    path.startsWith("http")
      ? path
      : `${checkedBaseUrl.origin}${path}`,
    options,
  );
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = {
      unparsedBodyPrefix:
        text.slice(0, 160),
    };
  }
  return {
    response,
    body,
  };
}

function parseSessionCookie(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => (
      part.startsWith("session=")
    ))
    ?.split(";")[0];
}

function humanizeSlug(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase(),
    );
}

async function firebaseConfig() {
  const result = await requestJson(
    "/api/mac/firebase-client-config",
  );
  assert(
    result.response.status === 200
      && result.body?.ok === true
      && result.body?.firebase?.apiKey,
    "Local Nest did not expose usable Firebase client config.",
    { status: result.response.status },
  );
  return result.body.firebase;
}

async function createVerifiedFirebaseUser(
  email,
  password,
) {
  const config = await firebaseConfig();
  const signup = await requestJson(
    `${checkedFirebaseOrigin.origin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  assert(
    signup.response.status === 200
      && signup.body?.localId,
    "Firebase emulator signup failed.",
    { status: signup.response.status },
  );

  if (!getApps().length) {
    initializeApp({
      projectId:
        process.env.FIREBASE_PROJECT_ID
        || process.env
          .NEXT_PUBLIC_FIREBASE_PROJECT_ID
        || "quipsly-reef",
    });
  }
  await getAuth().updateUser(
    signup.body.localId,
    { emailVerified: true },
  );

  const signin = await requestJson(
    `${checkedFirebaseOrigin.origin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  assert(
    signin.response.status === 200
      && signin.body?.idToken,
    "Verified Firebase emulator sign-in failed.",
    { status: signin.response.status },
  );
  return {
    idToken: signin.body.idToken,
    localId: signup.body.localId,
  };
}

async function createSession(idToken) {
  const result = await requestJson(
    "/api/auth/session",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({ idToken }),
    },
  );
  const cookie = parseSessionCookie(
    result.response.headers.get(
      "set-cookie",
    ),
  );
  assert(
    result.response.status === 200
      && cookie
      && result.body?.homeNest?.slug,
    "Local Nest session exchange failed.",
    { status: result.response.status },
  );
  return {
    cookie,
    projectSlug:
      result.body.homeNest.slug,
  };
}

async function importExternalSource(
  cookie,
  input,
) {
  const result = await requestJson(
    "/api/episode-production/import-media",
    {
      method: "POST",
      headers: {
        cookie,
        "content-type":
          "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  assert(
    result.response.status === 200
      && result.body?.ok === true
      && result.body?.importedAsset?.id
      && result.body?.sourceId
      && result.body?.updatedAt,
    "External source registration failed.",
    {
      status: result.response.status,
      error: result.body?.error,
    },
  );
  return result.body;
}

async function ensureEpisode(
  cookie,
  projectSlug,
  episodeSlug,
) {
  const title = humanizeSlug(
    episodeSlug,
  );
  const result = await requestJson(
    "/api/episode-production",
    {
      method: "POST",
      headers: {
        cookie,
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        action: "ensure",
        projectSlug,
        episodeSlug,
        title,
        boundaryLabel: title,
        productionJson: {
          surface:
            "alignment-revision-smoke-reader",
        },
      }),
    },
  );
  assert(
    result.response.status === 200
      && result.body?.mode === "database"
      && result.body?.updatedAt,
    "Episode Production ensure failed.",
    { status: result.response.status },
  );
  return result.body;
}

async function patchAlignment(
  cookie,
  body,
) {
  return requestJson(
    "/api/episode-production/import-media",
    {
      method: "PATCH",
      headers: {
        cookie,
        "content-type":
          "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function cleanup({
  email,
  firebaseLocalId,
  assetIds,
  sourceIds,
  projectSlug,
}) {
  const prisma = createPrisma();
  const result = {
    workflowJobs: 0,
    projects: 0,
    mediaAssets: 0,
    videoSources: 0,
    grants: 0,
    memberships: 0,
    users: 0,
    firebaseUsers: 0,
    remaining: null,
  };
  try {
    const user =
      await prisma.user.findFirst({
        where: {
          primaryEmail: email,
        },
        select: { id: true },
      });
    result.workflowJobs = (
      await prisma.studioWorkflowJob
        .deleteMany({
          where: {
            assetId: {
              in: assetIds,
            },
          },
        })
    ).count;
    result.projects = (
      await prisma.studioProject
        .deleteMany({
          where: {
            slug: projectSlug,
          },
        })
    ).count;
    result.mediaAssets = (
      await prisma.studioMediaAsset
        .deleteMany({
          where: {
            id: { in: assetIds },
          },
        })
    ).count;
    result.videoSources = (
      await prisma.studioVideoSource
        .deleteMany({
          where: {
            id: { in: sourceIds },
          },
        })
    ).count;
    result.grants = (
      await prisma
        .studioProjectAccessGrant
        .deleteMany({
          where: { email },
        })
    ).count;
    if (user?.id) {
      result.memberships = (
        await prisma.membership
          .deleteMany({
            where: {
              userId: user.id,
            },
          })
      ).count;
    }
    result.users = (
      await prisma.user.deleteMany({
        where: {
          primaryEmail: email,
        },
      })
    ).count;
    result.remaining = {
      projects:
        await prisma.studioProject.count({
          where: { slug: projectSlug },
        }),
      mediaAssets:
        await prisma.studioMediaAsset
          .count({
            where: {
              id: { in: assetIds },
            },
          }),
      videoSources:
        await prisma.studioVideoSource
          .count({
            where: {
              id: { in: sourceIds },
            },
          }),
      users: await prisma.user.count({
        where: {
          primaryEmail: email,
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }

  if (firebaseLocalId) {
    try {
      await getAuth().deleteUser(
        firebaseLocalId,
      );
      result.firebaseUsers = 1;
    } catch (error) {
      if (
        error?.code !== "auth/user-not-found"
      ) {
        throw error;
      }
    }
  }
  return result;
}

async function main() {
  requiredEnv("DATABASE_URL");
  const suffix = crypto
    .randomBytes(4)
    .toString("hex");
  const email =
    `codex-alignment-${suffix}@dev.test`;
  const password =
    `Qp-${crypto.randomBytes(18).toString("base64url")}!26`;
  const episodeSlug =
    `alignment-revision-${suffix}`;
  const assetIds = [];
  const sourceIds = [];
  let firebaseLocalId = null;
  let projectSlug = "";
  let result = null;

  try {
    const firebase =
      await createVerifiedFirebaseUser(
        email,
        password,
      );
    firebaseLocalId =
      firebase.localId;
    const session = await createSession(
      firebase.idToken,
    );
    projectSlug = session.projectSlug;

    const spine =
      await importExternalSource(
        session.cookie,
        {
          projectSlug,
          episodeSlug,
          sourceUrl:
            `https://example.invalid/${suffix}/spine.wav`,
          originalName:
            "Alignment smoke spine.wav",
          kind: "audio",
          importRole: "spine-audio",
          recordingSyncMetadata: {
            durationSeconds: 120,
          },
        },
      );
    assetIds.push(
      spine.importedAsset.id,
    );
    sourceIds.push(spine.sourceId);

    const target =
      await importExternalSource(
        session.cookie,
        {
          projectSlug,
          episodeSlug,
          sourceUrl:
            `https://example.invalid/${suffix}/camera.mov`,
          originalName:
            "Alignment smoke camera.mov",
          kind: "video",
          importRole: "camera-video",
          recordingSyncMetadata: {
            durationSeconds: 120,
          },
        },
      );
    assetIds.push(
      target.importedAsset.id,
    );
    sourceIds.push(target.sourceId);

    const readerA = await ensureEpisode(
      session.cookie,
      projectSlug,
      episodeSlug,
    );
    const readerB = await ensureEpisode(
      session.cookie,
      projectSlug,
      episodeSlug,
    );
    assert(
      readerA.updatedAt
        === target.updatedAt
      && readerB.updatedAt
        === target.updatedAt,
      "Repeated readers manufactured an Episode Production revision.",
      {
        importedRevision:
          target.updatedAt,
        readerARevision:
          readerA.updatedAt,
        readerBRevision:
          readerB.updatedAt,
      },
    );

    const approvalBody = {
      action: "approve-alignment",
      projectSlug,
      episodeSlug,
      expectedUpdatedAt:
        readerA.updatedAt,
      assetId:
        target.importedAsset.id,
      spineAssetId:
        spine.importedAsset.id,
      status: "synced",
      anchorTimelineSeconds: 1.25,
      alignmentReview: {
        waveformCorrelationConfirmed:
          true,
        driftReviewConfirmed: true,
        humanApprovalConfirmed: true,
        driftObservationIntervalSeconds:
          60,
        residualDriftMilliseconds: 5,
        notes:
          "Disposable two-reader revision rehearsal.",
      },
    };
    const approval = await patchAlignment(
      session.cookie,
      approvalBody,
    );
    assert(
      approval.response.status === 200
      && approval.body?.ok === true
      && approval.body?.updatedAt,
      "Reader A could not persist reviewed alignment.",
      {
        status:
          approval.response.status,
        error: approval.body?.error,
      },
    );

    const staleApproval =
      await patchAlignment(
        session.cookie,
        approvalBody,
      );
    assert(
      staleApproval.response.status
        === 409
      && staleApproval.body?.code
        === "episode-production-revision-stale",
      "Reader B did not receive a stale-revision conflict.",
      {
        status:
          staleApproval.response.status,
        code: staleApproval.body?.code,
      },
    );

    const replacement =
      await patchAlignment(
        session.cookie,
        {
          ...approvalBody,
          expectedUpdatedAt:
            approval.body.updatedAt,
        },
      );
    assert(
      replacement.response.status === 409
      && replacement.body?.code
        === "reviewed-alignment-undo-required",
      "A fresh reader could replace protected reviewed evidence without undo.",
      {
        status:
          replacement.response.status,
        code: replacement.body?.code,
      },
    );

    const staleUndo =
      await patchAlignment(
        session.cookie,
        {
          action: "undo-last-sync",
          projectSlug,
          episodeSlug,
          expectedUpdatedAt:
            readerB.updatedAt,
        },
      );
    assert(
      staleUndo.response.status === 409
      && staleUndo.body?.code
        === "episode-production-revision-stale",
      "A stale reader could undo a newer review.",
      {
        status:
          staleUndo.response.status,
        code: staleUndo.body?.code,
      },
    );

    const undo = await patchAlignment(
      session.cookie,
      {
        action: "undo-last-sync",
        projectSlug,
        episodeSlug,
        expectedUpdatedAt:
          approval.body.updatedAt,
      },
    );
    const restoredTarget =
      undo.body?.productionJson
        ?.importedMedia
        ?.find?.((asset) => (
          asset?.id
            === target.importedAsset.id
        ));
    assert(
      undo.response.status === 200
      && undo.body?.ok === true
      && undo.body?.updatedAt
      && restoredTarget?.sync?.status
        === "ready-to-sync"
      && !restoredTarget?.sync
        ?.alignmentReview,
      "Fresh exact undo did not restore the pre-review source state.",
      {
        status: undo.response.status,
        error: undo.body?.error,
      },
    );

    const staleReplay =
      await patchAlignment(
        session.cookie,
        {
          action: "undo-last-sync",
          projectSlug,
          episodeSlug,
          expectedUpdatedAt:
            approval.body.updatedAt,
        },
      );
    assert(
      staleReplay.response.status
        === 409
      && staleReplay.body?.code
        === "episode-production-revision-stale",
      "A replayed stale undo did not fail closed.",
      {
        status:
          staleReplay.response.status,
        code: staleReplay.body?.code,
      },
    );

    const finalReader =
      await ensureEpisode(
        session.cookie,
        projectSlug,
        episodeSlug,
      );
    assert(
      finalReader.updatedAt
        === undo.body.updatedAt,
      "Final read changed the exact undo revision.",
      {
        undoRevision:
          undo.body.updatedAt,
        finalRevision:
          finalReader.updatedAt,
      },
    );

    result = {
      ok: true,
      localOnly: true,
      repeatedReadNoWrite: "pass",
      exactApproval: "pass",
      staleApprovalDenied: "pass",
      protectedReplacementDenied:
        "pass",
      staleUndoDenied: "pass",
      exactUndoRestored: "pass",
      staleUndoReplayDenied: "pass",
      finalReadNoWrite: "pass",
      externalSideEffects: false,
      note:
        "Generated credentials, Firebase token, session cookie, and database URL were not printed.",
    };
  } finally {
    const cleanupResult = await cleanup({
      email,
      firebaseLocalId,
      assetIds,
      sourceIds,
      projectSlug,
    });
    if (result) {
      result.cleanup = cleanupResult;
    } else {
      process.stderr.write(
        `${JSON.stringify({ cleanup: cleanupResult }, null, 2)}\n`,
      );
    }
  }

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      details: error?.details,
    }, null, 2)}\n`,
  );
  process.exit(1);
});
