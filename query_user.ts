import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { primaryEmail: { contains: 'charlie' } }
  });
  console.log("Users:", users);

  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: { email: { contains: 'charlie' } },
    include: { project: true }
  });
  console.log("Grants:", grants);
  
  const projects = await prisma.studioProject.findMany();
  console.log("Projects:", projects.map(p => p.slug));
}
main().catch(console.error).finally(() => prisma.$disconnect())
