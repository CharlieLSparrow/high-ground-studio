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
  const projectSlug = 'charlie-nest';

  // 1. Clean up previously created document
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug }
  });
  
  if (project) {
    const existingDocs = await prisma.studioDocument.findMany({
      where: { projectId: project.id, title: "Learning to Lead - High Ground Odyssey" }
    });
    for (const doc of existingDocs) {
      console.log(`Deleting previous document ${doc.id}`);
      await prisma.studioDocumentBlock.deleteMany({ where: { documentId: doc.id } });
      await prisma.studioDocument.delete({ where: { id: doc.id } });
    }
  }

  // 2. Create Document again
  const documentTitle = "Learning to Lead - High Ground Odyssey";
  const stableId = `doc-${projectSlug}-book-${Date.now()}`;
  const document = await prisma.studioDocument.create({
    data: {
      projectId: project!.id,
      stableId,
      title: documentTitle,
    }
  });

  // 3. Parse Book
  const basePath = path.join(__dirname, 'apps/web/content/_inbox/HighGroundOdysseyBook/Two Sparrows/Books/Learning to Lead');
  
  let order = 0;
  for (const chapterName of CHAPTER_ORDER) {
    const dirPath = path.join(basePath, chapterName);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const mdFile = files.find(f => f.endsWith('.md'));
      
      if (mdFile) {
        console.log(`Importing: ${chapterName} (${mdFile})`);
        const body = fs.readFileSync(path.join(dirPath, mdFile), 'utf8');
        
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
        console.warn(`WARNING: No .md file found in ${dirPath}`);
      }
    } else {
      console.warn(`WARNING: Could not find directory ${dirPath}`);
    }
  }

  console.log("Import complete!");
}

main()
  .catch(console.error)
