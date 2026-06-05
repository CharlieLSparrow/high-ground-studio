import { getPrismaClient } from '../apps/quipsly/src/lib/prisma';

const prisma = getPrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log(`Starting foundation schema data backfill... ${isDryRun ? '(DRY RUN)' : ''}`);

  // 1. Identify the primary local user (the first user created)
  const primaryUser = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!primaryUser) {
    console.log('No users found in the database. Nothing to backfill.');
    return;
  }

  console.log(`Found primary user: ${primaryUser.primaryEmail} (${primaryUser.id})`);

  // 2. Ensure an Organization exists for this user
  let organizationId: string;

  const existingMember = await prisma.organizationMember.findFirst({
    where: { userId: primaryUser.id },
  });

  if (existingMember) {
    organizationId = existingMember.organizationId;
    console.log(`User already belongs to organization: ${organizationId}`);
  } else {
    // Check if any organization exists, else create one
    let defaultOrg = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!defaultOrg) {
      console.log('Creating default organization...');
      if (!isDryRun) {
        defaultOrg = await prisma.organization.create({
          data: {
            name: 'High Ground Studio',
            slug: 'high-ground-studio',
            description: 'Default organization generated during migration',
          },
        });
      } else {
        defaultOrg = { id: 'dry-run-org-id', slug: 'high-ground-studio' } as any;
      }
    }

    organizationId = defaultOrg!.id;

    console.log(`Adding primary user to organization: ${organizationId}`);
    if (!isDryRun) {
      await prisma.organizationMember.create({
        data: {
          organizationId: defaultOrg!.id,
          userId: primaryUser.id,
        },
      });
    }
  }

  // 3. Backfill orphaned Workspaces
  const orphanedWorkspaces = await prisma.studioWorkspace.findMany({
    where: { organizationId: null },
  });

  console.log(`Found ${orphanedWorkspaces.length} orphaned workspaces.`);
  
  if (orphanedWorkspaces.length > 0) {
    if (isDryRun) {
      console.log(`[DRY RUN] Would update ${orphanedWorkspaces.length} workspaces to organization ${organizationId}.`);
    } else {
      const updatedWorkspaces = await prisma.studioWorkspace.updateMany({
        where: { organizationId: null },
        data: { organizationId },
      });
      console.log(`Updated ${updatedWorkspaces.count} workspaces to organization ${organizationId}.`);
    }
  }

  // 4. Backfill orphaned Projects
  const orphanedProjects = await prisma.studioProject.findMany({
    where: { createdByUserId: null },
  });

  console.log(`Found ${orphanedProjects.length} orphaned projects.`);

  if (orphanedProjects.length > 0) {
    if (isDryRun) {
      console.log(`[DRY RUN] Would update ${orphanedProjects.length} projects to be owned by user ${primaryUser.id}.`);
    } else {
      const updatedProjects = await prisma.studioProject.updateMany({
        where: { createdByUserId: null },
        data: { 
          createdByUserId: primaryUser.id,
          updatedByUserId: primaryUser.id,
        },
      });
      console.log(`Updated ${updatedProjects.count} projects to be owned by user ${primaryUser.id}.`);
    }
  }

  console.log('Backfill complete!');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
