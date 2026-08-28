import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  normalizeWorkspaceSearchQuery,
  searchWorkspace,
} from "@/lib/server/workspace-search";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

export const dynamic = "force-dynamic";

type SearchProject = {
  id: string;
  slug: string;
  name: string;
  role: string;
  isHomeNest: boolean;
};

function cleanText(value: unknown, max = 320) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : "";
}

function projectFor(
  candidate: { id?: string; slug?: string; name?: string } | null | undefined,
  projects: SearchProject[],
) {
  if (!candidate) return null;
  const project = projects.find((item) =>
    (candidate.id && item.id === candidate.id)
      || (candidate.slug && item.slug === candidate.slug),
  );
  return project ?? null;
}

function assignedTags(
  links: Array<{ tag: { id: string; label: string; isActive: boolean } }> | undefined,
) {
  return (links ?? []).map(({ tag }) => ({
    id: tag.id,
    label: tag.label,
    isActive: tag.isActive,
  }));
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_SIGN_IN_REQUIRED", error: "Sign in before searching your Nests." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const query = normalizeWorkspaceSearchQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) {
    return NextResponse.json(
      {
        ok: true,
        schema: "quipsly-mobile-search-v1",
        query,
        projectCount: 0,
        results: [],
        boundaries: {
          actorScoped: true,
          explicitProjectGrantRequired: true,
          minimumQueryLength: 2,
          unreviewedTranscriptCandidatesExcluded: true,
          externalSideEffects: false,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const actorEmail = cleanText(
    session.user.primaryEmail || session.user.email,
    320,
  ).toLowerCase();
  const prisma = getPrismaClient();
  const visibleProjects = actorEmail
    ? await listProjectsVisibleToEmail(actorEmail, prisma)
    : [];
  const projects: SearchProject[] = visibleProjects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    role: project.role,
    isHomeNest: project.sourceLabel === sourceLabelForNestKind("home"),
  }));
  const search = await searchWorkspace(prisma, {
    actorUserId: session.user.id,
    query,
    visibleProjects,
  });

  const results = [
    ...search.tasks.map((item) => ({
      id: item.id,
      kind: "TASK" as const,
      title: cleanText(item.title) || "Untitled task",
      detail: cleanText(item.detail) || cleanText(item.status).toLowerCase(),
      project: projectFor(item.project, projects),
      tags: assignedTags(item.tagLinks),
      nativeTargetId: item.id,
      webPath: `/work?task=${encodePathSegment(item.id)}`,
    })),
    ...search.goals.map((item) => ({
      id: item.id,
      kind: "GOAL" as const,
      title: cleanText(item.title) || "Untitled goal",
      detail: cleanText(item.description) || cleanText(item.status).toLowerCase(),
      project: projectFor(item.project, projects),
      tags: assignedTags(item.tagLinks),
      nativeTargetId: item.id,
      webPath: `/work?goal=${encodePathSegment(item.id)}`,
    })),
    ...search.sessions.map((item) => ({
      id: item.id,
      kind: "SESSION" as const,
      title: cleanText(item.title) || "Untitled Session",
      detail: [cleanText(item.purpose).toLowerCase(), cleanText(item.status).toLowerCase()]
        .filter(Boolean)
        .join(" · "),
      project: projectFor(item.project, projects),
      tags: assignedTags(item.tagLinks),
      nativeTargetId: item.id,
      webPath: `/sessions/${encodePathSegment(item.id)}`,
    })),
    ...search.notes.map((item) => ({
      id: item.id,
      kind: "SESSION_NOTE" as const,
      title: cleanText(item.title) || "Session note",
      detail: cleanText(item.body),
      project: null,
      tags: assignedTags(item.tagLinks),
      nativeTargetId: item.room.id,
      webPath: `/sessions/${encodePathSegment(item.room.id)}?mode=notes#session-note-${encodePathSegment(item.id)}`,
    })),
    ...search.documents.map((item) => {
      const project = projectFor(item.project, projects);
      const isWriting = item.sourceLabel?.toLowerCase().includes("document-kind:note") === true;
      const blockId = item.blocks[0]?.id;
      const params = new URLSearchParams({
        project: item.project.slug,
        document: item.id,
      });
      if (blockId) params.set("block", blockId);
      return {
        id: item.id,
        kind: isWriting ? "WRITING" as const : "DOCUMENT" as const,
        title: cleanText(item.title) || "Untitled writing",
        detail: cleanText(item.blocks[0]?.body),
        project,
        tags: assignedTags(item.tagLinks),
        nativeTargetId: isWriting ? item.id : null,
        webPath: `/create?${params.toString()}`,
      };
    }),
    ...search.sources.map((item) => ({
      id: item.id,
      kind: "SOURCE" as const,
      title: cleanText(item.title) || "Untitled source",
      detail: [cleanText(item.kind), cleanText(item.author)].filter(Boolean).join(" · "),
      project: projectFor(item.project, projects),
      tags: [],
      nativeTargetId: null,
      webPath: `/research?query=${encodeURIComponent(cleanText(item.title, 160))}`,
    })),
    ...search.annotations.map((item) => ({
      id: item.id,
      kind: "ANNOTATION" as const,
      title: cleanText(item.exactText || item.body) || "Saved passage",
      detail: cleanText(item.sourceUnit.title),
      project: projectFor(item.project, projects),
      tags: [],
      nativeTargetId: null,
      webPath: `/research?query=${encodeURIComponent(cleanText(item.exactText || item.body, 160))}`,
    })),
    ...search.tags.map((item) => ({
      id: item.id,
      kind: "TAG" as const,
      title: `#${cleanText(item.label, 80)}`,
      detail: cleanText(item.description),
      project: projectFor(item.project, projects),
      tags: [],
      nativeTargetId: null,
      webPath: `/find?tag=${encodePathSegment(item.id)}`,
    })),
  ];

  return NextResponse.json(
    {
      ok: true,
      schema: "quipsly-mobile-search-v1",
      query: search.query,
      projectCount: search.projectCount,
      results,
      boundaries: {
        actorScoped: search.boundaries.actorScoped,
        explicitProjectGrantRequired: true,
        minimumQueryLength: search.boundaries.minimumQueryLength,
        unreviewedTranscriptCandidatesExcluded:
          search.boundaries.unreviewedTranscriptCandidatesExcluded,
        externalSideEffects: search.boundaries.externalSideEffects,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
