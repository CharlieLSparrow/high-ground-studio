#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const repoRoot = process.cwd();
const FIREBASE_AUTHORITY = "firebase:quipsly-reef";

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
  if (!(url.searchParams.get("host") || "").startsWith("/cloudsql/")) return env;

  url.hostname = "127.0.0.1";
  url.port = proxyPort;
  url.searchParams.delete("host");
  return { ...env, DATABASE_URL: url.toString() };
}

function mergedEnv() {
  return applyCloudSqlProxyRewrite({
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...process.env,
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const result = {
    apply: false,
    canonicalEmail: "",
    aliasEmail: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--canonical-email") {
      result.canonicalEmail = normalizeEmail(argv[++index]);
    } else if (arg === "--alias-email") {
      result.aliasEmail = normalizeEmail(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!result.canonicalEmail || !result.aliasEmail) {
    throw new Error(
      "Usage: node scripts/quipsly-reconcile-firebase-email-alias.mjs "
      + "--canonical-email <email> --alias-email <email> [--apply]",
    );
  }
  if (result.canonicalEmail === result.aliasEmail) {
    throw new Error("Canonical and alias email must be different.");
  }
  return result;
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 30_000,
    }),
    log: ["error"],
  });
}

function createFirebaseAuth(env) {
  if (!getApps().length) {
    initializeApp({
      projectId:
        env.FIREBASE_PROJECT_ID
        || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        || "quipsly-reef",
    });
  }
  return getAuth();
}

function providerIds(user) {
  return user.providerData.map((provider) => provider.providerId).sort();
}

async function readReconciliationState({ prisma, auth, input }) {
  const [canonicalFirebase, aliasFirebase, canonicalUser] = await Promise.all([
    auth.getUserByEmail(input.canonicalEmail),
    auth.getUserByEmail(input.aliasEmail),
    prisma.user.findUnique({
      where: { primaryEmail: input.canonicalEmail },
      select: {
        id: true,
        isActive: true,
        emailVerified: true,
        firebaseUid: true,
        aliases: {
          where: { email: input.aliasEmail },
          select: { email: true, label: true },
        },
        authIdentities: {
          where: { authority: FIREBASE_AUTHORITY },
          select: {
            subject: true,
            provider: true,
            emailAtLink: true,
          },
        },
      },
    }),
  ]);

  if (!canonicalUser) {
    throw new Error("Canonical Quipsly user does not exist.");
  }
  if (!canonicalUser.isActive || !canonicalUser.emailVerified) {
    throw new Error("Canonical Quipsly user must be active and verified.");
  }
  if (canonicalUser.aliases.length !== 1) {
    throw new Error("Alias email is not owned by the canonical Quipsly user.");
  }
  if (!canonicalFirebase.emailVerified || canonicalFirebase.disabled) {
    throw new Error("Canonical Firebase credential must be enabled and verified.");
  }
  if (!providerIds(canonicalFirebase).includes("google.com")) {
    throw new Error("Canonical Firebase credential must include Google.");
  }

  const canonicalFirebaseSubjects = new Set([
    canonicalUser.firebaseUid,
    ...canonicalUser.authIdentities.map((identity) => identity.subject),
  ].filter(Boolean));
  if (!canonicalFirebaseSubjects.has(canonicalFirebase.uid)) {
    throw new Error(
      "Canonical Firebase credential is not bound to the canonical Quipsly user.",
    );
  }
  if (canonicalFirebase.uid === aliasFirebase.uid) {
    throw new Error("Canonical and alias emails unexpectedly resolve to one Firebase UID.");
  }
  if (aliasFirebase.disabled) {
    throw new Error("Alias Firebase credential is disabled; operator review is required.");
  }
  const aliasProviders = providerIds(aliasFirebase);
  if (
    aliasProviders.length !== 1
    || aliasProviders[0] !== "password"
  ) {
    throw new Error(
      "Alias Firebase credential is not password-only; explicit provider-link review is required.",
    );
  }

  const [aliasIdentityBindings, aliasLegacyBindings] = await Promise.all([
    prisma.userAuthIdentity.count({
      where: {
        authority: FIREBASE_AUTHORITY,
        subject: aliasFirebase.uid,
      },
    }),
    prisma.user.count({
      where: { firebaseUid: aliasFirebase.uid },
    }),
  ]);
  if (aliasIdentityBindings > 0 || aliasLegacyBindings > 0) {
    throw new Error(
      "Alias Firebase credential already has a Quipsly identity binding; no reconciliation was attempted.",
    );
  }

  return {
    canonicalFirebase,
    aliasFirebase,
    canonicalUser,
    aliasProviders,
  };
}

async function main() {
  const input = parseArgs(process.argv);
  const env = mergedEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = createPrisma(env);
  const auth = createFirebaseAuth(env);

  try {
    const state = await readReconciliationState({ prisma, auth, input });
    const alreadyVerified = state.aliasFirebase.emailVerified;

    if (input.apply && !alreadyVerified) {
      await auth.updateUser(state.aliasFirebase.uid, { emailVerified: true });
      await prisma.userEvent.create({
        data: {
          userId: state.canonicalUser.id,
          eventName: "identity.firebase_email_alias_verified_v1",
          payloadJson: {
            canonicalEmail: input.canonicalEmail,
            aliasEmail: input.aliasEmail,
            aliasLabel: state.canonicalUser.aliases[0].label,
            firebaseAuthority: FIREBASE_AUTHORITY,
            providers: state.aliasProviders,
            operator:
              process.env.QUIPSLY_IDENTITY_RECONCILE_OPERATOR
              || "local-gcloud-operator",
            rationale:
              "Existing Quipsly alias ownership and verified canonical Google identity proved mailbox continuity.",
          },
        },
      });
    }

    const readback = await auth.getUser(state.aliasFirebase.uid);
    if (input.apply && !readback.emailVerified) {
      throw new Error("Firebase readback did not confirm the alias email as verified.");
    }

    console.log(JSON.stringify({
      ok: true,
      mode: input.apply ? "apply" : "dry-run",
      status:
        readback.emailVerified
          ? (alreadyVerified ? "already-verified" : "verified")
          : "ready",
      canonicalEmail: input.canonicalEmail,
      aliasEmail: input.aliasEmail,
      canonicalGoogleCredentialVerified: state.canonicalFirebase.emailVerified,
      aliasOwnedByCanonicalQuipslyUser: true,
      aliasFirebaseCredential: {
        emailVerified: readback.emailVerified,
        disabled: readback.disabled,
        providers: providerIds(readback),
        quipslyIdentityBindings: 0,
      },
      providerLinkStillRequired: !providerIds(readback).includes("google.com"),
      destructiveCredentialChange: false,
      note: input.apply
        ? "Firebase verification was reconciled without deleting or replacing the password credential. Google can be linked after the project-owned OAuth clients are provisioned."
        : "No data was changed. Re-run with --apply after reviewing the identity proof.",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `QUIPSLY_FIREBASE_EMAIL_ALIAS_RECONCILE_FAIL ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
