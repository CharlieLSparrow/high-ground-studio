"use server";

import { redirect } from "next/navigation";
import { getPrismaClient } from "@/lib/prisma";

const WORKSPACE_SLUG = "tonight-pack";

const DEFAULT_TAGS = [
  { slug: "chapter", label: "Chapter", category: "chapter" },
  { slug: "episode", label: "Episode", category: "episode" },
  { slug: "quote", label: "Quote", category: "quote" },
  { slug: "media", label: "Media", category: "media" },
  { slug: "study-note", label: "Study Note", category: "internal_note" },
  { slug: "draft", label: "Draft", category: "workflow_status" },
];

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "untitled";
}

export async function createNotebook(formData: FormData) {
  const prisma = getPrismaClient();
  const title = String(formData.get("title") || "Untitled Notebook").trim() || "Untitled Notebook";
  const kind = String(formData.get("kind") || "Book").trim() || "Book";
  const baseSlug = slugify(title);

  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { slug: WORKSPACE_SLUG, name: "Tonight Pack Workspace" },
  });

  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.studioProject.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const project = await prisma.studioProject.create({
    data: {
      workspaceId: workspace.id,
      slug,
      name: title,
    },
  });

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: `doc-${slug}`,
      title,
    },
  });

  await prisma.studioDocumentBlock.create({
    data: {
      documentId: document.id,
      stableId: `opening-${slug}`,
      order: 0,
      body: `${title}\n\nStart this ${kind.toLowerCase()} here. Keep writing in one document, then tag passages as chapters, quotes, clips, sources, questions, or episode material.`,
    },
  });

  for (const tag of DEFAULT_TAGS) {
    await prisma.studioTag.create({
      data: {
        projectId: project.id,
        slug: tag.slug,
        label: tag.label,
        category: tag.category as any,
      },
    });
  }

  redirect(`/?project=${encodeURIComponent(slug)}`);
}
