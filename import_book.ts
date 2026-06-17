import { getPrismaClient } from './apps/quipsly/src/lib/prisma';
import fs from 'fs';
import path from 'path';

const prisma = getPrismaClient();

const CHAPTER_ORDER = [
  "Forward",
  "Preface",
  "Introduction",
  "Chapter Zero In The Beginning",
  "Chapter One The Early Days",
  "Chapter Two Values Get Some",
  "Chapter Three In the Army Now",
  "Chapter Four None of it Works Unless You Do",
  "Chapter Four.Five It doesn’t hurt to get lucky",
  "Chapter Five Leaders Make It Happen",
  "Chapter Six Individuals make a team",
  "Chapter Seven Risk",
  "Chapter Eight The team needs",
  "Chapter Nine Learn",
  "Chapter Ten Do What's Important and Leave a Legacy",
  "Chapter Eleven Care",
  "Chapter Twelve Don’t Forget to Enjoy It",
  "Outtro"
];

async function main() {
  const email = 'charlie@highgroundodyssey.com';
  
  // 1. Ensure user exists
  let user = await prisma.user.findUnique({ where: { primaryEmail: email } });
  if (!user) {
    console.log(`User ${email} not found. Creating...`);
    user = await prisma.user.create({
      data: {
        primaryEmail: email,
        name: 'Charlie',
      }
    });
  }

  // 2. Ensure workspace exists
  let workspace = await prisma.studioWorkspace.findFirst();
  if (!workspace) {
    workspace = await prisma.studioWorkspace.create({
      data: {
        slug: 'default-workspace',
        name: 'Default Workspace'
      }
    });
  }

  // 3. Ensure Project (Nest) exists
  const projectSlug = 'charlie-nest';
  let project = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: projectSlug } }
  });
  if (!project) {
    console.log(`Creating StudioProject ${projectSlug}...`);
    project = await prisma.studioProject.create({
      data: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: "Charlie's Nest",
      }
    });
  }

  // 4. Ensure Access Grant
  const grant = await prisma.studioProjectAccessGrant.findUnique({
    where: { projectId_email: { projectId: project.id, email } }
  });
  if (!grant) {
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId: project.id,
        email,
        role: 'OWNER'
      }
    });
  }

  // 5. Create Document
  const documentTitle = "Learning to Lead - High Ground Odyssey";
  const stableId = `doc-${projectSlug}-book-${Date.now()}`;
  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId,
      title: documentTitle,
    }
  });

  // 6. Parse Book
  const basePath = path.join(__dirname, 'apps/web/content/_inbox/HighGroundOdysseyBook/Two Sparrows/Books/Learning to Lead');
  
  let order = 0;
  for (const chapterName of CHAPTER_ORDER) {
    const chapterPath = path.join(basePath, chapterName, 'Rough Draft.md');
    if (fs.existsSync(chapterPath)) {
      console.log(`Importing: ${chapterName}`);
      const body = fs.readFileSync(chapterPath, 'utf8');
      
      await prisma.studioDocumentBlock.create({
        data: {
          documentId: document.id,
          stableId: `${stableId}-block-${order}`,
          order,
          title: chapterName,
          body
        }
      });
      order++;
    } else {
      console.warn(`WARNING: Could not find ${chapterPath}`);
    }
  }

  console.log("Import complete!");
}

main()
  .catch(console.error)
