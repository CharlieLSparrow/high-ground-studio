#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const POLICY_VERSION = "quipsly-coach-persona-reset-v1";
const HOME_NEST_SOURCE_LABEL = "nest-kind:home";
const STAFF_ROLES = new Set(["OWNER", "TEAM_SCHEDULER"]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const input = {
    email: "",
    displayName: "",
    apply: false,
    receiptDirectory: path.join(process.cwd(), "artifacts", "account-maintenance"),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--apply") input.apply = true;
    else if (argument === "--email") {
      input.email = normalizeEmail(argv[index + 1]);
      index += 1;
    } else if (argument === "--display-name") {
      input.displayName = String(argv[index + 1] || "").trim().replace(/\s+/g, " ");
      index += 1;
    } else if (argument === "--receipt-directory") {
      input.receiptDirectory = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  assert.match(input.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "--email is required.");
  assert(
    !input.displayName || input.displayName.length <= 120,
    "--display-name must be 120 characters or fewer.",
  );
  return input;
}

function databaseURLFromEnvironment() {
  const raw = String(process.env.DATABASE_URL || "").trim();
  assert(raw, "DATABASE_URL is required.");
  const url = new URL(raw);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol),
    "Coach persona reset requires PostgreSQL.",
  );
  const proxyPort = String(process.env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT || "").trim();
  const socketHost = url.searchParams.get("host") || "";
  if (socketHost.startsWith("/cloudsql/")) {
    assert(proxyPort, "Cloud SQL socket URL requires QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT.");
    url.hostname = "127.0.0.1";
    url.port = proxyPort;
    url.searchParams.delete("host");
  }
  return url.toString();
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function source(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function resolveExactlyOneUser(prisma, email) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { primaryEmail: email },
        { aliases: { some: { email } } },
      ],
    },
    include: {
      aliases: { select: { email: true, label: true } },
      roles: { select: { role: true } },
      authIdentities: {
        select: { authority: true, provider: true, emailAtLink: true },
      },
      coachProfile: {
        select: { id: true, displayName: true, isActive: true, timezone: true },
      },
    },
  });
  assert.equal(users.length, 1, `Expected exactly one canonical user for ${email}; found ${users.length}.`);
  return users[0];
}

async function inventory(prisma, email) {
  const user = await resolveExactlyOneUser(prisma, email);
  const emails = [...new Set([user.primaryEmail, ...user.aliases.map(({ email: alias }) => alias)].map(normalizeEmail))];
  const [
    projectGrants,
    nestInvites,
    workspaces,
    createdRooms,
    participantRows,
    bookingsAsCoach,
    bookingsAsClient,
    engagementMemberships,
    engagementsCreated,
    engagementsAsCoach,
    engagementsAsClient,
    authoredNotes,
    assignedTasks,
    ownedGoals,
  ] = await Promise.all([
    prisma.studioProjectAccessGrant.findMany({
      where: { email: { in: emails } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        note: true,
        project: { select: { id: true, slug: true, name: true, sourceLabel: true } },
      },
    }),
    prisma.studioNestInvite.findMany({
      where: { email: { in: emails } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        project: { select: { id: true, slug: true, name: true, sourceLabel: true } },
      },
    }),
    prisma.studioWorkspace.findMany({
      where: { ownerLabel: { in: emails, mode: "insensitive" } },
      select: {
        id: true,
        slug: true,
        name: true,
        ownerLabel: true,
        projects: {
          select: { id: true, slug: true, name: true, sourceLabel: true },
        },
      },
    }),
    prisma.callRoom.findMany({
      where: { createdByUserId: user.id },
      select: { id: true, title: true, purpose: true, status: true, projectId: true },
    }),
    prisma.callParticipant.findMany({
      where: { OR: [{ userId: user.id }, { email: { in: emails } }] },
      select: {
        id: true,
        role: true,
        accessStatus: true,
        room: { select: { id: true, title: true, purpose: true, status: true, projectId: true } },
      },
    }),
    prisma.coachingBooking.findMany({
      where: { coachUserId: user.id },
      select: { id: true, status: true, clientUserId: true, callRoom: { select: { id: true, title: true, purpose: true, status: true } } },
    }),
    prisma.coachingBooking.findMany({
      where: { clientUserId: user.id },
      select: { id: true, status: true, coachUserId: true, callRoom: { select: { id: true, title: true, purpose: true, status: true } } },
    }),
    prisma.coachingEngagementMember.findMany({
      where: { userId: user.id },
      select: { id: true, role: true, status: true, engagement: { select: { id: true, title: true, status: true, projectId: true } } },
    }),
    prisma.coachingEngagement.findMany({
      where: { createdByUserId: user.id },
      select: { id: true, title: true, status: true, projectId: true },
    }),
    prisma.coachingEngagement.findMany({
      where: { primaryCoachUserId: user.id },
      select: { id: true, title: true, status: true, projectId: true },
    }),
    prisma.coachingEngagement.findMany({
      where: { primaryClientUserId: user.id },
      select: { id: true, title: true, status: true, projectId: true },
    }),
    prisma.coachingNote.findMany({
      where: { authorUserId: user.id },
      select: { id: true, title: true, roomId: true, engagementId: true, visibility: true },
    }),
    prisma.actionItem.findMany({
      where: { assignedUserId: user.id },
      select: { id: true, title: true, roomId: true, engagementId: true, projectId: true, status: true },
    }),
    prisma.goal.findMany({
      where: { ownerUserId: user.id },
      select: { id: true, title: true, roomId: true, engagementId: true, projectId: true, status: true },
    }),
  ]);

  const homeGrants = projectGrants.filter(
    ({ project, role, status }) =>
      project.sourceLabel === HOME_NEST_SOURCE_LABEL &&
      role === "OWNER" &&
      status === "ACTIVE",
  );
  const homeContents = homeGrants.length === 0
    ? []
    : await prisma.studioProject.findMany({
        where: { id: { in: homeGrants.map(({ project }) => project.id) } },
        select: {
          id: true,
          slug: true,
          name: true,
          documents: {
            select: { id: true, title: true, sourceLabel: true },
            orderBy: { updatedAt: "desc" },
            take: 100,
          },
          _count: {
            select: {
              documents: true,
              tags: true,
              mediaAssets: true,
              callRooms: true,
              coachingEngagements: true,
              goals: true,
              actionItems: true,
              chatMessages: true,
              sourceCollections: true,
            },
          },
        },
      });
  return {
    user: {
      id: user.id,
      primaryEmail: user.primaryEmail,
      name: user.name,
      isActive: user.isActive,
      emailVerified: Boolean(user.emailVerified),
      aliases: user.aliases,
      roles: user.roles.map(({ role }) => role),
      authProviders: user.authIdentities.map(({ authority, provider, emailAtLink }) => ({ authority, provider, emailAtLink })),
      coachProfile: user.coachProfile,
    },
    emails,
    projectGrants,
    homeGrants,
    homeContents,
    nestInvites,
    workspaces,
    createdRooms,
    participantRows,
    bookingsAsCoach,
    bookingsAsClient,
    engagementMemberships,
    engagementsCreated,
    engagementsAsCoach,
    engagementsAsClient,
    authoredNotes,
    assignedTasks,
    ownedGoals,
  };
}

function planFromInventory(snapshot, input) {
  const homeProjectIds = new Set(snapshot.homeGrants.map(({ project }) => project.id));
  assert(
    snapshot.homeGrants.length <= 1,
    "Persona reset refuses to guess between multiple active Home Nests.",
  );
  const staffRoles = snapshot.user.roles.filter((role) => STAFF_ROLES.has(role));
  const homeUserContentCount = snapshot.homeContents.reduce(
    (total, project) => total +
      project._count.mediaAssets +
      project._count.callRooms +
      project._count.coachingEngagements +
      project._count.goals +
      project._count.actionItems +
      project._count.chatMessages +
      project._count.sourceCollections,
    0,
  );
  return {
    canonicalUserId: snapshot.user.id,
    preserveFirebaseAndProviderIdentities: true,
    preserveCanonicalUser: true,
    preserveHomeProjectIds: [...homeProjectIds],
    revokeProjectGrantIds: snapshot.projectGrants
      .filter(({ project }) => !homeProjectIds.has(project.id))
      .map(({ id }) => id),
    revokeNestInviteIds: snapshot.nestInvites.map(({ id }) => id),
    removeParticipantIds: snapshot.participantRows
      .filter(({ accessStatus }) => accessStatus !== "REMOVED")
      .map(({ id }) => id),
    removeEngagementMemberIds: snapshot.engagementMemberships
      .filter(({ status }) => status !== "REMOVED")
      .map(({ id }) => id),
    setRolesTo: ["COACH"],
    setDisplayNameTo: input.displayName || snapshot.user.name || null,
    removeStaffRoles: staffRoles,
    blockers: [
      ...(snapshot.createdRooms.length
        ? ["User created Sessions; reset must preserve provenance and cannot silently reassign them."]
        : []),
      ...(snapshot.bookingsAsCoach.length || snapshot.bookingsAsClient.length
        ? ["Booking rows directly grant Session access; removing participant membership alone is insufficient."]
        : []),
      ...(snapshot.engagementsAsCoach.length || snapshot.engagementsAsClient.length
        ? ["Primary coaching relationship pointers directly grant retained identity and need an explicit archive/reassignment policy."]
        : []),
      ...(snapshot.authoredNotes.length || snapshot.assignedTasks.length || snapshot.ownedGoals.length
        ? ["User-owned notes, tasks, or goals exist; destructive deletion is not inferred from clean-access wording."]
        : []),
      ...(homeUserContentCount > 0
        ? ["The preserved Home Nest contains user-created content; a clean persona requires an explicit archive or delete decision for those records."]
        : []),
      ...(snapshot.workspaces.some(({ projects }) => projects.some(({ id }) => !homeProjectIds.has(id)))
        ? ["The email is a legacy workspace owner label for non-Home projects; removing grants would not remove access."]
        : []),
    ],
  };
}

async function applySafeReset(prisma, snapshot, plan) {
  assert.equal(plan.blockers.length, 0, "Apply is blocked until retained ownership/provenance rows have an explicit disposition.");
  const operationId = randomUUID();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`quipsly-coach-persona-reset:${snapshot.user.id}`}))::text`;
    const before = await resolveExactlyOneUser(tx, snapshot.user.primaryEmail);
    assert.equal(before.id, snapshot.user.id, "Canonical user changed after dry-run inventory.");

    if (plan.revokeProjectGrantIds.length) {
      await tx.studioProjectAccessGrant.updateMany({
        where: { id: { in: plan.revokeProjectGrantIds } },
        data: {
          status: "REVOKED",
          note: `${POLICY_VERSION}:${operationId}:clean-coach-persona`,
        },
      });
    }
    if (plan.revokeNestInviteIds.length) {
      await tx.studioNestInvite.updateMany({
        where: { id: { in: plan.revokeNestInviteIds } },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          tokenHash: null,
          note: `${POLICY_VERSION}:${operationId}:clean-coach-persona`,
        },
      });
    }
    if (plan.removeParticipantIds.length) {
      await tx.callParticipant.updateMany({
        where: { id: { in: plan.removeParticipantIds } },
        data: {
          accessStatus: "REMOVED",
          accessChangedAt: new Date(),
          accessChangedByUserId: snapshot.user.id,
        },
      });
    }
    if (plan.removeEngagementMemberIds.length) {
      await tx.coachingEngagementMember.updateMany({
        where: { id: { in: plan.removeEngagementMemberIds } },
        data: {
          status: "REMOVED",
          removedAt: new Date(),
          removedByUserId: snapshot.user.id,
          accessChangedAt: new Date(),
          accessChangedByUserId: snapshot.user.id,
          accessRevision: { increment: 1 },
        },
      });
    }
    await tx.userRole.deleteMany({ where: { userId: snapshot.user.id } });
    await tx.userRole.create({
      data: { userId: snapshot.user.id, role: "COACH" },
    });
    if (plan.setDisplayNameTo) {
      await tx.user.update({
        where: { id: snapshot.user.id },
        data: { name: plan.setDisplayNameTo },
      });
    }
    await tx.coachProfile.upsert({
      where: { userId: snapshot.user.id },
      update: {
        displayName: plan.setDisplayNameTo || undefined,
        isActive: true,
      },
      create: {
        userId: snapshot.user.id,
        slug: `coach-${digest(snapshot.user.id).slice(0, 12)}`,
        displayName: plan.setDisplayNameTo || snapshot.user.primaryEmail.split("@")[0],
        timezone: "America/Denver",
        isActive: true,
        metadataJson: { source: POLICY_VERSION, operationId },
      },
    });
    await tx.userEvent.create({
      data: {
        userId: snapshot.user.id,
        eventName: "identity.coach_persona_reset_v1",
        payloadJson: {
          policyVersion: POLICY_VERSION,
          operationId,
          preservedHomeProjectIds: plan.preserveHomeProjectIds,
          revokedProjectGrantCount: plan.revokeProjectGrantIds.length,
          revokedInviteCount: plan.revokeNestInviteIds.length,
          removedParticipantCount: plan.removeParticipantIds.length,
          removedEngagementMemberCount: plan.removeEngagementMemberIds.length,
          resultingRoles: plan.setRolesTo,
          resultingDisplayName: plan.setDisplayNameTo,
        },
      },
    });
    return { operationId };
  });
}

const input = parseArgs(process.argv);
const databaseURL = databaseURLFromEnvironment();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseURL,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 30_000,
  }),
  log: ["error"],
});

try {
  const before = await inventory(prisma, input.email);
  const plan = planFromInventory(before, input);
  const applied = input.apply ? await applySafeReset(prisma, before, plan) : null;
  const after = applied ? await inventory(prisma, input.email) : null;
  const receipt = {
    schema: POLICY_VERSION,
    recordedAt: new Date().toISOString(),
    mode: input.apply ? "apply" : "dry-run",
    ok: true,
    targetEmail: input.email,
    canonicalIdentityPreserved: true,
    before,
    plan,
    applied,
    after,
    boundaries: {
      providerCredentialsUnchanged: true,
      canonicalUserUnchanged: true,
      homeNestPreserved: true,
      foreignProjectsNeverDeleted: true,
      foreignContentNeverDeleted: true,
      retainedOwnershipRequiresExplicitDisposition: true,
    },
  };
  await mkdir(input.receiptDirectory, { recursive: true });
  const receiptPath = path.join(
    input.receiptDirectory,
    `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}-${input.apply ? "applied" : "dry-run"}-${digest(input.email).slice(0, 10)}.json`,
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
} finally {
  await prisma.$disconnect();
}
