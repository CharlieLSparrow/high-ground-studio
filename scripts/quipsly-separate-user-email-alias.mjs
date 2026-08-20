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
  const result = { apply: false, retainedEmail: "", separateEmail: "" };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--apply") result.apply = true;
    else if (argv[index] === "--retained-email") result.retainedEmail = normalizeEmail(argv[++index]);
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

function publicId(value) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : null;
}

function preferredProvider(firebaseUser) {
  return firebaseUser.providerData.find((entry) => entry.providerId === "google.com")?.providerId
    || firebaseUser.providerData[0]?.providerId
    || "firebase";
}

async function separate(prisma, firebaseUser, input) {
  return prisma.$transaction(async (tx) => {
    for (const key of [input.retainedEmail, input.separateEmail].sort()) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`quipsly:identity:email:${key}`}))::text`;
    }

    const retained = await tx.user.findUnique({
      where: { primaryEmail: input.retainedEmail },
      include: {
        aliases: true,
        authIdentities: { where: { authority: AUTHORITY } },
      },
    });
    if (!retained || !retained.isActive || !retained.emailVerified) {
      throw new Error("The retained canonical user must exist, be active, and be verified.");
    }
    const alias = retained.aliases.find((entry) => entry.email === input.separateEmail);
    const primaryConflict = await tx.user.findUnique({
      where: { primaryEmail: input.separateEmail },
      include: { authIdentities: { where: { authority: AUTHORITY } } },
    });
    const projectGrants = await tx.studioProjectAccessGrant.count({
      where: { email: input.separateEmail, status: "ACTIVE" },
    });
    if (!alias && primaryConflict) {
      const exactLedger = primaryConflict.authIdentities.some((entry) => entry.subject === firebaseUser.uid);
      if (primaryConflict.firebaseUid !== firebaseUser.uid || !exactLedger || !primaryConflict.isActive) {
        throw new Error("A separate canonical user exists, but its Firebase binding is incomplete or unsafe.");
      }
      return {
        ok: true,
        mode: input.apply ? "apply" : "dry-run",
        status: "already-separated",
        retainedUserId: publicId(retained.id),
        separateUserId: publicId(primaryConflict.id),
        retainedEmail: input.retainedEmail,
        separateEmail: input.separateEmail,
        activeEmailScopedProjectGrantsPreserved: projectGrants,
        userOwnedDataMoved: false,
        firebaseCredentialChanged: false,
        staleNativeSessionsRevoked: 0,
      };
    }
    if (!alias) throw new Error("The separate email is not an alias of the retained user.");
    if (retained.firebaseUid === firebaseUser.uid) {
      throw new Error("The separate Firebase subject is the retained user's legacy compatibility UID.");
    }
    const ledger = retained.authIdentities.find((entry) => entry.subject === firebaseUser.uid);
    if (!ledger || ledger.emailAtLink !== input.separateEmail) {
      throw new Error("The exact separate Firebase subject is not explicitly bound to this alias.");
    }
    if (primaryConflict) throw new Error("A canonical user already owns the separate primary email.");
    const result = {
      ok: true,
      mode: input.apply ? "apply" : "dry-run",
      status: input.apply ? "separated" : "ready",
      retainedUserId: publicId(retained.id),
      separateUserId: null,
      retainedEmail: input.retainedEmail,
      separateEmail: input.separateEmail,
      activeEmailScopedProjectGrantsPreserved: projectGrants,
      userOwnedDataMoved: false,
      firebaseCredentialChanged: false,
      staleNativeSessionsRevoked: 0,
    };
    if (!input.apply) return result;

    await tx.userEmail.delete({ where: { id: alias.id } });
    const created = await tx.user.create({
      data: {
        primaryEmail: input.separateEmail,
        name: firebaseUser.displayName?.trim() || null,
        image: firebaseUser.photoURL || null,
        firebaseUid: firebaseUser.uid,
        emailVerified: new Date(),
        isActive: true,
        roles: { create: { role: "COACH" } },
      },
    });
    await tx.userAuthIdentity.update({
      where: { id: ledger.id },
      data: {
        userId: created.id,
        provider: preferredProvider(firebaseUser),
        emailAtLink: input.separateEmail,
        emailVerifiedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    const freePlan = await tx.membershipPlan.upsert({
      where: { slug: "quipsly-free" },
      create: {
        slug: "quipsly-free",
        name: "Quipsly Free",
        description: "Free starter access for writing, notes, Home Nest intake, and beta exploration.",
        priceCents: 0,
        isActive: true,
      },
      update: { isActive: true },
    });
    await tx.membership.create({
      data: {
        userId: created.id,
        planId: freePlan.id,
        status: "ACTIVE",
        notes: "Provisioned while separating an independently verified login identity.",
      },
    });
    const now = new Date();
    const revoked = await tx.studioNativeDeviceSession.updateMany({
      where: { userId: retained.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.userEvent.createMany({
      data: [
        {
          userId: retained.id,
          eventName: "identity.email_alias_detached_v1",
          payloadJson: {
            retainedEmail: input.retainedEmail,
            detachedEmail: input.separateEmail,
            separateUserId: created.id,
            firebaseAuthority: AUTHORITY,
            preservedEmailScopedProjectGrants: projectGrants,
          },
        },
        {
          userId: created.id,
          eventName: "identity.canonical_account_created_from_detached_alias_v1",
          payloadJson: {
            retainedUserId: retained.id,
            primaryEmail: input.separateEmail,
            firebaseAuthority: AUTHORITY,
            preservedEmailScopedProjectGrants: projectGrants,
          },
        },
      ],
    });
    return {
      ...result,
      separateUserId: publicId(created.id),
      staleNativeSessionsRevoked: revoked.count,
    };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}

async function main() {
  const input = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "quipsly-reef" });
  const firebaseUser = await getAuth().getUserByEmail(input.separateEmail);
  if (!firebaseUser.emailVerified || firebaseUser.disabled) {
    throw new Error("The separate Firebase account must be enabled and verified.");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrlForProxy(process.env.DATABASE_URL), max: 1 }),
  });
  try {
    const result = await separate(prisma, firebaseUser, input);
    console.log(JSON.stringify({
      ...result,
      note: input.apply
        ? "The exact Firebase subject now resolves to its own canonical user. Existing user-owned records stayed with the retained account; email-scoped grants stayed with the email. The next sign-in provisions the separate Home Nest."
        : "No data changed. Re-run with --apply only after reviewing the plan.",
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`QUIPSLY_IDENTITY_SEPARATION_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
