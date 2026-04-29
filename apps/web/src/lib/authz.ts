import type { AppRole } from "@prisma/client";

// What this file does:
// This is the authorization rulebook: given a set of roles, what rooms may the
// user enter?
//
// Why this matters:
// Authentication answers "who are you?" Authorization answers "what are you
// allowed to touch once we know who you are?" Mixing them up is how you end up
// handing the janitor the dragon keys because he had excellent handwriting.
//
// Best practice (the "textbook" version):
// A mature system often moves from role checks to richer policy evaluation:
// permissions, ownership, context, audit, and maybe temporary grants.
//
// What we are doing instead (and why):
// A compact role-check layer. This repo is still small enough that simple named
// helpers are clearer than a policy engine with eight brass levers and a manual.
//
// Tradeoff:
// We gain directness and low cognitive load.
// We sacrifice granularity once rules stop being mostly role-shaped.
//
// Question for Future Charlie:
// Is `canManageClients` "too simple" right now?
//
// Answer:
// No. Simplicity is not a sin when it matches the real problem. It becomes a
// problem only when the rule stops being true and the code keeps pretending.
//
// What it looks like now:
// Small role-check helpers over a small set of roles.
//
// What it turns into later:
// More explicit policy decisions, possibly capability-based checks, once the
// app grows beyond "staff can do most internal things."
//
// Signal to evolve it:
// If helpers start multiplying into near-duplicates with tiny exceptions, or
// if business rules begin to mention resource ownership and context, the
// mustached intruder is named "policy layer" and should be invited in properly.
//
// Footnote:
// Being in the building is not the same as being allowed into the weird room
// downstairs where the internal tools hum quietly and smell faintly of coffee,
// responsibility, and old calendar integrations.
export const TEAM_ROLES: readonly AppRole[] = [
  "OWNER",
  "TEAM_SCHEDULER",
  "COACH",
];

// The tiniest badge check: does this list contain this exact role?
// Right now, this is as boring as toast. That is good.
// In a more mature system, this might remain as a primitive under richer policy
// composition. The tiny helpers are not the enemy. The confusion is.
export function hasRole(
  roles: AppRole[] | undefined | null,
  role: AppRole,
): boolean {
  return Array.isArray(roles) && roles.includes(role);
}

// Utility for "any of these badges opens this door."
export function hasAnyRole(
  roles: AppRole[] | undefined | null,
  expected: readonly AppRole[],
): boolean {
  return Array.isArray(roles) && expected.some((role) => roles.includes(role));
}

// Internal content is staff-only territory.
//
// Best practice (the "textbook" version):
// Separate policy decisions from presentation/layout concerns.
//
// What we are doing instead (and why):
// A small exported helper that both server code and layouts can share without a
// policy framework. Right-sized for a repo where "internal vs public" is still
// a major seam.
export function canAccessInternalContent(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, TEAM_ROLES);
}

// Right now clients, appointments, and general internal content all share the
// same staff gate. That is intentionally simple, not magically permanent.
// The fake mustache here is "all staff powers are basically the same."
// That disguise fails the moment one staff role needs meaningful limits on
// one area but not another.
//
// First assumption that breaks:
// "All trusted staff need basically the same internal powers."
export function canManageClients(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, TEAM_ROLES);
}

export function canManageAppointments(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, TEAM_ROLES);
}

// Membership management is slightly narrower: not every staff role gets this
// key. This is a small example of why authz is its own layer instead of being
// shoved into the sign-in callback with a broom.
//
// Scale lens:
// If this file starts reading like a list of exceptions carved into a tavern
// door, it is time to graduate into more explicit policy composition.
export function canManageMemberships(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, ["OWNER", "TEAM_SCHEDULER"]);
}
