#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pathToFileURL } from "node:url";

import {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
} from "../apps/quipsly/src/lib/mobile-capture-consent-policy.js";

const FIREBASE_AUTHORITY = "firebase:quipsly-reef";
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const input = {
    apply: false,
    databaseUrl: process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
    projectSlug: "high-ground-odyssey-manuscript",
    episodeSlug: "episode-9",
    owner: {
      email: "charlielsparrow@gmail.com",
      name: "Charlie Sparrow",
      role: "HOST",
      projectRole: "OWNER",
      firebaseUids: [],
    },
    collaborator: {
      email: "shomers@gmail.com",
      name: "Scott Sparrow",
      role: "GUEST",
      projectRole: "EDITOR",
      firebaseUids: [],
    },
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--") continue;
    else if (arg === "--apply") input.apply = true;
    else if (arg === "--database-url") input.databaseUrl = value, index += 1;
    else if (arg === "--project-slug") input.projectSlug = value, index += 1;
    else if (arg === "--episode-slug") input.episodeSlug = value, index += 1;
    else if (arg === "--owner-email") input.owner.email = normalizeEmail(value), index += 1;
    else if (arg === "--owner-name") input.owner.name = value, index += 1;
    else if (arg === "--owner-firebase-uid") input.owner.firebaseUids.push(value), index += 1;
    else if (arg === "--collaborator-email") input.collaborator.email = normalizeEmail(value), index += 1;
    else if (arg === "--collaborator-name") input.collaborator.name = value, index += 1;
    else if (arg === "--collaborator-firebase-uid") input.collaborator.firebaseUids.push(value), index += 1;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  input.owner.email = normalizeEmail(input.owner.email);
  input.collaborator.email = normalizeEmail(input.collaborator.email);
  if (!input.owner.email || !input.collaborator.email) throw new Error("Both collaborator emails are required.");
  if (!input.projectSlug || !input.episodeSlug) throw new Error("Project and episode slugs are required.");
  return input;
}

function assertLocalDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("The collaboration converger requires PostgreSQL.");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Refusing to mutate a non-loopback database. This command is local-only.");
  }
  if (!parsed.pathname || parsed.pathname === "/") throw new Error("The local database name is required.");
  return parsed;
}

async function resolveUser(tx, email) {
  return tx.user.findFirst({
    where: { OR: [{ primaryEmail: email }, { aliases: { some: { email } } }] },
    include: { aliases: true, authIdentities: true },
  });
}

async function assertFirebaseSubjectsAvailable(tx, user, firebaseUids) {
  for (const subject of firebaseUids) {
    if (!subject) throw new Error("Firebase UID arguments must not be empty.");
    const identity = await tx.userAuthIdentity.findUnique({
      where: { authority_subject: { authority: FIREBASE_AUTHORITY, subject } },
    });
    const legacy = await tx.user.findUnique({ where: { firebaseUid: subject }, select: { id: true } });
    if (identity && identity.userId !== user?.id) {
      throw new Error(`Firebase subject ${subject} already belongs to another Quipsly user.`);
    }
    if (legacy && legacy.id !== user?.id) {
      throw new Error(`Legacy Firebase subject ${subject} already belongs to another Quipsly user.`);
    }
  }
}

async function ensureUser(tx, person, apply) {
  let user = await resolveUser(tx, person.email);
  await assertFirebaseSubjectsAvailable(tx, user, person.firebaseUids);

  if (!user) {
    if (!apply) {
      return {
        user: null,
        preview: { email: person.email, action: "create-verified-user", firebaseUids: person.firebaseUids },
      };
    }
    if (person.firebaseUids.length === 0) {
      throw new Error(`Creating ${person.email} requires at least one verified Firebase UID.`);
    }
    user = await tx.user.create({
      data: {
        primaryEmail: person.email,
        name: person.name,
        firebaseUid: person.firebaseUids[0],
        emailVerified: new Date(),
        isActive: true,
      },
      include: { aliases: true, authIdentities: true },
    });
  }

  if (!user.isActive || !user.emailVerified) {
    throw new Error(`${person.email} must be an active, verified Quipsly user.`);
  }

  const knownSubjects = new Set(user.authIdentities
    .filter((identity) => identity.authority === FIREBASE_AUTHORITY)
    .map((identity) => identity.subject));
  const missingSubjects = person.firebaseUids.filter((subject) => !knownSubjects.has(subject));
  if (apply && missingSubjects.length > 0) {
    await tx.userAuthIdentity.createMany({
      data: missingSubjects.map((subject) => ({
        userId: user.id,
        authority: FIREBASE_AUTHORITY,
        subject,
        provider: "google.com",
        emailAtLink: person.email,
        emailVerifiedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  return {
    user,
    preview: {
      email: person.email,
      action: "reuse-canonical-user",
      primaryEmail: user.primaryEmail,
      aliases: user.aliases.map((alias) => alias.email),
      firebaseSubjectsToLink: missingSubjects,
    },
  };
}

async function ensureParticipant(tx, { room, user, person, apply }) {
  if (!user) {
    return { participant: null, action: "create-after-user", role: person.role };
  }
  const identityEmails = new Set([user.primaryEmail, ...user.aliases.map((alias) => alias.email)]);
  const matches = room.participants.filter((participant) =>
    participant.userId === user.id || identityEmails.has(normalizeEmail(participant.email)));
  if (matches.length > 1) {
    throw new Error(`Room has multiple participant rows for ${person.email}; refusing an implicit merge.`);
  }

  let participant = matches[0] || null;
  const action = participant
    ? (participant.role === person.role && participant.accessStatus === "ACTIVE" && participant.userId === user.id
      ? "already-active"
      : "activate-and-bind")
    : "create-active";

  if (apply) {
    if (participant) {
      participant = await tx.callParticipant.update({
        where: { id: participant.id },
        data: {
          userId: user.id,
          email: user.primaryEmail,
          displayName: user.name || person.name,
          role: person.role,
          accessStatus: "ACTIVE",
          accessChangedAt: new Date(),
          accessChangedByUserId: user.id,
        },
      });
    } else {
      participant = await tx.callParticipant.create({
        data: {
          roomId: room.id,
          userId: user.id,
          email: user.primaryEmail,
          displayName: user.name || person.name,
          role: person.role,
          accessStatus: "ACTIVE",
          accessChangedAt: new Date(),
          accessChangedByUserId: user.id,
          connectionJson: { source: "local-hgo-collaboration-converge-v1" },
        },
      });
    }
  }

  return { participant, action, role: person.role };
}

async function ensureRequestedConsent(tx, { roomId, user, participant, apply }) {
  if (!user || !participant) return { action: "create-after-participant", status: "REQUESTED" };
  const existing = await tx.recordingConsent.findFirst({
    where: { roomId, OR: [{ participantId: participant.id }, { userId: user.id }] },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { action: "preserve-existing", status: existing.status, id: existing.id };
  if (!apply) return { action: "create-request", status: "REQUESTED" };
  const consent = await tx.recordingConsent.create({
    data: {
      roomId,
      participantId: participant.id,
      userId: user.id,
      status: "REQUESTED",
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: false,
      canRecordVideo: false,
      canTranscribe: false,
      metadataJson: { source: "local-hgo-collaboration-converge-v1" },
    },
  });
  return { action: "created-request", status: consent.status, id: consent.id };
}

async function converge(prisma, input) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"quipsly-local-hgo-collaboration-converge-v1"}))::text`;

    const project = await tx.studioProject.findFirst({
      where: { slug: input.projectSlug },
      orderBy: { updatedAt: "desc" },
    });
    if (!project) throw new Error(`Project ${input.projectSlug} was not found.`);
    const episode = await tx.studioEpisodeProduction.findUnique({
      where: { projectId_slug: { projectId: project.id, slug: input.episodeSlug } },
    });
    if (!episode) throw new Error(`Episode ${input.episodeSlug} was not found in ${input.projectSlug}.`);
    const rooms = await tx.callRoom.findMany({
      where: { episodeProductionId: episode.id, status: { in: ["PLANNED", "OPEN", "RECORDING"] } },
      include: { participants: true },
    });
    if (rooms.length !== 1) {
      throw new Error(`Expected one active room for ${input.episodeSlug}; found ${rooms.length}.`);
    }
    const room = rooms[0];

    const ownerResult = await ensureUser(tx, input.owner, input.apply);
    const collaboratorResult = await ensureUser(tx, input.collaborator, input.apply);
    const people = [
      { person: input.owner, result: ownerResult },
      { person: input.collaborator, result: collaboratorResult },
    ];

    const receipts = [];
    for (const entry of people) {
      const grantEmail = entry.result.user?.primaryEmail || entry.person.email;
      const existingGrant = await tx.studioProjectAccessGrant.findUnique({
        where: { projectId_email: { projectId: project.id, email: grantEmail } },
      });
      if (input.apply) {
        await tx.studioProjectAccessGrant.upsert({
          where: { projectId_email: { projectId: project.id, email: grantEmail } },
          create: {
            projectId: project.id,
            email: grantEmail,
            role: entry.person.projectRole,
            status: "ACTIVE",
            createdByUserId: ownerResult.user.id,
            createdByEmail: ownerResult.user.primaryEmail,
            note: "Canonical High Ground Odyssey collaboration access",
          },
          update: {
            role: entry.person.projectRole,
            status: "ACTIVE",
            note: "Canonical High Ground Odyssey collaboration access",
          },
        });
      }
      const participantResult = await ensureParticipant(tx, {
        room,
        user: entry.result.user,
        person: entry.person,
        apply: input.apply,
      });
      const consentResult = await ensureRequestedConsent(tx, {
        roomId: room.id,
        user: entry.result.user,
        participant: participantResult.participant,
        apply: input.apply,
      });
      receipts.push({
        identity: entry.result.preview,
        projectGrant: {
          email: grantEmail,
          role: entry.person.projectRole,
          action: existingGrant
            ? (existingGrant.role === entry.person.projectRole && existingGrant.status === "ACTIVE" ? "already-active" : "activate")
            : "create-active",
        },
        participant: participantResult,
        consent: consentResult,
      });
    }

    const result = {
      ok: true,
      mode: input.apply ? "apply" : "dry-run",
      project: { id: project.id, slug: project.slug, name: project.name },
      episode: { id: episode.id, slug: episode.slug, title: episode.title },
      room: { id: room.id, title: room.title, status: room.status },
      people: receipts,
      preservedExistingParticipants: room.participants.length,
      consentSafety: "No consent status or permission is granted automatically; missing rows begin REQUESTED with every permission false.",
    };

    if (input.apply) {
      await tx.userEvent.create({
        data: {
          userId: ownerResult.user.id,
          eventName: "collaboration.hgo_local_converged_v1",
          payloadJson: result,
        },
      });
    }
    return result;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
}

async function main() {
  const input = parseArgs(process.argv);
  assertLocalDatabase(input.databaseUrl);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: input.databaseUrl, max: 1 }),
    log: ["error"],
  });
  try {
    const result = await converge(prisma, input);
    console.log(JSON.stringify({
      ...result,
      next: input.apply
        ? "Run this command again without --apply to verify the converged, idempotent readback."
        : "No data changed. Review the plan, then re-run with --apply.",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

export { assertLocalDatabase, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`QUIPSLY_LOCAL_HGO_COLLABORATION_CONVERGE_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
