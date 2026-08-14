"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "../../lib/studio-authz";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import { CanvasFormFieldType } from "@prisma/client";

async function getActor() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return {
    id: session.user.id,
    email: normalizeAccessEmail(session.user.primaryEmail || session.user.email),
    name: session.user.name || normalizeAccessEmail(session.user.primaryEmail || session.user.email),
  };
}

async function logToHybridStream(projectId: string, message: string) {
  const prisma = getPrismaClient();
  const actor = await getActor();
  
  const project = await prisma.studioProject.findUnique({ where: { id: projectId } });
  if (!project) return;

  const thread = await prisma.studioNestChatThread.upsert({
    where: { projectId_key: { projectId, key: "default" } },
    update: {},
    create: {
      projectId,
      key: "default",
      title: `${project.name} Chat`,
    },
  });

  await prisma.studioNestChatMessage.create({
    data: {
      projectId,
      threadId: thread.id,
      authorEmail: actor.email,
      authorName: actor.name,
      body: message,
      metadataJson: { source: "canvas-action" },
    },
  });
}

export type CanvasFieldPayload = {
  name: string;
  label: string;
  type: CanvasFormFieldType;
  required: boolean;
  options: string[];
};

export async function saveCanvasForm(
  projectId: string,
  title: string,
  description: string,
  fields: CanvasFieldPayload[]
) {
  // Ensure the user has write access to this project
  await requireProjectAccess(projectId, "write");
  const actor = await getActor();
  const prisma = getPrismaClient();

  const form = await prisma.canvasForm.create({
    data: {
      title,
      description,
      createdById: actor.id,
      fields: {
        create: fields.map((f, i) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options,
          order: i,
        })),
      },
    },
  });

  await logToHybridStream(projectId, `Created a new Canvas+ Form: **${title}** with ${fields.length} fields.`);
  
  revalidatePath(`/nests/${projectId}`);
  return form;
}
