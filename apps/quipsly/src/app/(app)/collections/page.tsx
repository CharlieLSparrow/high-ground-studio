import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  getCurrentHomeNestActorEmail,
  listProjectsVisibleToEmail,
} from "@/lib/server/home-nest";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

import { CollectionsClient } from "./collections-client";
import {
  sourceLabelForUrl,
  type CollectionItem,
  type CollectionsSnapshot,
} from "./collections-model";

export const dynamic = "force-dynamic";

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database connection is unavailable.";
  }
  return "Quipsly could not read your saved collections.";
}

function bookmarkExcerpt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Saved bookmark";
  const metadata = value as Record<string, unknown>;
  for (const candidate of [metadata.description, metadata.excerpt, metadata.note]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "Saved bookmark";
}

function captureReceiptTitle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const title = (value as Record<string, unknown>).title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

async function loadCollections(): Promise<CollectionsSnapshot> {
  const session = await auth();
  const signedInEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  const actorEmail = signedInEmail || await getCurrentHomeNestActorEmail();
  if (!actorEmail) {
    return {
      state: "signed-out",
      message: "Sign in to read your private snippets and bookmarks.",
    };
  }

  const prisma = getPrismaClient();
  try {
    const actor = session?.user?.id
      ? { id: session.user.id }
      : await prisma.user.findFirst({
          where: {
            OR: [
              { primaryEmail: actorEmail },
              { aliases: { some: { email: actorEmail } } },
            ],
          },
          select: { id: true },
        });

    if (!actor) {
      return {
        state: "ready",
        authState: signedInEmail ? "signed-in" : "local-operator",
        collections: [],
        items: [],
        writableResearchProjects: [],
      };
    }

    const visibleProjects = await listProjectsVisibleToEmail(actorEmail, prisma);
    const writableResearchProjects = signedInEmail
      ? visibleProjects
          .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
          .map((project) => ({ id: project.id, name: project.name, slug: project.slug }))
      : [];

    const [collectionRows, snippetRows, bookmarkRows] = await Promise.all([
      prisma.collection.findMany({
        where: { userId: actor.id },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          _count: { select: { snippets: true, bookmarks: true } },
        },
      }),
      prisma.snippet.findMany({
        where: { userId: actor.id },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          collectionId: true,
          sourceUrl: true,
          sourceTitle: true,
          highlightedText: true,
          note: true,
          updatedAt: true,
          collection: { select: { name: true } },
          researchFilings: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              sourceUnitId: true,
              projectId: true,
              createdAt: true,
              project: { select: { name: true, slug: true } },
            },
          },
          _count: { select: { captureReceipts: true } },
          captureReceipts: {
            orderBy: { capturedAt: "desc" },
            take: 10,
            select: { id: true, capturedAt: true, captureSnapshotJson: true },
          },
        },
      }),
      prisma.bookmark.findMany({
        where: { userId: actor.id },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          collectionId: true,
          url: true,
          title: true,
          metadataJson: true,
          updatedAt: true,
          collection: { select: { name: true } },
          researchFilings: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              sourceUnitId: true,
              projectId: true,
              createdAt: true,
              project: { select: { name: true, slug: true } },
            },
          },
          _count: { select: { captureReceipts: true } },
          captureReceipts: {
            orderBy: { capturedAt: "desc" },
            take: 10,
            select: { id: true, capturedAt: true, captureSnapshotJson: true },
          },
        },
      }),
    ]);

    const items: CollectionItem[] = [
      ...snippetRows.map((snippet) => ({
        id: snippet.id,
        itemType: "snippet" as const,
        collectionId: snippet.collectionId,
        collectionName: snippet.collection?.name ?? null,
        title: snippet.sourceTitle || "Saved quote",
        excerpt: snippet.highlightedText,
        note: snippet.note,
        sourceUrl: snippet.sourceUrl,
        sourceLabel: sourceLabelForUrl(snippet.sourceUrl),
        updatedAt: snippet.updatedAt.toISOString(),
        lastCapturedAt: (snippet.captureReceipts[0]?.capturedAt || snippet.updatedAt).toISOString(),
        captureCount: snippet._count.captureReceipts || 1,
        captureHistory: snippet.captureReceipts.map((receipt) => ({
          id: receipt.id,
          capturedAt: receipt.capturedAt.toISOString(),
          title: captureReceiptTitle(receipt.captureSnapshotJson),
        })),
        researchFilings: snippet.researchFilings.map((filing) => ({
          id: filing.id,
          sourceUnitId: filing.sourceUnitId,
          projectId: filing.projectId,
          projectName: filing.project.name,
          projectSlug: filing.project.slug,
          createdAt: filing.createdAt.toISOString(),
        })),
      })),
      ...bookmarkRows.map((bookmark) => ({
        id: bookmark.id,
        itemType: "bookmark" as const,
        collectionId: bookmark.collectionId,
        collectionName: bookmark.collection?.name ?? null,
        title: bookmark.title,
        excerpt: bookmarkExcerpt(bookmark.metadataJson),
        note: null,
        sourceUrl: bookmark.url,
        sourceLabel: sourceLabelForUrl(bookmark.url),
        updatedAt: bookmark.updatedAt.toISOString(),
        lastCapturedAt: (bookmark.captureReceipts[0]?.capturedAt || bookmark.updatedAt).toISOString(),
        captureCount: bookmark._count.captureReceipts || 1,
        captureHistory: bookmark.captureReceipts.map((receipt) => ({
          id: receipt.id,
          capturedAt: receipt.capturedAt.toISOString(),
          title: captureReceiptTitle(receipt.captureSnapshotJson),
        })),
        researchFilings: bookmark.researchFilings.map((filing) => ({
          id: filing.id,
          sourceUnitId: filing.sourceUnitId,
          projectId: filing.projectId,
          projectName: filing.project.name,
          projectSlug: filing.project.slug,
          createdAt: filing.createdAt.toISOString(),
        })),
      })),
    ].sort((left, right) => right.lastCapturedAt.localeCompare(left.lastCapturedAt));

    return {
      state: "ready",
      authState: signedInEmail ? "signed-in" : "local-operator",
      collections: collectionRows.map((collection) => ({
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        snippetCount: collection._count.snippets,
        bookmarkCount: collection._count.bookmarks,
      })),
      items,
      writableResearchProjects,
    };
  } catch (error) {
    console.error("[collections] Failed to load saved sources", error);
    return {
      state: "unavailable",
      authState: signedInEmail ? "signed-in" : "local-operator",
      message: safeDatabaseMessage(error),
    };
  }
}

type CollectionsPageProps = {
  searchParams?: Promise<{ capture?: string | string[] }>;
};

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const snapshot = await loadCollections();
  const params = await (searchParams ?? Promise.resolve<{ capture?: string | string[] }>({}));
  const requestedCaptureId = typeof params.capture === "string" ? params.capture.trim().slice(0, 200) : "";
  const initialCaptureId = snapshot.state === "ready" && snapshot.items.some((item) => item.id === requestedCaptureId)
    ? requestedCaptureId
    : null;
  return <CollectionsClient snapshot={snapshot} initialCaptureId={initialCaptureId} />;
}
