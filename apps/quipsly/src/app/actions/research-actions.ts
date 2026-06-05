"use server";

import { searchQuotes, searchExamples, buildContextPacket } from "../../lib/retrieval";
import { ManuscriptResearchPacket } from "@high-ground/quipsly-domain/retrieval";
import { requireProjectAccess } from "../../lib/studio-authz";

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
  await requireProjectAccess(projectId, "read");

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
  await requireProjectAccess(projectId, "read");

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
  await requireProjectAccess(projectId, "read");

  if (!projectId || !documentId || !cursorNodeId) {
    throw new Error("projectId, documentId, and cursorNodeId are required to establish context.");
  }

  const packet = await buildContextPacket(
    { documentId, cursorNodeId, additionalQuery, library: librarySlug },
    { activeProjectId: projectId }
  );

  return packet;
}
