#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, writeFile } from "node:fs/promises";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const CONSENT_POLICY_VERSION = "2026-07-18.capture-consent-v2";
const CONSENT_TEXT =
  "I consent to Quipsly recording audio from my participation. Video recording and transcription are separate choices. Recording will not start until every signed-in participant has consented, and I confirm anyone else who may be heard has been told and agreed before recording starts.";
const CONSENT_TEXT_SHA256 =
  "379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9";
const FIREBASE_PROJECT_ID = "quipsly-reef";
const FIREBASE_SIGNER_SERVICE_ACCOUNT =
  "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com";

const DEFAULTS = Object.freeze({
  baseUrl: "https://nest.quipsly.com",
  hostEmail: "charlie@highgroundodyssey.com",
  guestEmail: "shomers@gmail.com",
  guestName: "Homer",
  projectSlug: "high-ground-odyssey-rehearsal",
  projectName: "High Ground Odyssey Rehearsal",
  episodeSlug: "testflight-rehearsal",
  episodeTitle: "High Ground Odyssey TestFlight Rehearsal",
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function fail(message) {
  throw new Error(message);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const options = {
    baseUrl: process.env.QUIPSLY_REHEARSAL_BASE_URL || DEFAULTS.baseUrl,
    hostEmail:
      process.env.QUIPSLY_REHEARSAL_HOST_EMAIL || DEFAULTS.hostEmail,
    guestEmail:
      process.env.QUIPSLY_REHEARSAL_GUEST_EMAIL || DEFAULTS.guestEmail,
    guestName:
      process.env.QUIPSLY_REHEARSAL_GUEST_NAME || DEFAULTS.guestName,
    projectSlug:
      process.env.QUIPSLY_REHEARSAL_PROJECT_SLUG || DEFAULTS.projectSlug,
    projectName:
      process.env.QUIPSLY_REHEARSAL_PROJECT_NAME || DEFAULTS.projectName,
    episodeSlug:
      process.env.QUIPSLY_REHEARSAL_EPISODE_SLUG || DEFAULTS.episodeSlug,
    episodeTitle:
      process.env.QUIPSLY_REHEARSAL_EPISODE_TITLE || DEFAULTS.episodeTitle,
    outputPath: "",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--apply") {
      options.apply = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--host-email") options.hostEmail = value;
    else if (flag === "--guest-email") options.guestEmail = value;
    else if (flag === "--guest-name") options.guestName = value;
    else if (flag === "--project-slug") options.projectSlug = value;
    else if (flag === "--project-name") options.projectName = value;
    else if (flag === "--episode-slug") options.episodeSlug = value;
    else if (flag === "--episode-title") options.episodeTitle = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  options.baseUrl = clean(options.baseUrl).replace(/\/+$/, "");
  options.hostEmail = normalizeEmail(options.hostEmail);
  options.guestEmail = normalizeEmail(options.guestEmail);
  for (const [name, value] of Object.entries({
    baseUrl: options.baseUrl,
    hostEmail: options.hostEmail,
    guestEmail: options.guestEmail,
    projectSlug: options.projectSlug,
    projectName: options.projectName,
    episodeSlug: options.episodeSlug,
    episodeTitle: options.episodeTitle,
  })) {
    if (!clean(value)) fail(`${name} is required.`);
  }
  return options;
}

function usage() {
  return `Usage:
  DATABASE_URL=<secret> QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT=<port> \\
    node scripts/quipsly-prepare-hgo-testflight-rehearsal.mjs [--apply] [options]

Without --apply, this is a read-only production plan.

Options:
  --base-url <url>
  --host-email <email>
  --guest-email <email>
  --guest-name <name>
  --project-slug <slug>
  --project-name <name>
  --episode-slug <slug>
  --episode-title <title>
  --output <path>       Redacted mode-0600 receipt.
  --apply               Create or repair the rehearsal state.
`;
}

function databaseUrlForProxy() {
  const raw = clean(process.env.DATABASE_URL);
  if (!raw) fail("DATABASE_URL is required.");
  const url = new URL(raw);
  const proxyPort = clean(process.env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT);
  const socketHost = url.searchParams.get("host") || "";
  if (proxyPort && socketHost.startsWith("/cloudsql/")) {
    url.hostname = "127.0.0.1";
    url.port = proxyPort;
    url.searchParams.delete("host");
  }
  return url.toString();
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrlForProxy(),
      connectionTimeoutMillis: 20_000,
    }),
  });
}

function userIdentityWhere(email) {
  return {
    OR: [
      { primaryEmail: email },
      { aliases: { some: { email } } },
    ],
  };
}

function episodeDocumentStableId(options) {
  return `doc-${options.projectSlug}-${options.episodeSlug}`;
}

async function userForEmail(prisma, email) {
  return prisma.user.findFirst({
    where: userIdentityWhere(email),
    include: {
      aliases: true,
      roles: true,
      memberships: { include: { plan: true } },
    },
  });
}

async function discover(prisma, options) {
  const [host, guest, workspace] = await Promise.all([
    userForEmail(prisma, options.hostEmail),
    userForEmail(prisma, options.guestEmail),
    prisma.studioWorkspace.findUnique({ where: { slug: "tonight-pack" } }),
  ]);
  const project = workspace
    ? await prisma.studioProject.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: workspace.id,
            slug: options.projectSlug,
          },
        },
        include: {
          documents: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              stableId: true,
              title: true,
              sourceLabel: true,
              isPrivate: true,
              updatedAt: true,
            },
          },
          accessGrants: true,
          nestInvites: true,
        },
      })
    : null;
  const episode = project
    ? await prisma.studioEpisodeProduction.findUnique({
        where: {
          projectId_slug: {
            projectId: project.id,
            slug: options.episodeSlug,
          },
        },
      })
    : null;
  const room = project
    ? await prisma.callRoom.findFirst({
        where: {
          projectId: project.id,
          purpose: "PODCAST",
          title: options.episodeTitle,
          OR: [
            ...(episode?.id ? [{ episodeProductionId: episode.id }] : []),
            {
              episodeProductionId: null,
              metadataJson: {
                path: ["episodeSlug"],
                equals: options.episodeSlug,
              },
            },
          ],
        },
        include: {
          participants: true,
          recordingConsents: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;
  return { host, guest, workspace, project, episode, room };
}

async function upsertRehearsalDocument(prisma, options, projectId) {
  const stableId = episodeDocumentStableId(options);
  const title = `${options.episodeTitle} Production Document`;
  const sourceLabel = `episode:${options.episodeSlug}`;
  const existing = await prisma.$queryRawUnsafe(
    `SELECT "id", "projectId", "stableId", "title", "sourceLabel", "isPrivate", "updatedAt"
       FROM "StudioDocument"
      WHERE "stableId" = $1
      LIMIT 1`,
    stableId,
  );
  if (existing.length > 0) {
    const rows = await prisma.$queryRawUnsafe(
      `UPDATE "StudioDocument"
          SET "projectId" = $1,
              "title" = $2,
              "sourceLabel" = $3,
              "isPrivate" = true,
              "updatedAt" = CURRENT_TIMESTAMP
        WHERE "stableId" = $4
      RETURNING "id", "projectId", "stableId", "title", "sourceLabel", "isPrivate", "updatedAt"`,
      projectId,
      title,
      sourceLabel,
      stableId,
    );
    return rows[0];
  }
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO "StudioDocument"
      ("id", "projectId", "stableId", "title", "sourceLabel", "isPrivate", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
     RETURNING "id", "projectId", "stableId", "title", "sourceLabel", "isPrivate", "updatedAt"`,
    randomUUID(),
    projectId,
    stableId,
    title,
    sourceLabel,
  );
  return rows[0];
}

function planFor(state, options) {
  const episodeDocument = state.project?.documents.find(
    (document) => document.stableId === episodeDocumentStableId(options),
  );
  const ownerGrant = state.project?.accessGrants.find(
    (grant) =>
      normalizeEmail(grant.email) === options.hostEmail
      && grant.status === "ACTIVE"
      && grant.role === "OWNER",
  );
  const guestGrant = state.project?.accessGrants.find(
    (grant) =>
      normalizeEmail(grant.email) === options.guestEmail
      && grant.status === "ACTIVE"
      && (grant.role === "EDITOR" || grant.role === "OWNER"),
  );
  const invite = state.project?.nestInvites.find(
    (entry) =>
      normalizeEmail(entry.email) === options.guestEmail
      && entry.status !== "revoked",
  );
  const hostParticipant = state.room?.participants.find(
    (participant) => participant.userId === state.host?.id,
  );
  const guestParticipant = state.room?.participants.find(
    (participant) => participant.userId === state.guest?.id,
  );
  const hostConsent = state.room?.recordingConsents.find(
    (consent) => consent.userId === state.host?.id,
  );
  const guestConsent = state.room?.recordingConsents.find(
    (consent) => consent.userId === state.guest?.id,
  );
  return {
    createGuestAppIdentity: !state.guest,
    ensureFreeMembership: !state.guest?.memberships.some(
      (membership) =>
        membership.plan.slug === "quipsly-free"
        && membership.status === "ACTIVE"
        && (!membership.endsAt || membership.endsAt > new Date()),
    ),
    ensureWorkspace: !state.workspace,
    ensureProject: !state.project,
    ensureDocument: !episodeDocument,
    ensureOwnerGrant: !ownerGrant,
    ensureGuestEditorGrant: !guestGrant,
    ensureGuestInviteLedger: !invite,
    createPodcastRoomThroughProductionApi: !state.room,
    ensureEpisodeWorkspace: !state.episode,
    ensureHostParticipant: !hostParticipant,
    ensureGuestParticipant: !guestParticipant,
    ensureHostConsentRequest: !hostConsent,
    ensureGuestConsentRequest: !guestConsent,
  };
}

async function ensureProjectFoundation(prisma, options) {
  const host = await userForEmail(prisma, options.hostEmail);
  if (!host?.firebaseUid) {
    fail("Host must exist and have a linked Firebase identity.");
  }
  let guest = await userForEmail(prisma, options.guestEmail);
  if (!guest) {
    guest = await prisma.user.create({
      data: {
        primaryEmail: options.guestEmail,
        name: options.guestName,
        isActive: true,
        // Google will prove this mailbox on first sign-in. Do not fabricate a
        // Firebase verification event merely because an app invite exists.
        emailVerified: null,
      },
      include: {
        aliases: true,
        roles: true,
        memberships: { include: { plan: true } },
      },
    });
  } else if (!guest.isActive || (clean(options.guestName) && guest.name !== options.guestName)) {
    guest = await prisma.user.update({
      where: { id: guest.id },
      data: {
        isActive: true,
        ...(clean(options.guestName) ? { name: options.guestName } : {}),
      },
      include: {
        aliases: true,
        roles: true,
        memberships: { include: { plan: true } },
      },
    });
  }

  const freePlan = await prisma.membershipPlan.upsert({
    where: { slug: "quipsly-free" },
    create: {
      slug: "quipsly-free",
      name: "Quipsly Free",
      description:
        "Free starter access for writing, notes, Home Nest intake, and beta exploration.",
      priceCents: 0,
      billingIntervalMonths: null,
      isActive: true,
    },
    update: {
      name: "Quipsly Free",
      description:
        "Free starter access for writing, notes, Home Nest intake, and beta exploration.",
      priceCents: 0,
      isActive: true,
    },
  });
  const activeMembership = await prisma.membership.findFirst({
    where: {
      userId: guest.id,
      planId: freePlan.id,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
  });
  if (!activeMembership) {
    await prisma.membership.create({
      data: {
        userId: guest.id,
        planId: freePlan.id,
        status: "ACTIVE",
        notes: "Granted for the High Ground Odyssey TestFlight rehearsal.",
      },
    });
  }

  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: "tonight-pack" },
    create: { slug: "tonight-pack", name: "Quipsly Nest Workspace" },
    update: { name: "Quipsly Nest Workspace" },
  });
  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: options.projectSlug,
      },
    },
    create: {
      workspaceId: workspace.id,
      slug: options.projectSlug,
      name: options.projectName,
      description:
        "Shared rehearsal Nest for consented High Ground Odyssey TestFlight call, local capture, upload, transcript, and timeline proof.",
      sourceLabel: "nest-kind:production",
      isPrivate: true,
    },
    update: {
      name: options.projectName,
      description:
        "Shared rehearsal Nest for consented High Ground Odyssey TestFlight call, local capture, upload, transcript, and timeline proof.",
      sourceLabel: "nest-kind:production",
      isPrivate: true,
    },
  });
  // The active working tree may contain an additive StudioDocument migration
  // that has not yet crossed the production release boundary. Use the deployed
  // document column set explicitly so rehearsal preparation neither depends on
  // nor accidentally rolls out unrelated schema work.
  const document = await upsertRehearsalDocument(
    prisma,
    options,
    project.id,
  );
  const blockCount = await prisma.studioDocumentBlock.count({
    where: { documentId: document.id },
  });
  if (blockCount === 0) {
    await prisma.studioDocumentBlock.createMany({
      data: [
        {
          documentId: document.id,
          stableId: randomUUID(),
          body: `# ${options.episodeTitle}`,
          order: 0,
        },
        {
          documentId: document.id,
          stableId: randomUUID(),
          body: [
            "## Rehearsal checklist",
            "",
            "- Both people join the Quipsly audio room.",
            "- Each person grants their own recording consent.",
            "- Record local audio and iPhone video.",
            "- Pause/resume and switch between front and back cameras.",
            "- End capture, verify upload, then listen to the assembled timeline.",
          ].join("\n"),
          order: 1000,
        },
      ],
    });
  }
  await prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: { projectId: project.id, email: options.hostEmail },
    },
    create: {
      projectId: project.id,
      email: options.hostEmail,
      role: "OWNER",
      status: "ACTIVE",
      createdByUserId: host.id,
      createdByEmail: options.hostEmail,
      note: "High Ground Odyssey rehearsal owner",
    },
    update: {
      role: "OWNER",
      status: "ACTIVE",
      createdByUserId: host.id,
      createdByEmail: options.hostEmail,
      note: "High Ground Odyssey rehearsal owner",
    },
  });
  await prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: { projectId: project.id, email: options.guestEmail },
    },
    create: {
      projectId: project.id,
      email: options.guestEmail,
      role: "EDITOR",
      status: "ACTIVE",
      createdByUserId: host.id,
      createdByEmail: options.hostEmail,
      note: "High Ground Odyssey TestFlight rehearsal collaborator",
    },
    update: {
      role: "EDITOR",
      status: "ACTIVE",
      createdByUserId: host.id,
      createdByEmail: options.hostEmail,
      note: "High Ground Odyssey TestFlight rehearsal collaborator",
    },
  });
  await prisma.studioNestInvite.upsert({
    where: {
      projectId_email: { projectId: project.id, email: options.guestEmail },
    },
    create: {
      projectId: project.id,
      email: options.guestEmail,
      role: "EDITOR",
      status: "pending",
      invitedByEmail: options.hostEmail,
      note: "High Ground Odyssey TestFlight rehearsal",
      metadataJson: {
        source: "quipsly-prepare-hgo-testflight-rehearsal",
        externalInviteSent: false,
        googleSignInExpected: true,
      },
    },
    update: {
      role: "EDITOR",
      status: "pending",
      revokedAt: null,
      invitedByEmail: options.hostEmail,
      note: "High Ground Odyssey TestFlight rehearsal",
      metadataJson: {
        source: "quipsly-prepare-hgo-testflight-rehearsal",
        externalInviteSent: false,
        googleSignInExpected: true,
      },
    },
  });
  return { host, guest, project, document };
}

async function firebaseIdTokenForHost(options, host) {
  const configResponse = await fetch(
    `${options.baseUrl}/api/mac/firebase-client-config`,
    { headers: { Accept: "application/json" } },
  );
  const config = await configResponse.json();
  const apiKey = clean(config?.firebase?.apiKey);
  if (!configResponse.ok || config?.ok !== true || !apiKey) {
    fail("Nest did not expose usable Firebase client configuration.");
  }

  const appName = `quipsly-rehearsal-${Date.now()}`;
  const firebaseApp = initializeApp(
    {
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
      serviceAccountId: FIREBASE_SIGNER_SERVICE_ACCOUNT,
    },
    appName,
  );
  const auth = getAuth(firebaseApp);
  const firebaseUser = await auth.getUser(host.firebaseUid);
  if (normalizeEmail(firebaseUser.email) !== options.hostEmail) {
    fail("Host Firebase identity does not match the requested rehearsal host.");
  }
  const customToken = await auth.createCustomToken(host.firebaseUid, {
    purpose: "quipsly-hgo-testflight-rehearsal",
  });
  const exchangeResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchange = await exchangeResponse.json();
  if (!exchangeResponse.ok || !clean(exchange?.idToken)) {
    fail(
      "Firebase custom-token exchange failed for the rehearsal host"
      + `${clean(exchange?.error?.message) ? `: ${clean(exchange.error.message)}` : "."}`,
    );
  }
  return exchange.idToken;
}

async function createRoomThroughProductionApi(options, host, project) {
  const idToken = await firebaseIdTokenForHost(options, host);
  const response = await fetch(`${options.baseUrl}/api/mobile/capture/sessions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: options.episodeTitle,
      purpose: "PODCAST",
      provider: "livekit",
      projectSlug: project.slug,
      episodeSlug: options.episodeSlug,
      deviceLabel: "Quipsly TestFlight rehearsal setup",
    }),
  });
  const document = await response.json();
  if (
    response.status !== 201
    || document?.ok !== true
    || document?.created !== true
    || !clean(document?.session?.callRoomId || document?.session?.id)
  ) {
    fail(
      `Production Capture session creation failed with HTTP ${response.status}: `
      + `${clean(document?.error) || "unknown error"}`,
    );
  }
  const boundaries = document.boundaries || {};
  if (
    boundaries.recordingStarted !== false
    || boundaries.providerJoined !== false
    || boundaries.calendarMutated !== false
    || boundaries.stripeMutated !== false
    || boundaries.externalInviteSent !== false
  ) {
    fail("Production session creation did not preserve its declared side-effect boundary.");
  }
  return clean(document.session.callRoomId || document.session.id);
}

async function ensureEpisodeWorkspace(prisma, options, foundation) {
  return prisma.studioEpisodeProduction.upsert({
    where: {
      projectId_slug: {
        projectId: foundation.project.id,
        slug: options.episodeSlug,
      },
    },
    create: {
      projectId: foundation.project.id,
      documentId: foundation.document.id,
      slug: options.episodeSlug,
      title: options.episodeTitle,
      boundaryLabel: options.episodeTitle,
      boundaryKind: "episode",
      status: "rehearsal",
      recordingRoomJson: {
        state: "awaiting-session-binding",
        source: "quipsly-prepare-hgo-testflight-rehearsal",
      },
      timelineJson: {},
      transcriptJson: {},
      productionJson: {
        episodeRoom: {
          revision: 0,
          status: "idle",
          clips: [],
        },
        importedMedia: [],
        timelineClips: [],
      },
    },
    update: {
      documentId: foundation.document.id,
      title: options.episodeTitle,
      boundaryLabel: options.episodeTitle,
      boundaryKind: "episode",
    },
  });
}

async function readProductionRehearsalApi(options, host, roomId) {
  const idToken = await firebaseIdTokenForHost(options, host);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${idToken}`,
  };
  const sessionsResponse = await fetch(
    `${options.baseUrl}/api/mobile/capture/sessions`,
    { headers },
  );
  const sessionsDocument = await sessionsResponse.json();
  const sessions = Array.isArray(sessionsDocument?.sessions)
    ? sessionsDocument.sessions
    : [];
  const room = sessions.find(
    (session) => clean(session?.callRoomId || session?.id) === roomId,
  );

  const diagnosticUrl = new URL(
    `${options.baseUrl}/api/mobile/capture/rooms/join/diagnostics`,
  );
  diagnosticUrl.searchParams.set("callRoomId", roomId);
  const diagnosticResponse = await fetch(diagnosticUrl, { headers });
  const diagnostic = await diagnosticResponse.json();

  return {
    sessionListStatus: sessionsResponse.status,
    sessionListOk:
      sessionsResponse.ok
      && sessionsDocument?.ok === true
      && Boolean(room),
    visibleSessionCount: sessions.length,
    rehearsalRoomVisible: Boolean(room),
    roomStatus: room?.status || null,
    roomPurpose: room?.purpose || null,
    recordingConsentStatus: room?.recordingConsentStatus || null,
    canRecordNow: room?.canRecordNow === true,
    providerReadiness: room?.providerReadiness || null,
    providerCanJoin: room?.providerCanJoin === true,
    diagnosticStatus: diagnosticResponse.status,
    diagnosticOk:
      diagnosticResponse.ok
      && diagnostic?.ok === true
      && diagnostic?.diagnosticOnly === true,
    diagnosticCanJoin: diagnostic?.canJoin === true,
    diagnosticCanMintJoinToken: diagnostic?.canMintJoinToken === true,
    diagnosticEffects: {
      sideEffectFree: diagnostic?.effects?.sideEffectFree === true,
      providerJoined: diagnostic?.effects?.providerJoined === true,
      recordingStarted: diagnostic?.effects?.recordingStarted === true,
      tokenMinted: diagnostic?.effects?.tokenMinted === true,
    },
    tokenPrinted: false,
  };
}

async function ensureRoomParticipantsAndEpisode(
  prisma,
  options,
  foundation,
  roomId,
) {
  await prisma.$transaction(async (transaction) => {
    const room = await transaction.callRoom.findUnique({
      where: { id: roomId },
      include: { participants: true, recordingConsents: true },
    });
    if (!room || room.projectId !== foundation.project.id) {
      fail("Rehearsal room is missing or belongs to another Nest.");
    }

    let hostParticipant = room.participants.find(
      (participant) => participant.userId === foundation.host.id,
    );
    if (!hostParticipant) {
      hostParticipant = await transaction.callParticipant.create({
        data: {
          roomId,
          userId: foundation.host.id,
          displayName: foundation.host.name || options.hostEmail,
          email: options.hostEmail,
          role: "HOST",
          deviceLabel: "Quipsly Capture",
        },
      });
    }
    let guestParticipant = room.participants.find(
      (participant) => participant.userId === foundation.guest.id,
    );
    if (!guestParticipant) {
      guestParticipant = await transaction.callParticipant.create({
        data: {
          roomId,
          userId: foundation.guest.id,
          displayName: foundation.guest.name || options.guestName,
          email: options.guestEmail,
          role: "GUEST",
          deviceLabel: "Quipsly Capture",
        },
      });
    }

    for (const participant of [
      { record: hostParticipant, userId: foundation.host.id },
      { record: guestParticipant, userId: foundation.guest.id },
    ]) {
      const existing = room.recordingConsents.find(
        (consent) => consent.userId === participant.userId,
      );
      if (!existing) {
        await transaction.recordingConsent.create({
          data: {
            roomId,
            participantId: participant.record.id,
            userId: participant.userId,
            status: "REQUESTED",
            consentText: CONSENT_TEXT,
            policyVersion: CONSENT_POLICY_VERSION,
            canRecordAudio: false,
            canRecordVideo: false,
            canTranscribe: false,
            metadataJson: {
              source: "quipsly-prepare-hgo-testflight-rehearsal",
              consentTextHash: CONSENT_TEXT_SHA256,
              consentEvidenceVersion: 2,
              independentParticipantReceiptRequired: true,
              recordingStarted: false,
            },
          },
        });
      }
    }

    await transaction.studioEpisodeProduction.upsert({
      where: {
        projectId_slug: {
          projectId: foundation.project.id,
          slug: options.episodeSlug,
        },
      },
      create: {
        projectId: foundation.project.id,
        documentId: foundation.document.id,
        slug: options.episodeSlug,
        title: options.episodeTitle,
        boundaryLabel: options.episodeTitle,
        boundaryKind: "episode",
        status: "rehearsal",
        recordingRoomJson: {
          callRoomId: room.id,
          provider: room.provider,
          source: "quipsly-prepare-hgo-testflight-rehearsal",
        },
        timelineJson: {},
        transcriptJson: {},
        productionJson: {
          episodeRoom: {
            revision: 0,
            status: "idle",
            clips: [],
          },
          importedMedia: [],
          timelineClips: [],
        },
      },
      update: {
        documentId: foundation.document.id,
        title: options.episodeTitle,
        boundaryLabel: options.episodeTitle,
        boundaryKind: "episode",
        recordingRoomJson: {
          callRoomId: room.id,
          provider: room.provider,
          source: "quipsly-prepare-hgo-testflight-rehearsal",
        },
      },
    });
  });
}

function receipt(options, state, mode, operations, liveApi) {
  const plan = planFor(state, options);
  const guestFirebaseLinked = Boolean(state.guest?.firebaseUid);
  const guestJustInTimeGoogleLinkReady = Boolean(
    state.guest?.isActive
      && !guestFirebaseLinked,
  );
  const hostParticipant = state.room?.participants.find(
    (participant) => participant.userId === state.host?.id,
  );
  const guestParticipant = state.room?.participants.find(
    (participant) => participant.userId === state.guest?.id,
  );
  const consents = state.room?.recordingConsents || [];
  return {
    schema: "quipsly-hgo-testflight-rehearsal-v1",
    auditedAt: new Date().toISOString(),
    mode,
    baseUrl: options.baseUrl,
    hostEmailDigest: createHash("sha256").update(options.hostEmail).digest("hex"),
    guestEmailDigest: createHash("sha256").update(options.guestEmail).digest("hex"),
    guestFirebaseLinked,
    guestSignIn: {
      state: guestFirebaseLinked
        ? "FIREBASE_LINKED"
        : guestJustInTimeGoogleLinkReady
          ? "AWAITING_FIRST_VERIFIED_GOOGLE_SIGN_IN"
          : "NOT_READY",
      justInTimeGoogleLinkReady: guestJustInTimeGoogleLinkReady,
      verificationEmailRequired: false,
      identityAuthority: "firebase:quipsly-reef",
    },
    project: state.project
      ? {
          id: state.project.id,
          slug: state.project.slug,
          name: state.project.name,
          private: state.project.isPrivate,
        }
      : null,
    episode: state.episode
      ? {
          id: state.episode.id,
          slug: state.episode.slug,
          status: state.episode.status,
        }
      : null,
    room: state.room
      ? {
          id: state.room.id,
          title: state.room.title,
          purpose: state.room.purpose,
          status: state.room.status,
          provider: state.room.provider,
          providerRoomConfigured: Boolean(state.room.providerRoomId),
          participantCount: state.room.participants.length,
          hostParticipantReady: Boolean(hostParticipant),
          guestParticipantReady: Boolean(guestParticipant),
          consentCount: consents.length,
          hostConsentStatus:
            consents.find((consent) => consent.userId === state.host?.id)?.status
            || null,
          guestConsentStatus:
            consents.find((consent) => consent.userId === state.guest?.id)?.status
            || null,
        }
      : null,
    safety: {
      recordingStarted: Boolean(state.room?.recordingStartedAt),
      bothConsentsRemainHumanControlled: consents.every(
        (consent) => consent.status === "REQUESTED",
      ),
      externalInviteSent: false,
      providerJoined: false,
      calendarMutated: false,
      stripeMutated: false,
      credentialsPrinted: false,
    },
    operations,
    liveApi,
    plan,
    passed: Boolean(
      state.project
      && state.episode
      && state.room
      && hostParticipant
      && guestParticipant
      && consents.some((consent) => consent.userId === state.host?.id)
      && consents.some((consent) => consent.userId === state.guest?.id)
      && !state.room.recordingStartedAt
      && (
        mode !== "apply"
        || (
          liveApi?.sessionListOk === true
          && liveApi?.rehearsalRoomVisible === true
          && liveApi?.diagnosticOk === true
          && liveApi?.diagnosticEffects?.sideEffectFree === true
          && liveApi?.diagnosticEffects?.providerJoined === false
          && liveApi?.diagnosticEffects?.recordingStarted === false
          && liveApi?.diagnosticEffects?.tokenMinted === false
        )
      )
    ),
  };
}

async function writeReceipt(outputPath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, serialized, { mode: 0o600 });
    await chmod(outputPath, 0o600);
  }
  process.stdout.write(serialized);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const prisma = createPrisma();
  try {
    let state = await discover(prisma, options);
    const operations = [];
    let liveApi = null;
    if (options.apply) {
      const foundation = await ensureProjectFoundation(prisma, options);
      operations.push("ensure-shared-rehearsal-nest-and-invite");
      await ensureEpisodeWorkspace(prisma, options, foundation);
      operations.push("ensure-episode-workspace-before-session-binding");
      state = await discover(prisma, options);
      let roomId = state.room?.id || "";
      if (!roomId) {
        roomId = await createRoomThroughProductionApi(
          options,
          foundation.host,
          foundation.project,
        );
        operations.push("create-podcast-room-through-production-api");
      }
      await ensureRoomParticipantsAndEpisode(
        prisma,
        options,
        foundation,
        roomId,
      );
      operations.push("ensure-participants-consent-requests-and-episode-workspace");
      state = await discover(prisma, options);
      liveApi = await readProductionRehearsalApi(
        options,
        foundation.host,
        roomId,
      );
      operations.push("read-back-production-session-and-room-diagnostics");
    }
    const value = receipt(
      options,
      state,
      options.apply ? "apply" : "plan",
      operations,
      liveApi,
    );
    await writeReceipt(options.outputPath, value);
    if (options.apply && !value.passed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exitCode = 1;
});
