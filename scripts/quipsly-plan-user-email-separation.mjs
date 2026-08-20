#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const AUTHORITY = "firebase:quipsly-reef";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const result = { retainedEmail: "", separateEmail: "" };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--retained-email") result.retainedEmail = normalizeEmail(argv[++index]);
    else if (argv[index] === "--separate-email") result.separateEmail = normalizeEmail(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!result.retainedEmail || !result.separateEmail || result.retainedEmail === result.separateEmail) {
    throw new Error("Provide two distinct --retained-email and --separate-email values.");
  }
  return result;
}

function databaseUrlForProxy(databaseUrl) {
  const proxyPort = String(process.env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT || "").trim();
  if (!proxyPort) return databaseUrl;
  const url = new URL(databaseUrl);
  if (!(url.searchParams.get("host") || "").startsWith("/cloudsql/")) return databaseUrl;
  url.hostname = "127.0.0.1";
  url.port = proxyPort;
  url.searchParams.delete("host");
  return url.toString();
}

function providerIds(user) {
  return user.providerData.map((entry) => entry.providerId).sort();
}

async function main() {
  const input = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "quipsly-reef" });
  const auth = getAuth();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrlForProxy(process.env.DATABASE_URL),
      max: 1,
      connectionTimeoutMillis: 30_000,
    }),
  });

  try {
    const [retainedFirebase, separateFirebase, users] = await Promise.all([
      auth.getUserByEmail(input.retainedEmail),
      auth.getUserByEmail(input.separateEmail),
      prisma.user.findMany({
        where: {
          OR: [
            { primaryEmail: { in: [input.retainedEmail, input.separateEmail] } },
            { aliases: { some: { email: { in: [input.retainedEmail, input.separateEmail] } } } },
          ],
        },
        include: {
          aliases: true,
          authIdentities: { where: { authority: AUTHORITY } },
          roles: true,
          nativeDeviceSessions: { where: { revokedAt: null }, select: { id: true } },
        },
      }),
    ]);

    const retainedUser = users.find((user) =>
      user.primaryEmail === input.retainedEmail || user.aliases.some((alias) => alias.email === input.retainedEmail));
    const separateUser = users.find((user) =>
      user.primaryEmail === input.separateEmail || user.aliases.some((alias) => alias.email === input.separateEmail));
    const separateLedger = users.flatMap((user) => user.authIdentities.map((identity) => ({ user, identity })))
      .find(({ identity }) => identity.subject === separateFirebase.uid);

    const [projectGrants, nestInvites, callInvitations, coachingInvitations] = await Promise.all([
      prisma.studioProjectAccessGrant.findMany({
        where: { email: input.separateEmail },
        select: { role: true, status: true, project: { select: { slug: true, sourceLabel: true } } },
      }),
      prisma.studioNestInvite.findMany({
        where: { email: input.separateEmail },
        select: { role: true, status: true, project: { select: { slug: true } } },
      }),
      prisma.callRoomInvitation.count({ where: { email: input.separateEmail } }),
      prisma.coachingEngagementInvitation.count({ where: { invitedEmail: input.separateEmail } }),
    ]);

    const sameCanonicalUser = Boolean(retainedUser && separateUser && retainedUser.id === separateUser.id);
    const separateIsAlias = Boolean(retainedUser?.aliases.some((alias) => alias.email === input.separateEmail));
    const directSeparatePrimaryExists = users.some((user) => user.primaryEmail === input.separateEmail);
    const canSeparate = Boolean(
      retainedUser
      && sameCanonicalUser
      && separateIsAlias
      && !directSeparatePrimaryExists
      && retainedFirebase.uid !== separateFirebase.uid
      && separateLedger?.user.id === retainedUser.id
      && separateFirebase.emailVerified
      && !separateFirebase.disabled,
    );

    console.log(JSON.stringify({
      ok: canSeparate,
      mode: "read-only",
      retainedEmail: input.retainedEmail,
      separateEmail: input.separateEmail,
      current: {
        sameCanonicalUser,
        canonicalPrimaryEmail: retainedUser?.primaryEmail || null,
        separateEmailIsAlias: separateIsAlias,
        separatePrimaryAlreadyExists: directSeparatePrimaryExists,
        canonicalRoles: retainedUser?.roles.map((entry) => entry.role).sort() || [],
        activeNativeDeviceSessionsOnCanonicalUser: retainedUser?.nativeDeviceSessions.length || 0,
      },
      firebase: {
        distinctSubjects: retainedFirebase.uid !== separateFirebase.uid,
        retainedEmailVerified: retainedFirebase.emailVerified,
        retainedProviders: providerIds(retainedFirebase),
        separateEmailVerified: separateFirebase.emailVerified,
        separateDisabled: separateFirebase.disabled,
        separateProviders: providerIds(separateFirebase),
        separateSubjectBoundToCanonicalUser: separateLedger?.user.id === retainedUser?.id,
        separateLedgerEmail: separateLedger?.identity.emailAtLink || null,
      },
      emailScopedAccess: {
        projectGrants,
        nestInvites,
        callInvitationCount: callInvitations,
        coachingInvitationCount: coachingInvitations,
      },
      proposedBoundary: canSeparate
        ? "Detach only the separate email and its exact Firebase subject into a new canonical User; preserve the retained User and all user-owned data; review email-scoped grants before activation; revoke stale native sessions; provision a new private Home Nest and free membership."
        : "No mutation is safe until the failed identity preconditions are resolved.",
      secretsPrinted: false,
    }, null, 2));
    process.exit(canSeparate ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`QUIPSLY_IDENTITY_SEPARATION_PLAN_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
