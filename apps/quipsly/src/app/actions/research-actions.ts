"use server";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { searchQuotes, searchExamples, buildContextPacket } from "../../lib/retrieval";
import { ManuscriptResearchPacket } from "@high-ground/quipsly-domain/retrieval";
import { requireProjectAccess } from "@/lib/server/access";

async function requireResearchProjectActor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED: Sign in before searching this Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findUnique({
    where: { id: projectId },
    select: { slug: true },
  });
  if (!project) {
    throw new Error("NOT_FOUND: Project access target was not found.");
  }

  await requireProjectAccess(project.slug, "read");
  return session.user.id;
}

/**
 * Executes a read-only quote search against the retrieval runtime.
 * 
 * FUTURE: This action must call `auth()` and `requireProjectAccess(projectId, "read")`
 * before executing the search to ensure the caller has permission to query this project's
 * knowledge base. For now, it explicitly requires `projectId` to force the caller to
 * establish context.
 */
export async function executeQuoteSearchAction(
  query: string,
  projectId: string,
  librarySlug?: string
): Promise<ManuscriptResearchPacket> {
  await requireResearchProjectActor(projectId);

  const packet = await searchQuotes(
    { query, library: librarySlug },
    { activeProjectId: projectId }
  );

  return packet;
}

/**
 * Executes a read-only example search against the retrieval runtime.
 * 
 * FUTURE: This action must call `auth()` and `requireProjectAccess(projectId, "read")`
 * before executing the search to ensure the caller has permission to query this project's
 * manuscript text. For now, it explicitly requires `projectId` to force the caller to
 * establish context.
 */
export async function executeExampleSearchAction(
  query: string,
  projectId: string,
  librarySlug?: string
): Promise<ManuscriptResearchPacket> {
  await requireResearchProjectActor(projectId);

  const packet = await searchExamples(
    { query, library: librarySlug },
    { activeProjectId: projectId }
  );

  return packet;
}

/**
 * Executes a read-only context search to fetch document-specific surrounding content
 * and related blocks for a specific cursor/node.
 */
export async function executeContextSearchAction(
  documentId: string,
  cursorNodeId: string,
  projectId: string,
  additionalQuery?: string,
  librarySlug?: string
): Promise<ManuscriptResearchPacket> {
  if (!projectId || !documentId || !cursorNodeId) {
    throw new Error("projectId, documentId, and cursorNodeId are required to establish context.");
  }

  const actorUserId = await requireResearchProjectActor(projectId);
  const packet = await buildContextPacket(
    { documentId, cursorNodeId, additionalQuery, library: librarySlug },
    { activeProjectId: projectId, actorUserId }
  );

  return packet;
}
