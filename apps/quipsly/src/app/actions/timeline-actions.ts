"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "../../lib/studio-authz";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

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
      metadataJson: { source: "timeline-action" },
    },
  });
}

export async function addClipToTimeline(
  projectId: string,
  trackId: string,
  assetId: string | null,
  name: string,
  startFrame: number,
  durationFrames: number,
  colorHex: string | null
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const clip = await prisma.studioNLEClip.create({
    data: {
      trackId,
      assetId,
      name,
      startFrame,
      durationFrames,
      colorHex,
    },
  });

  await logToHybridStream(projectId, `Added new clip **${name}** to the timeline.`);
  revalidatePath(`/nests/${projectId}`);
  return clip;
}

export async function updateClip(
  projectId: string,
  clipId: string,
  data: {
    startFrame?: number;
    durationFrames?: number;
    trimStartFrame?: number;
    name?: string;
    colorHex?: string;
  }
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  // Verify the clip belongs to this project (via track -> nleProject -> project)
  const existing = await prisma.studioNLEClip.findUnique({
    where: { id: clipId },
    include: { track: { include: { nleProject: true } } },
  });

  if (!existing || existing.track.nleProject.projectId !== projectId) {
    throw new Error("NOT_FOUND or Unauthorized");
  }

  const clip = await prisma.studioNLEClip.update({
    where: { id: clipId },
    data,
  });

  // Only log significant changes, maybe skips minor drags for less noise
  if (data.name && data.name !== existing.name) {
    await logToHybridStream(projectId, `Renamed clip **${existing.name}** to **${data.name}**.`);
  }

  revalidatePath(`/nests/${projectId}`);
  return clip;
}

export async function deleteClip(projectId: string, clipId: string) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const existing = await prisma.studioNLEClip.findUnique({
    where: { id: clipId },
    include: { track: { include: { nleProject: true } } },
  });

  if (!existing || existing.track.nleProject.projectId !== projectId) {
    throw new Error("NOT_FOUND or Unauthorized");
  }

  await prisma.studioNLEClip.delete({ where: { id: clipId } });

  await logToHybridStream(projectId, `Removed clip **${existing.name}** from the timeline.`);
  revalidatePath(`/nests/${projectId}`);
  return true;
}

export async function splitClip(projectId: string, clipId: string, splitFrame: number) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const existing = await prisma.studioNLEClip.findUnique({
    where: { id: clipId },
    include: { track: { include: { nleProject: true } } },
  });

  if (!existing || existing.track.nleProject.projectId !== projectId) {
    throw new Error("NOT_FOUND or Unauthorized");
  }

  if (splitFrame <= existing.startFrame || splitFrame >= existing.startFrame + existing.durationFrames) {
    throw new Error("Invalid split frame");
  }

  const firstDuration = splitFrame - existing.startFrame;
  const secondDuration = existing.durationFrames - firstDuration;
  const secondTrimStart = existing.trimStartFrame + firstDuration;

  const [firstClip, secondClip] = await prisma.$transaction([
    prisma.studioNLEClip.update({
      where: { id: clipId },
      data: { durationFrames: firstDuration },
    }),
    prisma.studioNLEClip.create({
      data: {
        trackId: existing.trackId,
        assetId: existing.assetId,
        name: `${existing.name} (2)`,
        startFrame: splitFrame,
        durationFrames: secondDuration,
        trimStartFrame: secondTrimStart,
        speedMultiplier: existing.speedMultiplier,
        colorHex: existing.colorHex,
      },
    }),
  ]);

  await logToHybridStream(projectId, `Split clip **${existing.name}** at frame ${splitFrame}.`);
  revalidatePath(`/nests/${projectId}`);
  return { firstClip, secondClip };
}
