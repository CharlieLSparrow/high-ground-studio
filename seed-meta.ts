import { getPrismaClient } from "./apps/quipsly/src/lib/prisma";

const prisma = getPrismaClient() as any;

async function main() {
  console.log("Seeding Quipsly Meta project...");

  // 1. Create or find the workspace
  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: "quipsly-internal" },
    update: {},
    create: {
      slug: "quipsly-internal",
      name: "Quipsly Internal",
      description: "Workspace for Quipsly team",
      isPrivate: true,
    },
  });

  console.log(`Workspace created/found: ${workspace.name}`);

  // 2. Create or find the project
  const project = await prisma.studioProject.upsert({
    where: { id: "quipsly-meta" },
    update: {
      slug: "quipsly-meta", // ensure slug is set even if we match by id
    },
    create: {
      id: "quipsly-meta",
      workspaceId: workspace.id,
      slug: "quipsly-meta",
      name: "Quipsly Meta",
      description: "Using Quipsly to build Quipsly",
      isPrivate: true,
    },
  });

  console.log(`Project created/found: ${project.name}`);

  // 3. Define the team
  const team = [
    { name: "Charlie", email: "charlie@quipsly.com" },
    { name: "Homer", email: "homer@quipsly.com" },
    { name: "Melissa", email: "melissa@quipsly.com" },
    { name: "Mako", email: "mako@quipsly.com" },
    { name: "Jecca", email: "jecca@quipsly.com" },
  ];

  for (const member of team) {
    // 3a. Upsert user
    const user = await prisma.user.upsert({
      where: { primaryEmail: member.email },
      update: { name: member.name },
      create: {
        primaryEmail: member.email,
        name: member.name,
        isActive: true,
      },
    });

    console.log(`User created/updated: ${user.name}`);

    // 3b. Upsert access grant
    await prisma.studioProjectAccessGrant.upsert({
      where: {
        projectId_email: {
          projectId: project.id,
          email: member.email,
        },
      },
      update: { role: "EDITOR" },
      create: {
        projectId: project.id,
        email: member.email,
        role: "EDITOR",
        status: "ACTIVE",
      },
    });

    console.log(`Access granted to ${user.name}`);
  }

  console.log("Seeding complete! You can now navigate to /nests/quipsly-meta/workspace");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
