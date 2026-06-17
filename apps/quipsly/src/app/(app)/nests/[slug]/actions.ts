"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { getPrismaClient } from "@/lib/prisma";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { auth } from "@/auth";

export async function createDocumentAction(projectSlug: string) {
  const session = await auth();
  const actorEmail = session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to create a document.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: randomUUID(),
      title: "New Document",
      sourceLabel: "nest-kind:study", // By default, new side documents are study/research docs
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}
