import "server-only";
import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_BETA_PATREON_PLAN_SLUG } from "@/lib/patreon/betaAccess";
import { hasAnyActiveStudioProjectAccessGrantForEmail } from "@/lib/server/studio-project-access";
import { getStudioUserIdentityByEmail } from "./studio-user-identity";

/**
 * Validates if the given email has access to the Quipsly Beta.
 * Currently grants access to:
 * 1. Studio Staff (Admins, Owners, Coaches)
 * 2. Anyone explicitly invited to at least one StudioProject/Nest
 * 3. Anyone with an ACTIVE Quipsly beta Patreon membership in the database
 */
export async function hasQuipslyBetaAccess(email: string): Promise<boolean> {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check Staff Status
  try {
    const studioUser = await getStudioUserIdentityByEmail(normalizedEmail);
    if (studioUser?.isStaff) {
      return true;
    }
  } catch (error) {
    console.error("[Authz] Failed to check studio user identity", error);
  }

  // 2. Check direct Nest/project invitation by email. This supports inviting
  // people before their User row exists.
  try {
    const prisma = getPrismaClient();
    if (await hasAnyActiveStudioProjectAccessGrantForEmail(normalizedEmail, prisma)) {
      return true;
    }
  } catch (error) {
    console.error("[Authz] Failed to check project access grants", error);
  }

  // 3. Check Active Memberships
  try {
    const prisma = getPrismaClient();
    const now = new Date();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: normalizedEmail },
          { aliases: { some: { email: normalizedEmail } } }
        ]
      },
      include: {
        memberships: {
          where: {
            status: "ACTIVE",
            OR: [
              { endsAt: null },
              { endsAt: { gt: now } },
            ],
            plan: {
              slug: QUIPSLY_BETA_PATREON_PLAN_SLUG,
              isActive: true,
            },
          },
          include: {
            plan: true,
          },
        }
      }
    });

    if (user && user.memberships.length > 0) {
      return true;
    }
  } catch (error) {
    console.error("[Authz] Failed to check active memberships", error);
  }

  return false;
}
