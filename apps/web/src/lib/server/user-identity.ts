import "server-only";

import type { AppRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canAccessInternalContent } from "@/lib/authz";

// What this file does:
// This is the app's identity bureau. Provider auth may tell us "a Google user
// exists," but this file decides which local User record that person belongs
// to, which roles should be attached, and which email is canonical inside the
// app's own records.
//
// Why this matters:
// Products get weird when they confuse provider identity ("Google says yes")
// with app identity ("this is the person in our system with these roles and
// these preferences"). This file is the seam that keeps those concepts from
// eloping and starting a regrettable circus.
//
// Best practice (the "textbook" version):
// A mature identity domain often has explicit models for:
// - human identity
// - auth methods
// - email contacts
// - role grants
// - consent records
// - machine principals
// with audited transitions between them.
//
// What we are doing instead (and why):
// We keep one strong canonical User model with supporting alias and role tables
// because the product is still young enough that this shape gives most of the
// conceptual safety without requiring an identity cathedral.
//
// Tradeoff:
// We gain focus and a single obvious human record.
// We sacrifice some long-term specialization, especially around email-only
// contacts and future agent access.
//
// Question for Future Charlie:
// Is this file "just helper code" or is it secretly architecture?
//
// Answer:
// Secretly architecture. The system will tend to become whatever assumptions
// this file bakes in about what a person is and how one is found.
//
// First assumption that breaks:
// "Every meaningful identity starts life as a Google-authenticated human."
//
// What it looks like now:
// One canonical User model, Google-based sign-in bootstrap, env-based role
// seeding, and a few internal provisioning paths.
//
// What it turns into later:
// A broader identity hub that can unify multiple human auth methods, email-only
// contacts, and eventually machine actors without pretending they are all the
// same species.
//
// Signal to evolve it:
// If you start asking "is this email a user, a newsletter contact, an alias,
// or a service account owner?" in several places, the identity model is asking
// for more explicit sibling tables.
//
// Footnote:
// Think of Google as an embassy issuing passports. This file is city hall,
// where someone squints at the passport, looks through several drawers, and
// says, "Ah. You are in the ledger. Also, apparently you have keys."
const userIdentityInclude = {
  roles: true,
  aliases: true,
} satisfies Prisma.UserInclude;

// Source of truth:
// We almost always need roles and alias emails alongside the user record when
// resolving identity. Pulling them as a named include keeps the shape stable
// and saves future readers from spelunking through relation boilerplate.
//
// Best practice (the "textbook" version):
// Hide repeated query shapes behind named projections or repositories so
// relation sprawl does not leak everywhere.
//
// What we are doing instead (and why):
// Exactly that, but in a humble local constant rather than a full repository
// abstraction. The Patrician would approve of the efficiency.
type UserIdentityRecord = Prisma.UserGetPayload<{
  include: typeof userIdentityInclude;
}>;

// What this does:
// This is the app-facing identity bundle used by auth/session logic and server
// code. It is intentionally smaller than the full Prisma model.
//
// Interview lens:
// Mapping DB records into an app-specific identity object is a quiet but very
// useful pattern. It gives you one place to define what "the app knows about a
// user right now" instead of smearing that knowledge across fifty files.
//
// Best practice (the "textbook" version):
// Separate persistence models from domain/session models.
//
// What we are doing instead (and why):
// A lightweight manual mapping, not a grand domain-object framework. It keeps
// the seam visible without hiring a parade of abstractions.
export type AppUserIdentity = {
  id: string;
  primaryEmail: string;
  name: string | null;
  image: string | null;
  roles: AppRole[];
  isStaff: boolean;
  newsletterOptIn: boolean;
  announcementsOptIn: boolean;
  welcomeCompletedAt: Date | null;
};

export type PreprovisionedUserInput = {
  primaryEmail: string;
  name?: string | null;
  roles?: AppRole[];
  aliasEmails?: string[];
  newsletterOptIn?: boolean;
  announcementsOptIn?: boolean;
  createClientProfile?: boolean;
};

// Why normalize hard:
// Email identity is one of those domains where extra whitespace and surprise
// capitalization can create duplicate humans, and duplicate humans tend to
// breed duplicate bugs.
//
// Smell test:
// If a system lets `"Charlie@Example.com"` and `" charlie@example.com "` become
// two different people, the gods of small decisions have already started
// sharpening knives.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// These env lists are a tiny bootstrap control plane:
// cheap, explicit, and good enough while the role model is still simple.
//
// Best practice (the "textbook" version):
// A dedicated admin-managed role grant system with audit history.
//
// What we are doing instead (and why):
// Static env configuration because team membership is still small, trusted, and
// infrequently changed enough that runtime role-admin UI would be more opera
// than value today.
function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

// A person can end up with the same role from multiple paths. We only want the
// badge once. Even bureaucracies have limits.
function uniqueRoles(roles: AppRole[]): AppRole[] {
  return [...new Set(roles)];
}

// Alias emails let one human be found by more than one address without
// creating more than one User. This is the difference between a family tree
// and a hydra.
//
// Question for Future Charlie:
// Why store aliases as rows instead of a comma-separated field on User?
//
// Answer:
// Because identities deserve structure. Lists in strings are tavern gossip,
// not ledgers.
function normalizeAliasEmails(aliasEmails: string[] | undefined): string[] {
  return [...new Set((aliasEmails ?? []).map(normalizeEmail).filter(Boolean))];
}

// What this does:
// Reads role bootstrap lists from env vars and turns "this email belongs to
// staff" into concrete AppRole entries.
//
// Why this matters:
// This is not full authorization policy. It is initial role assignment at the
// moment identity enters the app. The authz layer later answers "what may this
// role do?"
//
// Future complexity wearing a fake mustache:
// "I am just a few env vars. Surely I can remain the eternal role-management
// strategy for an entire growing product." No. That mustache is drawn on.
//
// What it looks like now:
// Small trusted email lists for owners, schedulers, and coaches.
//
// What it turns into later:
// Admin-managed role grants, revocations, and possibly audit history.
//
// Signal to evolve it:
// When adding or removing staff starts requiring frequent env edits, or when
// you need time-based / reviewable role changes, env bootstrap has done its job
// and should retire with dignity.
//
// If ignored:
// The repo slowly becomes a feudal society of environment variables where no
// one quite remembers who knighted whom.
//
// Footnote:
// This is where the city clerk checks whether your surname appears on the list
// of people who may carry official keys. It is not glamorous, but it decides
// who gets to wander into the archive after hours and mutter at the shelving.
function getBootstrapRolesForEmail(email: string): AppRole[] {
  const normalizedEmail = normalizeEmail(email);
  const roles = new Set<AppRole>();

  if (parseEmailList(process.env.HGO_OWNER_EMAILS).includes(normalizedEmail)) {
    roles.add("OWNER");
  }

  if (
    parseEmailList(process.env.HGO_TEAM_SCHEDULER_EMAILS).includes(
      normalizedEmail,
    )
  ) {
    roles.add("TEAM_SCHEDULER");
  }

  if (parseEmailList(process.env.HGO_COACH_EMAILS).includes(normalizedEmail)) {
    roles.add("COACH");
  }

  return [...roles];
}

// This is the narrow bridge from raw Prisma record to app identity.
// Notice that "isStaff" is derived, not stored. That keeps the source of truth
// with roles and makes the convenience field easy to recompute.
//
// Best practice (the "textbook" version):
// Derived booleans should usually stay derived unless query performance or
// historical reporting genuinely demands denormalization.
//
// What we are doing instead (and why):
// Derive `isStaff` every time from roles. The cost is trivial and the truth
// stays in one place.
function mapIdentity(user: UserIdentityRecord): AppUserIdentity {
  const roles = user.roles.map((entry) => entry.role);

  return {
    id: user.id,
    primaryEmail: user.primaryEmail,
    name: user.name,
    image: user.image,
    roles,
    isStaff: canAccessInternalContent(roles),
    newsletterOptIn: user.newsletterOptIn,
    announcementsOptIn: user.announcementsOptIn,
    welcomeCompletedAt: user.welcomeCompletedAt,
  };
}

// What this does:
// Resolves a human by either their canonical email or any alias email linked to
// the same user record.
//
// Why this matters:
// Humans are untidy. They arrive with old addresses, alternate addresses,
// forwarded addresses, and the occasional cursed relic from a former employer.
// The app still needs one canonical person at the end of the tunnel.
//
// Best practice (the "textbook" version):
// Identity resolution often grows into a distinct domain service with merge
// rules, conflict handling, and provenance.
//
// What we are doing instead (and why):
// A single query path over primary and alias emails. Right-sized for the
// current system, and vastly better than pretending aliases do not exist.
//
// Future complexity wearing a fake mustache:
// "I am just email lookup." Later it becomes "identity resolution across
// multiple auth methods, contact records, aliases, and perhaps explicit merge
// histories." Same hallway. More doors.
async function findUserRecordByEmail(
  email: string,
): Promise<UserIdentityRecord | null> {
  const normalizedEmail = normalizeEmail(email);

  return prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: normalizedEmail },
        {
          aliases: {
            some: {
              email: normalizedEmail,
            },
          },
        },
      ],
    },
    include: userIdentityInclude,
  });
}

export async function getAppUserIdentityByEmail(
  email: string,
): Promise<AppUserIdentity | null> {
  // Right now, this is a direct read helper.
  // In a more mature system, this might layer caching, richer provenance, or a
  // clearer separation between "lookup" and "projection."
  const user = await findUserRecordByEmail(email);
  return user ? mapIdentity(user) : null;
}

// What this does:
// Ensures a Google-authenticated human maps onto exactly one local User record,
// then returns the normalized app identity for that person.
//
// Why this matters:
// This is the hinge between outside identity proof and inside product truth.
// If this logic is sloppy, you get duplicate users, drifting names, and roles
// attached to the wrong poor soul.
//
// Beware:
// The transaction is doing real work here. We are reading, possibly attaching
// missing roles, and then updating or creating the user as one coherent unit.
// That is not overkill. That is how you avoid the sort of split-brain records
// that later require a priest, a DBA, and three cups of tea.
//
// Best practice (the "textbook" version):
// Provider-agnostic identity linking with explicit auth-method tables and
// idempotent provisioning semantics.
//
// What we are doing instead (and why):
// A focused Google-specific bridge because Google is the only human auth path
// today, and the repo is better served by one honest adapter than by a shrine
// to hypothetical providers.
//
// Tradeoff:
// We gain clarity right now.
// We incur a rename/refactor cost later when the second human auth method
// arrives. That is acceptable, because paying a small real cost later is often
// better than paying a large imaginary cost now.
//
// What it looks like now:
// "Google user showed up; make sure our local User exists and is current."
//
// What it turns into later:
// A generic "ensure canonical human identity from auth method X" flow where
// Google is just one adapter beside magic links or other providers.
//
// Signal to evolve it:
// The second auth method. Not the fifth. The second. That is the moment to stop
// naming core identity orchestration after a single provider.
export async function ensureAppUserFromGoogle(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<AppUserIdentity> {
  const normalizedEmail = normalizeEmail(input.email);
  const bootstrapRoles = getBootstrapRolesForEmail(normalizedEmail);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { primaryEmail: normalizedEmail },
          {
            aliases: {
              some: {
                email: normalizedEmail,
              },
            },
          },
        ],
      },
      include: userIdentityInclude,
    });

    // Existing user path:
    // If the email already exists as a primary or alias address, we extend the
    // existing person rather than creating a second one with the same face and
    // a different filing drawer.
    //
    // Failure lens:
    // Duplicate-user bugs usually begin as tiny acts of optimism around
    // identity matching. The system says, "Surely this is new," and six months
    // later someone has two histories and one headache.
    if (existing) {
      const missingRoles = bootstrapRoles.filter(
        (role) => !existing.roles.some((entry) => entry.role === role),
      );

      if (missingRoles.length > 0) {
        await tx.userRole.createMany({
          data: missingRoles.map((role) => ({
            userId: existing.id,
            role,
          })),
          skipDuplicates: true,
        });
      }

      // We treat provider-sourced name/image as profile refresh material, not
      // as sovereign truth over everything else in the app.
      //
      // Question for Future Charlie:
      // Why not let Google overwrite everything every time?
      //
      // Answer:
      // Because provider data is useful, not infallible. The app may eventually
      // let humans curate their own profile semantics. A passport office is not
      // the final authority on your haircut.
      return tx.user.update({
        where: { id: existing.id },
        data: {
          name: input.name?.trim() || existing.name,
          image: input.image || existing.image,
        },
        include: userIdentityInclude,
      });
    }

    // New user path:
    // Create the local human record the rest of the app understands. This is
    // where a verified external identity becomes a first-class citizen in the
    // municipal registry of consequences.
    return tx.user.create({
      data: {
        primaryEmail: normalizedEmail,
        name: input.name?.trim() || null,
        image: input.image || null,
        roles:
          bootstrapRoles.length > 0
            ? {
                create: bootstrapRoles.map((role) => ({ role })),
              }
            : undefined,
      },
      include: userIdentityInclude,
    });
  });

  return mapIdentity(user);
}

// What this does:
// Preprovisions or updates a human directly from app-side admin workflows
// rather than from a live OAuth callback.
//
// Why this matters:
// Not every identity enters the castle through the same gate. Sometimes the
// team needs to prepare a record, assign roles, attach aliases, or create a
// client profile before the human ever logs in.
//
// Best practice (the "textbook" version):
// Separate explicit admin workflows for provisioning, role grants, consent, and
// profile setup, each with audit logs.
//
// What we are doing instead (and why):
// One practical upsert path that covers the repo's real internal workflow
// without pretending we already run a Ministry of Identity.
//
// Tradeoff:
// We gain speed and one obvious tool.
// We sacrifice finer-grained auditability and clearer administrative intent.
//
// Future Chuck note:
// This is another reason provider identity and app identity must stay
// separate. Humans can exist in the app before, after, or entirely beside a
// specific auth provider.
//
// Future complexity wearing a fake mustache:
// "I am just an internal helper." Later this becomes part of a broader identity
// admin surface where humans, aliases, roles, and client scaffolding all need
// explicit workflows.
export async function upsertPreprovisionedUser(
  input: PreprovisionedUserInput,
): Promise<AppUserIdentity> {
  const primaryEmail = normalizeEmail(input.primaryEmail);
  const aliasEmails = normalizeAliasEmails(input.aliasEmails).filter(
    (email) => email !== primaryEmail,
  );
  const roles = uniqueRoles([
    ...(input.roles ?? []),
    ...getBootstrapRolesForEmail(primaryEmail),
  ]);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { primaryEmail },
          {
            aliases: {
              some: {
                email: primaryEmail,
              },
            },
          },
        ],
      },
      include: userIdentityInclude,
    });

    if (existing) {
      // If the requested primary email is already someone else's alias, we stop.
      // That prevents the classic "one person accidentally claims another
      // person's side door" disaster.
      //
      // If ignored:
      // You eventually discover two humans wrestling over one email trail while
      // the Auditors take notes and prepare indictments.
      if (existing.primaryEmail !== primaryEmail) {
        throw new Error(
          `The email "${primaryEmail}" is already linked to another user as an alias.`,
        );
      }

      // Role and alias creation are additive on purpose. We are enriching the
      // existing person record, not replacing it with a fresh manuscript every
      // time someone opens the folder.
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: existing.id,
            role,
          })),
          skipDuplicates: true,
        });
      }

      if (aliasEmails.length > 0) {
        await tx.userEmail.createMany({
          data: aliasEmails.map((email) => ({
            userId: existing.id,
            email,
          })),
          skipDuplicates: true,
        });
      }

      // This update is the app-side "truth maintenance" step: name, marketing
      // preferences, and optional client profile scaffolding all belong to the
      // canonical user record, not to whichever auth method happened to knock
      // most recently.
      return tx.user.update({
        where: { id: existing.id },
        data: {
          name: input.name?.trim() || existing.name,
          newsletterOptIn:
            input.newsletterOptIn ?? existing.newsletterOptIn,
          announcementsOptIn:
            input.announcementsOptIn ?? existing.announcementsOptIn,
          clientProfile: input.createClientProfile
            ? {
                upsert: {
                  create: {
                    displayName: input.name?.trim() || existing.name || null,
                  },
                  update: {},
                },
              }
            : undefined,
        },
        include: userIdentityInclude,
      });
    }

    // New preprovisioned human:
    // Same identity model, different entry ritual. No Google callback needed.
    return tx.user.create({
      data: {
        primaryEmail,
        name: input.name?.trim() || null,
        newsletterOptIn: input.newsletterOptIn ?? false,
        announcementsOptIn: input.announcementsOptIn ?? false,
        roles:
          roles.length > 0
            ? {
                create: roles.map((role) => ({ role })),
              }
            : undefined,
        aliases:
          aliasEmails.length > 0
            ? {
                create: aliasEmails.map((email) => ({ email })),
              }
            : undefined,
        clientProfile: input.createClientProfile
          ? {
              create: {
                displayName: input.name?.trim() || null,
              },
            }
          : undefined,
      },
      include: userIdentityInclude,
    });
  });

  return mapIdentity(user);
}
