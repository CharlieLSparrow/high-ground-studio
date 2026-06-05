import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting workspace backfill...');
  
  // Find workspaces without an organization
  const orphanedWorkspaces = await prisma.studioWorkspace.findMany({
    where: { organizationId: null }
  });

  console.log(`Found ${orphanedWorkspaces.length} workspaces requiring backfill.`);

  if (orphanedWorkspaces.length === 0) {
    console.log('No workspaces to backfill. Exiting.');
    return;
  }

  // Get or create a default organization for orphaned projects
  let defaultOrg = await prisma.organization.findUnique({
    where: { slug: 'quipsly-default' }
  });

  if (!defaultOrg) {
    console.log('Creating default organization...');
    defaultOrg = await prisma.organization.create({
      data: {
        name: 'Quipsly Default',
        slug: 'quipsly-default',
        description: 'Default organization created during backfill for legacy workspaces.'
      }
    });
  }

  // Update workspaces
  let updatedCount = 0;
  for (const workspace of orphanedWorkspaces) {
    await prisma.studioWorkspace.update({
      where: { id: workspace.id },
      data: { organizationId: defaultOrg.id }
    });
    updatedCount++;
    console.log(`Updated workspace: ${workspace.slug} (${workspace.id}) -> org: ${defaultOrg.slug}`);
  }

  console.log(`Backfill complete. Updated ${updatedCount} workspaces.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
