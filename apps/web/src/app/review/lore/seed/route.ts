import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not allowed in production" }, { status: 403 });
  }

  try {
    // 1. Get or create a project
    let project = await prisma.studioProject.findFirst();
    if (!project) {
      const workspace = await prisma.studioWorkspace.findFirst();
      if (!workspace) return NextResponse.json({ error: "No workspace" });
      project = await prisma.studioProject.create({
        data: {
          workspaceId: workspace.id,
          slug: 'lore-test-project',
          name: 'Lore Test Project',
          sourceLabel: 'quipsly',
        }
      });
    }

    // 2. Create Authors & Sources
    const author = await prisma.quipLoreAuthor.create({
      data: {
        projectId: project.id,
        name: "Director Charlie",
      }
    });

    const work = await prisma.quipLoreWork.create({
      data: {
        projectId: project.id,
        authorId: author.id,
        title: "The High Ground Odyssey Bible",
      }
    });

    const theme = await prisma.quipLoreTheme.create({
      data: {
        projectId: project.id,
        name: "Worldbuilding",
      }
    });

    const tag1 = await prisma.quipLoreTag.create({
      data: { projectId: project.id, themeId: theme.id, name: "Neon District" }
    });
    
    const tag2 = await prisma.quipLoreTag.create({
      data: { projectId: project.id, themeId: theme.id, name: "Protagonist" }
    });

    // 3. Create a Collection
    const collection = await prisma.quipLoreCollection.create({
      data: {
        projectId: project.id,
        title: "HGO Initial Worldbuilding Pitch",
        description: "A selection of atmospheric notes to establish the aesthetic.",
        isPublic: true,
      }
    });

    // 4. Create Quotes and attach to Collection
    await prisma.quipLoreQuote.create({
      data: {
        projectId: project.id,
        workId: work.id,
        authorId: author.id,
        text: "The neon glow doesn't reach the lower levels. Down there, it's all sodium haze and rust.",
        tags: { connect: [{ id: tag1.id }] },
        collections: { connect: [{ id: collection.id }] }
      }
    });

    await prisma.quipLoreQuote.create({
      data: {
        projectId: project.id,
        workId: work.id,
        authorId: author.id,
        text: "He never looked at the camera. The audience should only ever see his reflection in the puddles.",
        tags: { connect: [{ id: tag2.id }] },
        collections: { connect: [{ id: collection.id }] }
      }
    });

    // Redirect to the new review route
    return NextResponse.redirect(new URL(`/review/lore/${collection.id}`, "http://localhost:3000"));

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
