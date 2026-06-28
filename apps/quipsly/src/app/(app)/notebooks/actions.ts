"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
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

function slugish(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "page";
}

export async function createNotebookPage(formData: FormData) {
  const prisma = getPrismaClient();
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  const projectSlug = String(formData.get("projectSlug") || "").trim();
  const title = String(formData.get("title") || "Untitled Page").trim() || "Untitled Page";
  const kind = String(formData.get("kind") || "writing").trim() || "writing";

  if (!projectSlug) {
    redirect("/notebooks?missingNest=1");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    redirect("/notebooks?notAllowed=1");
  }

  const stableId = `${projectSlug}-${slugish(title)}-${Date.now().toString(36)}`;
  const document = await prisma.studioDocument.create({
    data: {
      projectId: access.projectId,
      stableId,
      title,
      sourceLabel: kind,
    },
  });

  await prisma.studioDocumentBlock.create({
    data: {
      documentId: document.id,
      stableId: `opening-${stableId}`,
      order: 0,
      body: `${title}\n\nStart writing here. This page can become a draft, article, chapter note, research packet, or source-linked page later.`,
    },
  });

  revalidatePath("/notebooks");
  revalidatePath(`/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(document.id)}`);
  redirect(`/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(document.id)}`);
}
