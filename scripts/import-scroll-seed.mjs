import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const issueDir = path.join(
  repoRoot,
  "content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design"
);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function ownerWorkspaceSlug(ownerEmail) {
  return `${normalizeEmail(ownerEmail).replace(/[^a-z0-9]+/g, "-")}-workspace`;
}

async function readJson(fileName) {
  try {
    const raw = await fs.readFile(path.join(issueDir, fileName), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read ${fileName}: ${err.message}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Skipping real DB connection and returning mock output for testing.");
    console.log("Mocking successful Scroll Experience seed injection.");
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
    log: ["error"],
  });

  try {
    const scrollSeed = await readJson("scroll-seed.json");
    if (scrollSeed.kind !== "vertical-scroll-experience-seed") {
      throw new Error("Invalid seed kind. Expected vertical-scroll-experience-seed.");
    }

    const ownerEmail = scrollSeed.access?.ownerEmail || "CharlieLSparrow@gmail.com";
    const workspaceSlug = ownerWorkspaceSlug(ownerEmail);
    const projectSlug = scrollSeed.projectSlug || "charlie-melissa-fiction-lab";

    // 1. Resolve Workspace and Project
    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: workspaceSlug },
      update: {},
      create: {
        slug: workspaceSlug,
        name: "Charlie L. Sparrow - Fiction Nest",
        ownerLabel: ownerEmail,
        isPrivate: true,
      },
    });

    const project = await prisma.studioProject.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: projectSlug,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: "My Heart Is a Junkyard Starship",
        description: "Private comic and fiction development nest.",
        sourceLabel: "nest-kind:fiction",
        isPrivate: true,
      },
    });

    // 2. Resolve Storyboard (Optional link if it exists from import-comic-storyboard.mjs)
    let storyboardId = null;
    const storyboard = await prisma.studioStoryboard.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    });
    if (storyboard) {
      storyboardId = storyboard.id;
    }

    // 3. Upsert Scroll Experience
    const experienceSlug = scrollSeed.issueSlug || "scroll-experience";
    let experience = await prisma.studioScrollExperience.findFirst({
      where: { projectId: project.id, slug: experienceSlug }
    });

    if (!experience) {
      experience = await prisma.studioScrollExperience.create({
        data: {
          projectId: project.id,
          storyboardId,
          slug: experienceSlug,
          title: scrollSeed.experience.title || "Untitled Scroll",
          layout: scrollSeed.experience.layout || "vertical comic",
        }
      });
    } else {
      experience = await prisma.studioScrollExperience.update({
        where: { id: experience.id },
        data: {
          storyboardId,
          title: scrollSeed.experience.title,
          layout: scrollSeed.experience.layout,
        }
      });
      // Clear out old sections for an idempotent rebuild
      await prisma.studioScrollSection.deleteMany({
        where: { experienceId: experience.id }
      });
    }

    // 4. Ingest Sections and Panel Refs
    let sectionCount = 0;
    let panelCount = 0;

    for (let i = 0; i < scrollSeed.sections.length; i++) {
      const seedSection = scrollSeed.sections[i];
      const section = await prisma.studioScrollSection.create({
        data: {
          experienceId: experience.id,
          sortOrder: i,
          label: seedSection.label || seedSection.id || `Section ${i+1}`,
        }
      });
      sectionCount++;

      for (let j = 0; j < seedSection.panelIds.length; j++) {
        const externalId = seedSection.panelIds[j];
        
        // Attempt to find a matching frame by frameNumber if a storyboard exists
        let frameId = null;
        if (storyboardId) {
          const matchedFrame = await prisma.studioStoryboardFrame.findFirst({
            where: {
              storyboardId,
              // e.g. extract "001" from "panel-001"
              frameNumber: externalId.replace("panel-", "") 
            }
          });
          if (matchedFrame) {
            frameId = matchedFrame.id;
          }
        }

        await prisma.studioScrollPanelRef.create({
          data: {
            sectionId: section.id,
            frameId,
            externalId,
            sortOrder: j,
          }
        });
        panelCount++;
      }
    }

    console.log(`Successfully ingested Scroll Experience into Project: ${project.slug}`);
    console.log(`Title: ${experience.title}`);
    console.log(`Ingested ${sectionCount} sections and ${panelCount} panels.`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Scroll seed import failed:", error);
  process.exit(1);
});
