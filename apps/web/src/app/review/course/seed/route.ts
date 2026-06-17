import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not allowed in production" }, { status: 403 });
  }

  try {
    let project = await prisma.studioProject.findFirst({
      where: { name: 'Course Test Project' }
    });

    if (!project) {
      const workspace = await prisma.studioWorkspace.findFirst();
      if (!workspace) return NextResponse.json({ error: "No workspace" });
      project = await prisma.studioProject.create({
        data: {
          workspaceId: workspace.id,
          slug: 'course-test-project',
          name: 'Course Test Project',
          sourceLabel: 'quipsly',
        }
      });
    }

    // Create a mock Document
    const document = await prisma.studioDocument.create({
      data: {
        projectId: project.id,
        stableId: `doc-seed-${Date.now()}`,
        title: "Introduction to High Ground Lore",
        sourceLabel: "course",
      }
    });

    // Create some blocks
    const blocks = [
      {
        title: "Welcome",
        body: "High Ground Odyssey is a dark sci-fi thriller about identity.",
      },
      {
        title: "Knowledge Check",
        body: "What is the main genre of High Ground Odyssey?",
      },
      {
        title: "The Neon District",
        body: "The lowest levels are bathed in the glow of decaying neon. Sodium haze fills the streets, and it never stops raining.",
      },
      {
        title: "Characters",
        body: "Who is the protagonist of the series?",
      }
    ];

    for (let i = 0; i < blocks.length; i++) {
      await prisma.studioDocumentBlock.create({
        data: {
          documentId: document.id,
          stableId: `block-seed-${Date.now()}-${i}`,
          order: i,
          title: blocks[i].title,
          body: blocks[i].body,
          sourceLabel: "quipsly",
        }
      });
    }

    return NextResponse.redirect(new URL(`/review/course/${document.id}`, "http://localhost:3000"));

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
