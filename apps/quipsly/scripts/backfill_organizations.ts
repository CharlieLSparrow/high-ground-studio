// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillOrganizations() {
  console.log('Starting backfill for StudioWorkspace and StudioProject...');

  const workspaces = await prisma.studioWorkspace.findMany({
    where: {},
    include: {
      projects: {
        include: {
          manuscript: true,
        },
      },
    },
  });

  console.log(`Found ${workspaces.length} workspaces requiring backfill.`);

  for (const workspace of workspaces) {
    console.log(`\nProcessing Workspace: ${workspace.slug} (${workspace.id})`);
    
    // Find the primary owner email from the first project's manuscript
    let ownerEmail: string | null = null;
    for (const project of (workspace as any).projects) {
      if (project.manuscript?.ownerEmail) {
        ownerEmail = project.manuscript.ownerEmail;
        break;
      }
    }

    if (!ownerEmail) {
      console.warn(`[SKIP] No ownerEmail found for workspace ${workspace.slug} across its projects. Manual intervention required.`);
      continue;
    }

    // Find the user associated with this email
    const user = await prisma.user.findUnique({
      where: { primaryEmail: ownerEmail },
    });

    if (!user) {
      console.warn(`[SKIP] No User found for email ${ownerEmail}.`);
      continue;
    }

    // Find or create an Organization for this user
    // We'll look for an organization named after the user or their workspace
    let organization = await prisma.organization.findFirst({
      where: {
        members: {
          some: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
    });

    if (!organization) {
      console.log(`Creating new Organization for ${ownerEmail}...`);
      organization = await prisma.organization.create({
        data: {
          name: `${user.name || ownerEmail.split('@')[0]}'s Organization`,
          slug: `org-${user.id.substring(0, 8).toLowerCase()}`,
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
            },
          },
        },
      });
    } else {
      console.log(`Found existing Organization ${organization.slug} for ${ownerEmail}.`);
    }

    // Update the workspace with the organizationId
    await prisma.studioWorkspace.update({
      where: { id: workspace.id },
      data: {
        organizationId: organization.id,
      },
    });
    console.log(`[SUCCESS] Linked Workspace ${workspace.slug} to Organization ${organization.slug}.`);

    // Update all projects within this workspace with the createdByUserId
    const projectUpdates = (workspace as any).projects.map((project: any) =>
      prisma.studioProject.update({
        where: { id: project.id },
        data: {
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      })
    );

    await Promise.all(projectUpdates);
    console.log(`[SUCCESS] Backfilled createdBy/updatedBy on ${projectUpdates.length} projects.`);
  }

  console.log('\nBackfill complete.');
  await prisma.$disconnect();
}

backfillOrganizations().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
