import "server-only";

import type { PrismaClient } from "@prisma/client";

import { createStarterBlocks } from "@/app/(app)/create/starterDocuments";
import { ensureStudioProjectOwnerGrant, normalizeAccessEmail } from "@/lib/server/studio-project-access";
import {
  defaultDocumentTitleForNest,
  ensureStudioWorkspace,
  sourceLabelForNestKind,
  type StudioNestKind,
} from "@/lib/studio/project-registry";

export type LiveWorkNestTemplate = {
  slug: string;
  name: string;
  description: string;
  nestKind: StudioNestKind;
  documentTitle?: string;
  isPrivate?: boolean;
};

export const LIVE_WORK_NESTS: LiveWorkNestTemplate[] = [
  {
    slug: "high-ground-odyssey-manuscript",
    name: "High Ground Odyssey",
    description: "The live book, episode manuscript, public episode pages, recording spine, and publishing workflow.",
    nestKind: "writing",
    documentTitle: "High Ground Odyssey Manuscript",
  },
  {
    slug: "quipsly-product",
    name: "Quipsly Product Nest",
    description: "Product management, beta readiness, roadmap notes, release coordination, and assistant/agent operating memory.",
    nestKind: "mixed",
    documentTitle: "Quipsly Product Operating Document",
  },
  {
    slug: "marine-biology-research",
    name: "Marine Biology Research",
    description: "Shared marine photo-research workspace for image intake, organism identification notes, dataset manifests, MLE planning, and publication-ready findings.",
    nestKind: "research",
    documentTitle: "Marine Biology Photo Research Notebook",
  },
  {
    slug: "quiplore-quote-library",
    name: "QuipLore Quote Library",
    description: "Quote research, attribution notes, public quote feeds, collection planning, and social publishing packets.",
    nestKind: "research",
    documentTitle: "QuipLore Source and Quote Notebook",
  },
  {
    slug: "charlie-melissa-fiction-lab",
    name: "Charlie + Melissa Fiction Lab",
    description: "Private fiction and comic development Nest for story worlds, source packets, character work, continuity notes, scroll previews, and storyboard experiments.",
    nestKind: "fiction",
    documentTitle: "Fiction Lab Story Bible",
    isPrivate: true,
  },
  {
    slug: "homer-travel-footage",
    name: "Homer Travel Footage",
    description: "Insta360 and travel-media intake, clip tagging, rough cuts, social cuts, and reusable footage bins.",
    nestKind: "production",
    documentTitle: "Homer Travel Media Log",
  },
  {
    slug: "photography-client-proofing",
    name: "Photography Client Proofing",
    description: "Client galleries, selects, comments, photo groups, delivery notes, and future proofing portals.",
    nestKind: "gallery",
    documentTitle: "Photography Client Gallery Notes",
  },
];

async function ensureDocumentStarterBlocks({
  prisma,
  projectId,
  documentId,
  documentStableId,
  documentTitle,
  projectSlug,
  nestKind,
}: {
  prisma: PrismaClient;
  projectId: string;
  documentId: string;
  documentStableId: string;
  documentTitle: string;
  projectSlug: string;
  nestKind: StudioNestKind;
}) {
  const existingBlock = await prisma.studioDocumentBlock.findFirst({
    where: { documentId },
    select: { id: true },
  });

  if (existingBlock) return;

  const blocks = createStarterBlocks(projectSlug, nestKind);

  for (let index = 0; index < blocks.length; index += 1) {
    const blockSeed = blocks[index];
    const block = await prisma.studioDocumentBlock.create({
      data: {
        documentId,
        stableId: `${documentStableId}-b${index}`,
        order: index,
        body: blockSeed.text,
      },
    });

    for (const tagSlug of blockSeed.tags) {
      const tag = await prisma.studioTag.upsert({
        where: { projectId_slug: { projectId, slug: tagSlug } },
        update: {},
        create: {
          projectId,
          slug: tagSlug,
          label: tagSlug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
          category: "meaning",
        },
      });

      await prisma.studioTaggedSpan.create({
        data: {
          documentId,
          blockId: block.id,
          tagId: tag.id,
          startOffset: 0,
          endOffset: blockSeed.text.length,
          selectedText: blockSeed.text,
          documentStableId,
          documentTitleSnapshot: documentTitle,
          blockStableId: block.stableId,
        },
      });
    }
  }
}

export async function ensureLiveWorkNests({
  prisma,
  ownerEmail,
}: {
  prisma: PrismaClient;
  ownerEmail?: string | null;
}) {
  const workspace = await ensureStudioWorkspace(prisma as any);
  const normalizedOwnerEmail = normalizeAccessEmail(ownerEmail);
  const results: Array<{ slug: string; id: string; created: boolean }> = [];

  for (const template of LIVE_WORK_NESTS) {
    const documentStableId = `doc-${template.slug}`;
    const documentTitle = template.documentTitle || defaultDocumentTitleForNest(template.name, template.nestKind);
    let created = false;

    let project = await prisma.studioProject.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: template.slug } },
      select: { id: true, slug: true },
    });

    if (!project) {
      project = await prisma.studioProject.create({
        data: {
          workspaceId: workspace.id,
          slug: template.slug,
          name: template.name,
          description: template.description,
          sourceLabel: sourceLabelForNestKind(template.nestKind),
          isPrivate: template.isPrivate ?? true,
          documents: {
            create: {
              stableId: documentStableId,
              title: documentTitle,
              sourceLabel: `live-work-nest:${template.slug}`,
            },
          },
        },
        select: { id: true, slug: true },
      });
      created = true;
    } else {
      await prisma.studioProject.update({
        where: { id: project.id },
        data: {
          name: template.name,
          description: template.description,
          sourceLabel: sourceLabelForNestKind(template.nestKind),
          isPrivate: template.isPrivate ?? true,
        },
      });
    }

    const document =
      (await prisma.studioDocument.findUnique({
        where: { stableId: documentStableId },
        select: { id: true, stableId: true, title: true },
      })) ??
      (await prisma.studioDocument.findFirst({
        where: { projectId: project.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, stableId: true, title: true },
      })) ??
      (await prisma.studioDocument.create({
        data: {
          projectId: project.id,
          stableId: documentStableId,
          title: documentTitle,
          sourceLabel: `live-work-nest:${template.slug}`,
        },
        select: { id: true, stableId: true, title: true },
      }));

    if (document.title !== documentTitle && document.stableId === documentStableId) {
      await prisma.studioDocument.update({
        where: { id: document.id },
        data: { title: documentTitle },
      });
    }

    await ensureDocumentStarterBlocks({
      prisma,
      projectId: project.id,
      documentId: document.id,
      documentStableId: document.stableId,
      documentTitle,
      projectSlug: template.slug,
      nestKind: template.nestKind,
    });

    await ensureStudioProjectOwnerGrant({
      projectId: project.id,
      ownerEmail: normalizedOwnerEmail,
      createdByEmail: normalizedOwnerEmail,
      prisma,
    });

    results.push({ slug: template.slug, id: project.id, created });
  }

  return results;
}
