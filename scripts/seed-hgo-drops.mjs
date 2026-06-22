import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const dropsPath = path.join(process.cwd(), 'content', 'hgo-daily-drops.json');
  const dropsData = JSON.parse(fs.readFileSync(dropsPath, 'utf-8'));

  console.log(`Read ${dropsData.length} drops from file.`);

  // We need a StudioProject to attach these to. Let's find or create 'high-ground-odyssey'.
  let project = await prisma.studioProject.findFirst({
    where: { slug: 'high-ground-odyssey' }
  });

  if (!project) {
    // Need an org first
    const org = await prisma.organization.findFirst();
    if (!org) {
       console.log('No organization found. Cannot seed.');
       return;
    }

    project = await prisma.studioProject.create({
      data: {
        organizationId: org.id,
        name: 'High Ground Odyssey',
        slug: 'high-ground-odyssey',
        description: 'Daily philosophical drops and lore.'
      }
    });
    console.log('Created project: high-ground-odyssey');
  }

  let createdCount = 0;

  for (const drop of dropsData) {
    await prisma.studioOutputPacket.upsert({
      where: {
        projectId_slug: {
          projectId: project.id,
          slug: drop.slug
        }
      },
      update: {
        title: drop.title,
        packetJson: JSON.parse(drop.packetJson),
        status: drop.status,
        publishAt: new Date(drop.publishAt)
      },
      create: {
        projectId: project.id,
        slug: drop.slug,
        kind: drop.kind,
        title: drop.title,
        status: drop.status,
        packetJson: JSON.parse(drop.packetJson),
        publishAt: new Date(drop.publishAt)
      }
    });
    createdCount++;
  }

  console.log(`Successfully seeded ${createdCount} Output Packets.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
