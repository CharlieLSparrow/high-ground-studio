import "server-only";
import { getPrismaClient } from "@/lib/prisma";
import { getStudioUserIdentityByEmail } from "./studio-user-identity";

/**
 * Validates if the given email has access to the Quipsly Beta.
 * Currently grants access to:
 * 1. Studio Staff (Admins, Owners, Coaches)
 * 2. Anyone with an ACTIVE membership in the database (synced from Patreon)
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

  // 2. Check Active Memberships
  try {
    const prisma = getPrismaClient();
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
            status: "ACTIVE"
          }
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
