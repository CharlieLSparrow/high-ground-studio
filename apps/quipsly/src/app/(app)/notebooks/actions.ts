"use server";

import { redirect } from "next/navigation";
import { getPrismaClient } from "@/lib/prisma";
import { createStudioProject } from "@/lib/studio/project-registry";

const DEFAULT_TAGS = [
  { slug: "chapter", label: "Chapter", category: "chapter" },
  { slug: "episode", label: "Episode", category: "episode" },
  { slug: "quote", label: "Quote", category: "quote" },
  { slug: "media", label: "Media", category: "media" },
  { slug: "study-note", label: "Study Note", category: "internal_note" },
  { slug: "draft", label: "Draft", category: "workflow_status" },
];

export async function createNotebook(formData: FormData) {
  const prisma = getPrismaClient();
  const title = String(formData.get("title") || "Untitled Notebook").trim() || "Untitled Notebook";
  const kind = String(formData.get("kind") || "Book").trim() || "Book";
  const nestKind = kind.toLowerCase().includes("study") || kind.toLowerCase().includes("research")
    ? "study"
    : "writing";
  const { project, document } = await createStudioProject(prisma, {
    name: title,
    nestKind,
    documentTitle: title,
  });

  await prisma.studioDocumentBlock.create({
    data: {
      documentId: document.id,
      stableId: `opening-${project.slug}`,
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

  redirect(`/create?project=${encodeURIComponent(project.slug)}`);
}
