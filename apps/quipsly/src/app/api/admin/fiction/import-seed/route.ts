import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();

    // STRICT PRIVACY GUARD
    if (email !== "charlielsparrow@gmail.com") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { seriesSlug, issueSlug } = await req.json();
    if (!seriesSlug || !issueSlug) {
      return NextResponse.json({ error: "Missing slugs" }, { status: 400 });
    }

    const basePath = path.join(process.cwd(), "content", "private", "fiction", "charlie-l-sparrow", seriesSlug, issueSlug);
    
    const [issueRaw, bibleRaw] = await Promise.all([
      fs.readFile(path.join(basePath, "issue.json"), "utf8"),
      fs.readFile(path.join(basePath, "story-bible-seed.json"), "utf8"),
    ]);

    const issueData = JSON.parse(issueRaw);
    const storyBibleData = JSON.parse(bibleRaw);
    const prisma = getPrismaClient();
    const { ensureStudioWorkspace } = await import("@/lib/studio/project-registry");

    // 1. Resolve or Create Workspace
    const workspace = await ensureStudioWorkspace(prisma);

    // 2. Idempotent Project (Nest)
    const projectSlug = `${seriesSlug}-private-nest`;
    const project = await prisma.studioProject.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: projectSlug } },
      update: {
        name: issueData.series.title,
        description: issueData.series.universe,
      },
      create: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: issueData.series.title,
        description: issueData.series.universe,
        isPrivate: true,
      }
    });

    // 3. Add Project Access Grant to ensure Charlie has explicit access
    await prisma.studioProjectAccessGrant.upsert({
      where: { projectId_email: { projectId: project.id, email } },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        projectId: project.id,
        email,
        role: "OWNER",
        status: "ACTIVE",
        createdByEmail: email,
      }
    });

    // 4. Idempotent Entities (Characters, Settings, Themes)
    let upsertedCount = 0;
    const { entities } = storyBibleData;

    for (const entity of entities) {
      const externalId = `${projectSlug}-${issueSlug}-entity-${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      
      let typeEnum = entity.type;
      // Map seed types if necessary, though schema was updated to match
      
      await prisma.storyEntity.upsert({
        where: { externalId },
        update: {
          name: entity.name,
          attributes: entity.attributes,
        },
        create: {
          projectId: project.id,
          externalId,
          type: typeEnum,
          name: entity.name,
          attributes: entity.attributes,
        }
      });
      upsertedCount++;
    }

    // 5. Idempotent Acts mapping
    for (const act of issueData.acts) {
      const actExternalId = `${projectSlug}-${issueSlug}-act-${act.id}`;
      await prisma.storyEntity.upsert({
        where: { externalId: actExternalId },
        update: {
          name: act.title,
          attributes: act,
        },
        create: {
          projectId: project.id,
          externalId: actExternalId,
          type: "COMIC_ACT",
          name: act.title,
          attributes: act,
        }
      });
      upsertedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      project: project.slug,
      entitiesUpserted: upsertedCount
    });

  } catch (error: any) {
    console.error("Import seed error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
