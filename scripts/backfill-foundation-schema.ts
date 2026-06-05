import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  console.log("Starting backfill for foundation schema...");

  // 1. Backfill StudioWorkspace.organizationId
  const workspaces = await prisma.studioWorkspace.findMany({
    where: { organizationId: null }
  });

  if (workspaces.length > 0) {
    console.log(`Found ${workspaces.length} workspaces without an organization.`);
    
    // Find or create a default organization for legacy workspaces
    let legacyOrg = await prisma.organization.findFirst({
      where: { slug: 'legacy-org' }
    });

    if (!legacyOrg) {
      legacyOrg = await prisma.organization.create({
        data: {
          name: 'Legacy Organization',
          slug: 'legacy-org',
          description: 'Default organization created during foundation backfill',
        }
      });
      console.log(`Created default organization: ${legacyOrg.name} (${legacyOrg.id})`);
    }

    // Update all matching workspaces
    const updateCount = await prisma.studioWorkspace.updateMany({
      where: { organizationId: null },
      data: { organizationId: legacyOrg.id }
    });
    
    console.log(`Successfully backfilled ${updateCount.count} workspaces.`);
  } else {
    console.log("No workspaces found missing an organizationId.");
  }

  // 2. Backfill StudioProject.createdByUserId
  const projects = await prisma.studioProject.findMany({
    where: { createdByUserId: null }
  });

  if (projects.length > 0) {
    console.log(`Found ${projects.length} projects without a createdByUserId.`);
    console.log("Skipping StudioProject user backfill: historical data can safely remain null for optional audit fields.");
  } else {
    console.log("No projects found missing a createdByUserId.");
  }

  console.log("Backfill complete.");
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
