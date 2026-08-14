"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/prisma";
import { auth } from "@/auth";

export interface CreateStudioViewParams {
  projectId: string;
  name: string;
  type: string;
  filters: Record<string, any>;
  displaySettings: Record<string, any>;
}

export async function createStudioView(params: CreateStudioViewParams) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const prisma = getPrismaClient();

  // Basic RBAC check (assuming they have access if they can call this)
  const project = await prisma.studioProject.findUnique({
    where: { id: params.projectId },
    select: { id: true, slug: true, workspace: { select: { slug: true } } },
  });

  if (!project) throw new Error("Project not found");

  const view = await prisma.studioViewDefinition.create({
    data: {
      projectId: params.projectId,
      name: params.name,
      type: params.type,
      filters: params.filters,
      displaySettings: params.displaySettings,
      isDefault: false,
    },
  });

  revalidatePath(`/nests/${project.workspace.slug}/projects/${project.slug}`);
  return { ok: true, viewId: view.id };
}

export async function updateStudioView(viewId: string, params: Partial<CreateStudioViewParams>) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const prisma = getPrismaClient();

  const existing = await prisma.studioViewDefinition.findUnique({
    where: { id: viewId },
    include: { project: { select: { slug: true, workspace: { select: { slug: true } } } } },
  });

  if (!existing) throw new Error("View not found");

  await prisma.studioViewDefinition.update({
    where: { id: viewId },
    data: {
      name: params.name,
      type: params.type,
      filters: params.filters,
      displaySettings: params.displaySettings,
    },
  });

  revalidatePath(`/nests/${existing.project.workspace.slug}/projects/${existing.project.slug}`);
  return { ok: true };
}

export async function deleteStudioView(viewId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const prisma = getPrismaClient();

  const existing = await prisma.studioViewDefinition.findUnique({
    where: { id: viewId },
    include: { project: { select: { slug: true, workspace: { select: { slug: true } } } } },
  });

  if (!existing) throw new Error("View not found");
  if (existing.isDefault) throw new Error("Cannot delete default view");

  await prisma.studioViewDefinition.delete({ where: { id: viewId } });

  revalidatePath(`/nests/${existing.project.workspace.slug}/projects/${existing.project.slug}`);
  return { ok: true };
}
