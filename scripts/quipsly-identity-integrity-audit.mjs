#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const showEmails = args.has("--show-emails");
const showUserIds = args.has("--show-user-ids");
const QUIPSLY_FREE_PLAN_SLUG = "quipsly-free";
const HOME_NEST_SOURCE_LABEL = "nest-kind:home";
const HOME_NEST_BIN_NAME = "Inbox";

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
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
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
  return applyCloudSqlProxyRewrite({
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...process.env,
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function visibleEmail(email) {
  if (showEmails) return email;
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "[redacted-email]";
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}${"*".repeat(Math.max(3, local.length - prefix.length))}@${domain}`;
}

function visibleUserId(id) {
  if (showUserIds) return id;
  if (!id) return null;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function publicUserRef(user) {
  return {
    id: visibleUserId(user.id),
    primaryEmail: visibleEmail(user.primaryEmail),
    isActive: user.isActive,
    hasFirebaseUid: Boolean(user.firebaseUid),
    firebaseIdentityCount: user.authIdentities?.length || 0,
  };
}

function publicAliasRef(alias) {
  return {
    id: visibleUserId(alias.id),
    userId: visibleUserId(alias.userId),
    email: visibleEmail(alias.email),
    label: alias.label,
  };
}

function publicProjectRef(record) {
  return {
    id: visibleUserId(record.id),
    projectId: visibleUserId(record.projectId),
    projectSlug: record.project?.slug || null,
    email: visibleEmail(record.email),
    role: record.role,
    status: record.status,
  };
}

function pushMapList(map, key, value) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function unique(values) {
  return Array.from(new Set(values));
}

function projectEmailKey(record) {
  return `${record.projectId}\u0000${normalizeEmail(record.email)}`;
}

function isLiveInviteStatus(status) {
  return !["accepted", "revoked", "expired", "cancelled", "canceled"].includes(
    String(status || "").trim().toLowerCase(),
  );
}

function isAcceptedInviteStatus(status) {
  return String(status || "").trim().toLowerCase() === "accepted";
}

function isActiveGrantStatus(status) {
  return String(status || "").trim().toUpperCase() === "ACTIVE";
}

function slugifyEmailForHomeNest(email) {
  return normalizeEmail(email)
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function expectedHomeNestSlug(email) {
  return `home-${slugifyEmailForHomeNest(email)}`;
}

function publicHomeNestRef(project) {
  if (!project) return null;
  return {
    id: visibleUserId(project.id),
    slug: project.slug,
    sourceLabel: project.sourceLabel,
    isPrivate: project.isPrivate,
    activeOwnerGrants: project.accessGrants.filter((grant) => grant.role === "OWNER").length,
    inboxBins: project.mediaBins.length,
  };
}

async function main() {
  const env = mergedEnv();
  if (!env.DATABASE_URL) {
    console.log(JSON.stringify({
      ok: false,
      mode: "read-only",
      failureKind: "environment-blocker",
      summary: "DATABASE_URL is not available for identity integrity audit.",
      action: "Provide DATABASE_URL or run through the Cloud SQL proxy rewrite used by Quipsly smoke scripts.",
      note: "This audit does not print database URLs, secrets, Firebase tokens, cookies, or passwords.",
    }, null, 2));
    process.exit(2);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: Number.parseInt(env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: Number.parseInt(env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "30000", 10) || 30_000,
    }),
    log: ["error"],
  });

  try {
    const [users, aliases, accessGrants, nestInvites, freePlan, homeProjects] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          primaryEmail: true,
          firebaseUid: true,
          isActive: true,
          authIdentities: {
            where: { authority: "firebase:quipsly-reef" },
            select: {
              authority: true,
              subject: true,
            },
          },
        },
      }),
      prisma.userEmail.findMany({
        select: {
          id: true,
          userId: true,
          email: true,
          label: true,
        },
      }),
      prisma.studioProjectAccessGrant.findMany({
        select: {
          id: true,
          projectId: true,
          email: true,
          role: true,
          status: true,
          project: {
            select: {
              slug: true,
            },
          },
        },
      }),
      prisma.studioNestInvite.findMany({
        select: {
          id: true,
          projectId: true,
          email: true,
          role: true,
          status: true,
          project: {
            select: {
              slug: true,
            },
          },
        },
      }),
      prisma.membershipPlan.findUnique({
        where: { slug: QUIPSLY_FREE_PLAN_SLUG },
        select: {
          id: true,
          slug: true,
          isActive: true,
          memberships: {
            where: {
              status: "ACTIVE",
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            },
            select: {
              id: true,
              userId: true,
            },
          },
        },
      }),
      prisma.studioProject.findMany({
        where: {
          sourceLabel: HOME_NEST_SOURCE_LABEL,
        },
        select: {
          id: true,
          slug: true,
          sourceLabel: true,
          isPrivate: true,
          accessGrants: {
            where: { status: "ACTIVE" },
            select: {
              email: true,
              role: true,
            },
          },
          mediaBins: {
            where: { name: HOME_NEST_BIN_NAME },
            select: { id: true },
          },
        },
      }),
    ]);

    const primaryByEmail = new Map();
    const aliasesByEmail = new Map();
    const firebaseUidByValue = new Map();
    const grantsByProjectEmail = new Map();
    const liveInvitesByProjectEmail = new Map();
    const userIdsByEmail = new Map();
    const emailsByUserId = new Map();
    const homeProjectBySlug = new Map();
    const activeFreeMembershipUserIds = new Set(
      (freePlan?.memberships || []).map((membership) => membership.userId),
    );

    for (const user of users) {
      const email = normalizeEmail(user.primaryEmail);
      pushMapList(primaryByEmail, email, user);
      pushMapList(userIdsByEmail, email, user.id);
      pushMapList(emailsByUserId, user.id, email);
      if (user.firebaseUid) {
        pushMapList(firebaseUidByValue, user.firebaseUid, user);
      }
      for (const identity of user.authIdentities) {
        if (identity.subject !== user.firebaseUid) {
          pushMapList(firebaseUidByValue, identity.subject, user);
        }
      }
    }

    for (const alias of aliases) {
      const email = normalizeEmail(alias.email);
      pushMapList(aliasesByEmail, email, alias);
      pushMapList(userIdsByEmail, email, alias.userId);
      pushMapList(emailsByUserId, alias.userId, email);
    }

    for (const grant of accessGrants) {
      pushMapList(grantsByProjectEmail, projectEmailKey(grant), grant);
    }

    for (const invite of nestInvites) {
      if (isLiveInviteStatus(invite.status)) {
        pushMapList(liveInvitesByProjectEmail, projectEmailKey(invite), invite);
      }
    }

    for (const project of homeProjects) {
      homeProjectBySlug.set(project.slug, project);
    }

    const hardIssues = [];
    const warnings = [];

    for (const [email, records] of primaryByEmail.entries()) {
      if (records.length > 1) {
        hardIssues.push({
          type: "duplicate-primary-email",
          email: visibleEmail(email),
          summary: "Multiple User.primaryEmail values normalize to the same email.",
          users: records.map(publicUserRef),
        });
      }
    }

    for (const [email, records] of aliasesByEmail.entries()) {
      const userIds = unique(records.map((record) => record.userId));
      if (userIds.length > 1) {
        hardIssues.push({
          type: "duplicate-alias-email-across-users",
          email: visibleEmail(email),
          summary: "One normalized UserEmail alias points at multiple users.",
          aliases: records.map(publicAliasRef),
        });
      } else if (records.length > 1) {
        warnings.push({
          type: "duplicate-alias-email-same-user",
          email: visibleEmail(email),
          summary: "One user has repeated aliases that normalize to the same email.",
          aliases: records.map(publicAliasRef),
        });
      }
    }

    for (const [email, primaryUsers] of primaryByEmail.entries()) {
      const aliasRecords = aliasesByEmail.get(email) || [];
      for (const alias of aliasRecords) {
        const sameUser = primaryUsers.some((user) => user.id === alias.userId);
        if (sameUser) {
          warnings.push({
            type: "primary-email-also-own-alias",
            email: visibleEmail(email),
            summary: "A user primary email is also stored as that same user's alias.",
            alias: publicAliasRef(alias),
          });
          continue;
        }

        hardIssues.push({
          type: "primary-email-alias-collision",
          email: visibleEmail(email),
          summary: "A normalized email is a primary email for one user and an alias for another.",
          primaryUsers: primaryUsers.map(publicUserRef),
          alias: publicAliasRef(alias),
        });
      }
    }

    for (const [firebaseUid, records] of firebaseUidByValue.entries()) {
      if (records.length > 1) {
        hardIssues.push({
          type: "duplicate-firebase-uid",
          firebaseUid: showUserIds ? firebaseUid : "[redacted-firebase-uid]",
          summary: "Multiple users have the same Firebase UID. This should be impossible with the DB unique constraint.",
          users: records.map(publicUserRef),
        });
      }
    }

    for (const [key, records] of grantsByProjectEmail.entries()) {
      if (records.length > 1) {
        hardIssues.push({
          type: "duplicate-project-access-grant-normalized-email",
          email: visibleEmail(key.split("\u0000")[1]),
          summary: "A Nest has multiple access grants whose emails normalize to the same address.",
          grants: records.map(publicProjectRef),
        });
      }
    }

    for (const [key, records] of liveInvitesByProjectEmail.entries()) {
      if (records.length > 1) {
        hardIssues.push({
          type: "duplicate-live-nest-invite-normalized-email",
          email: visibleEmail(key.split("\u0000")[1]),
          summary: "A Nest has multiple live invites whose emails normalize to the same address.",
          invites: records.map(publicProjectRef),
        });
      }
    }

    for (const grant of accessGrants) {
      const email = normalizeEmail(grant.email);
      const matchingUserIds = unique(userIdsByEmail.get(email) || []);
      if (isActiveGrantStatus(grant.status) && matchingUserIds.length === 0) {
        hardIssues.push({
          type: "active-access-grant-without-app-user",
          email: visibleEmail(email),
          summary: "An active Nest access grant has no matching app-owned User primary email or alias.",
          grant: publicProjectRef(grant),
        });
      }
    }

    for (const invite of nestInvites) {
      const email = normalizeEmail(invite.email);
      const matchingUserIds = unique(userIdsByEmail.get(email) || []);
      const matchingActiveGrants = (grantsByProjectEmail.get(projectEmailKey(invite)) || []).filter((grant) =>
        isActiveGrantStatus(grant.status),
      );

      if (isLiveInviteStatus(invite.status) && matchingUserIds.length === 0) {
        hardIssues.push({
          type: "live-invite-without-app-user",
          email: visibleEmail(email),
          summary: "A live Nest invite has no matching app-owned User primary email or alias.",
          invite: publicProjectRef(invite),
        });
      }

      if (isLiveInviteStatus(invite.status) && matchingActiveGrants.length === 0) {
        hardIssues.push({
          type: "live-invite-without-active-access-grant",
          email: visibleEmail(email),
          summary: "A live Nest invite is missing the matching active access grant required by the invite-first flow.",
          invite: publicProjectRef(invite),
        });
      }

      if (isAcceptedInviteStatus(invite.status) && matchingActiveGrants.length === 0) {
        hardIssues.push({
          type: "accepted-invite-without-active-access-grant",
          email: visibleEmail(email),
          summary: "An accepted Nest invite is missing the matching active access grant.",
          invite: publicProjectRef(invite),
        });
      }
    }

    const firebaseLinkedActiveUsers = users.filter(
      (user) =>
        user.isActive &&
        (Boolean(user.firebaseUid) || user.authIdentities.length > 0),
    );
    if (firebaseLinkedActiveUsers.length > 0 && !freePlan) {
      hardIssues.push({
        type: "free-plan-missing",
        summary: `Firebase-linked users exist, but ${QUIPSLY_FREE_PLAN_SLUG} is missing.`,
        impactedUsers: firebaseLinkedActiveUsers.map(publicUserRef),
      });
    } else if (firebaseLinkedActiveUsers.length > 0 && freePlan && !freePlan.isActive) {
      hardIssues.push({
        type: "free-plan-inactive",
        summary: `${QUIPSLY_FREE_PLAN_SLUG} exists but is inactive.`,
      });
    }

    for (const user of firebaseLinkedActiveUsers) {
      const userEmails = unique(emailsByUserId.get(user.id) || [normalizeEmail(user.primaryEmail)]);
      if (!activeFreeMembershipUserIds.has(user.id)) {
        hardIssues.push({
          type: "firebase-linked-user-missing-active-free-membership",
          email: visibleEmail(user.primaryEmail),
          summary: "A Firebase-linked active user is missing an active Quipsly Free membership.",
          user: publicUserRef(user),
        });
      }

      const homeSlug = expectedHomeNestSlug(user.primaryEmail);
      const homeProject = homeProjectBySlug.get(homeSlug);
      if (!homeProject) {
        hardIssues.push({
          type: "firebase-linked-user-missing-home-nest",
          email: visibleEmail(user.primaryEmail),
          summary: "A Firebase-linked active user is missing the expected Home Nest.",
          expectedHomeNestSlug: homeSlug,
          user: publicUserRef(user),
        });
        continue;
      }

      const ownerGrant = homeProject.accessGrants.find((grant) =>
        grant.role === "OWNER" && userEmails.includes(normalizeEmail(grant.email)),
      );
      if (!ownerGrant) {
        hardIssues.push({
          type: "home-nest-missing-owner-grant",
          email: visibleEmail(user.primaryEmail),
          summary: "A Firebase-linked active user's Home Nest is missing a matching active OWNER grant.",
          expectedHomeNestSlug: homeSlug,
          homeNest: publicHomeNestRef(homeProject),
          user: publicUserRef(user),
        });
      }

      if (!homeProject.isPrivate) {
        warnings.push({
          type: "home-nest-not-private",
          email: visibleEmail(user.primaryEmail),
          summary: "A Home Nest is not marked private.",
          homeNest: publicHomeNestRef(homeProject),
        });
      }

      if (homeProject.mediaBins.length === 0) {
        warnings.push({
          type: "home-nest-missing-inbox-bin",
          email: visibleEmail(user.primaryEmail),
          summary: "A Home Nest is missing its Inbox media bin.",
          homeNest: publicHomeNestRef(homeProject),
        });
      }
    }

    const result = {
      ok: hardIssues.length === 0,
      mode: "read-only",
      failureKind: hardIssues.length ? "identity-conflict" : null,
      redaction: showEmails || showUserIds ? "partially-disabled-by-operator-flag" : "default-redacted",
      counts: {
        users: users.length,
        aliases: aliases.length,
        accessGrants: accessGrants.length,
        liveNestInvites: Array.from(liveInvitesByProjectEmail.values()).reduce(
          (sum, records) => sum + records.length,
          0,
        ),
        homeNests: homeProjects.length,
        activeFreeMemberships: activeFreeMembershipUserIds.size,
        normalizedPrimaryEmails: primaryByEmail.size,
        normalizedAliasEmails: aliasesByEmail.size,
        firebaseLinkedUsers: users.filter(
          (user) => Boolean(user.firebaseUid) || user.authIdentities.length > 0,
        ).length,
        firebaseLinkedActiveUsers: firebaseLinkedActiveUsers.length,
      },
      issueCounts: {
        hardIssues: hardIssues.length,
        warnings: warnings.length,
      },
      hardIssues,
      warnings,
      note: "This audit does not print database URLs, secrets, Firebase tokens, cookies, or passwords. Use --show-emails only for local operator debugging.",
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`QUIPSLY_IDENTITY_INTEGRITY_AUDIT_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
