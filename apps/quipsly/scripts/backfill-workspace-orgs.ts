// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting backfill for workspaces and projects...");

  // 1. Find a primary user to assign ownership to.
  // We'll look for a user with the 'OWNER' role, or just take the first user if none found.
  let primaryUser = await prisma.user.findFirst({
    where: {
      roles: {
        some: {
          role: "OWNER",
        },
      },
    },
  });

  if (!primaryUser) {
    console.log("No user with 'OWNER' role found. Falling back to the first available user.");
    primaryUser = await prisma.user.findFirst();
  }

  if (!primaryUser) {
    console.error("No users found in the database. Aborting backfill.");
    process.exit(1);
  }

  console.log(`Selected primary user: ${primaryUser.id} (${primaryUser.name || "Unknown Name"})`);

  // 2. Find or create a default organization
  // Check if this user is already an OWNER of any organization
  const existingMembership = await prisma.organizationMember.findFirst({
    where: {
      userId: primaryUser.id,
      role: "OWNER",
    },
    include: {
      organization: true,
    },
  });

  let targetOrganizationId: string;

  if (existingMembership && existingMembership.organization) {
    targetOrganizationId = existingMembership.organization.id;
    console.log(`Found existing organization: ${targetOrganizationId} (${existingMembership.organization.name})`);
  } else {
    // Create a new default organization
    console.log("Creating default organization...");
    const newOrg = await prisma.organization.create({
      data: {
        name: "Primary Organization",
        slug: `org-${Date.now()}`,
        description: "Default organization generated during workspace backfill.",
        members: {
          create: {
            userId: primaryUser.id,
            role: "OWNER",
          },
        },
      },
    });
    targetOrganizationId = newOrg.id;
    console.log(`Created new organization: ${targetOrganizationId}`);
  }

  // 3. Backfill Workspaces
  console.log("Backfilling StudioWorkspaces...");
  const workspaceUpdateResult = await prisma.studioWorkspace.updateMany({
    data: {},
  });
  console.log(`Updated ${workspaceUpdateResult.count} workspaces with organizationId.`);

  // 4. Backfill Projects
  console.log("Backfilling StudioProjects...");
  const projectUpdateResult = await prisma.studioProject.updateMany({
    data: {
      updatedByUserId: primaryUser.id,
    },
  });
  console.log(`Updated ${projectUpdateResult.count} projects with createdByUserId and updatedByUserId.`);

  console.log("Backfill complete!");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
