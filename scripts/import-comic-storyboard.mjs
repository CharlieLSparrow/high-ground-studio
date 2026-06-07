import { PrismaClient, StoryEntityType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const issueDir = path.join(
  repoRoot,
  "content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design",
);

function ownerWorkspaceSlug(ownerEmail) {
  return `${ownerEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-workspace`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(issueDir, fileName), "utf8"));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const [storyboardSeed, storyBibleSeed] = await Promise.all([
    readJson("storyboard-seed.json"),
    readJson("story-bible-seed.json"),
  ]);

  if (storyboardSeed.kind !== "studio-storyboard-seed") {
    throw new Error("Invalid seed kind. Expected studio-storyboard-seed.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
    log: ["error"],
  });
  const validEntityTypes = new Set(Object.values(StoryEntityType));

  try {
    const ownerEmail =
      storyboardSeed.access?.ownerEmail || "CharlieLSparrow@gmail.com";
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);
    const workspaceSlug = ownerWorkspaceSlug(ownerEmail);
    const projectSlug =
      "charlie-melissa-fiction-lab";

    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: workspaceSlug },
      update: {
        name: "Charlie L. Sparrow - Fiction Nest",
        ownerLabel: ownerEmail,
        isPrivate: true,
      },
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
      update: {
        name: "My Heart Is a Junkyard Starship",
        description: "Private comic and fiction development nest.",
        sourceLabel: "nest-kind:fiction",
        isPrivate: true,
      },
      create: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: "My Heart Is a Junkyard Starship",
        description: "Private comic and fiction development nest.",
        sourceLabel: "nest-kind:fiction",
        isPrivate: true,
      },
    });

    await prisma.studioProjectAccessGrant.upsert({
      where: {
        projectId_email: {
          projectId: project.id,
          email: normalizedOwnerEmail,
        },
      },
      update: {
        role: "OWNER",
        status: "ACTIVE",
        note: "Private fiction Nest owner",
      },
      create: {
        projectId: project.id,
        email: normalizedOwnerEmail,
        role: "OWNER",
        status: "ACTIVE",
        createdByEmail: normalizedOwnerEmail,
        note: "Private fiction Nest owner",
      },
    });

    let storyboard = await prisma.studioStoryboard.findFirst({
      where: {
        projectId: project.id,
        title: storyboardSeed.storyboard.title,
      },
    });

    if (!storyboard) {
      storyboard = await prisma.studioStoryboard.create({
        data: {
          projectId: project.id,
          title: storyboardSeed.storyboard.title,
          description: storyboardSeed.storyboard.description,
          aspectRatio: storyboardSeed.storyboard.aspectRatio || "9:16",
        },
      });
    } else {
      storyboard = await prisma.studioStoryboard.update({
        where: { id: storyboard.id },
        data: {
          description: storyboardSeed.storyboard.description,
          aspectRatio:
            storyboardSeed.storyboard.aspectRatio || storyboard.aspectRatio,
        },
      });
    }

    const existingFrames = await prisma.studioStoryboardFrame.findMany({
      where: { storyboardId: storyboard.id },
    });
    const existingByFrameNumber = new Map(
      existingFrames.map((frame) => [frame.frameNumber, frame]),
    );

    let createdFrames = 0;
    let updatedFrames = 0;
    let preservedImages = 0;

    for (const seedFrame of storyboardSeed.frames) {
      const existingFrame = existingByFrameNumber.get(seedFrame.frameNumber);
      const imageUrl = existingFrame?.imageUrl || seedFrame.imageUrl || null;

      if (existingFrame?.imageUrl) {
        preservedImages++;
      }

      const frameData = {
        sortOrder: seedFrame.sortOrder,
        action: seedFrame.action,
        dialogue: seedFrame.dialogue || null,
        cameraInfo: seedFrame.cameraInfo || "Static",
        shotSize: seedFrame.shotSize || "Medium Shot",
        lens: seedFrame.lens || null,
        cameraMovement: seedFrame.cameraMovement || "Static",
        estimatedDuration: seedFrame.estimatedDuration || null,
        vfxNotes: seedFrame.vfxNotes || null,
        imageUrl,
      };

      if (existingFrame) {
        await prisma.studioStoryboardFrame.update({
          where: { id: existingFrame.id },
          data: frameData,
        });
        updatedFrames++;
      } else {
        await prisma.studioStoryboardFrame.create({
          data: {
            storyboardId: storyboard.id,
            frameNumber: seedFrame.frameNumber,
            ...frameData,
          },
        });
        createdFrames++;
      }
    }

    let createdEntities = 0;
    let updatedEntities = 0;
    let skippedEntities = 0;

    for (const entity of storyBibleSeed.entities || []) {
      if (!validEntityTypes.has(entity.type)) {
        skippedEntities++;
        continue;
      }

      const existingEntity = await prisma.storyEntity.findFirst({
        where: {
          projectId: project.id,
          type: entity.type,
          name: entity.name,
        },
      });

      const entityData = {
        aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
        attributes: entity.attributes || {},
      };

      if (existingEntity) {
        await prisma.storyEntity.update({
          where: { id: existingEntity.id },
          data: entityData,
        });
        updatedEntities++;
      } else {
        await prisma.storyEntity.create({
          data: {
            projectId: project.id,
            type: entity.type,
            name: entity.name,
            ...entityData,
          },
        });
        createdEntities++;
      }
    }

    console.log(
      JSON.stringify(
        {
          workspaceSlug: workspace.slug,
          projectSlug: project.slug,
          storyboardId: storyboard.id,
          createdFrames,
          updatedFrames,
          preservedImages,
          createdEntities,
          updatedEntities,
          skippedEntities,
          totalFrames: storyboardSeed.frames.length,
          totalEntities: storyBibleSeed.entities?.length || 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
