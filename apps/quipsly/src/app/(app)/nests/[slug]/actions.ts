"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPrismaClient } from "@/lib/prisma";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { auth } from "@/auth";

type CreateNestDocumentKind = "draft" | "note" | "study-source";

const DOCUMENT_PRESETS: Record<CreateNestDocumentKind, {
  title: string;
  sourceLabel: string;
  blocks: string[];
}> = {
  draft: {
    title: "New Draft",
    sourceLabel: "document-kind:draft",
    blocks: [
      "Draft Title",
      "Start drafting here. This is a side draft inside the Nest, not the canonical manuscript until you intentionally promote or copy it.",
    ],
  },
  note: {
    title: "New Note",
    sourceLabel: "document-kind:note",
    blocks: [
      "Note Title",
      "Capture the thought here. Notes can be tagged, linked, summarized, or pulled into drafts later without pretending they are manuscript truth.",
    ],
  },
  "study-source": {
    title: "New Study Source",
    sourceLabel: "document-kind:fixed-source",
    blocks: [
      "Source Title",
      "Paste or import source text here. Treat this as fixed source material: annotate over it, cite it, and keep provenance visible before using it in your own writing.",
    ],
  },
};

const HGO_PODCAST_YEAR_ONE_BASE = "apps/web/content/_inbox/EpisodePrepTests/Two Sparrows/Books/Podcast Year 1";

const HGO_SOURCE_CATALOG = [
  { key: "episode-1", label: "Episode 1 Source", relativePath: "1 - March 25 - Pilot/1.md" },
  { key: "episode-2", label: "Episode 2 Source", relativePath: "2 - April 1 - It's a Metaphor!/2.md" },
  { key: "episode-3", label: "Episode 3 Source", relativePath: "3 - April 8 - Chub and Jack/3.md" },
  { key: "episode-4", label: "Episode 4 Source", relativePath: "4 - April 15 - Early Life Lessons/4.md" },
  { key: "episode-5", label: "Episode 5 Source", relativePath: "5 - April 22 - Values/5.md" },
  { key: "episode-6", label: "Episode 6 Source", relativePath: "6 - New - Values 2/6.md" },
  { key: "episode-7", label: "Episode 7 Source", relativePath: "7 - In The Army Now/7.md" },
  { key: "episode-8", label: "Episode 8 Source", relativePath: "8 - Don't Shush the Shusher/8.md" },
  { key: "episode-9", label: "Episode 9 Source", relativePath: "9 - I wasn't born a leader/9.md" },
] as const;

export type HgoSourceKey = typeof HGO_SOURCE_CATALOG[number]["key"];

function repoRootCandidate() {
  const candidates = [
    process.env.QUIPSLY_REPO_ROOT,
    process.cwd(),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), ".."),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "../.."),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "../../.."),
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(/* turbopackIgnore: true */ path.join(candidate, "apps/web/content/_inbox"))) ?? process.cwd();
}

function resolveHgoSource(sourceKey: HgoSourceKey) {
  const source = HGO_SOURCE_CATALOG.find((item) => item.key === sourceKey);
  if (!source) {
    throw new Error("Unknown HGO source.");
  }

  const repoRoot = repoRootCandidate();
  const sourceRoot = path.resolve(/* turbopackIgnore: true */ repoRoot, HGO_PODCAST_YEAR_ONE_BASE);
  const sourcePath = path.resolve(/* turbopackIgnore: true */ sourceRoot, source.relativePath);

  if (!sourcePath.startsWith(sourceRoot)) {
    throw new Error("Refusing to import a source outside the approved HGO source root.");
  }

  return { ...source, sourcePath };
}

function chunkSourceText(text: string, maxChars = 3600) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      chunks.push(paragraph);
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChars) {
      chunks.push(paragraph.slice(index, index + maxChars).trim());
    }
  }

  return chunks;
}

export async function createDocumentAction(projectSlug: string, kind: CreateNestDocumentKind = "note") {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

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

  const preset = DOCUMENT_PRESETS[kind] ?? DOCUMENT_PRESETS.note;
  const stableDocumentId = randomUUID();
  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: preset.title,
      sourceLabel: preset.sourceLabel,
      blocks: {
        create: preset.blocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? body : null,
          body,
          sourceLabel: preset.sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}

export async function renameDocumentAction(projectSlug: string, documentId: string, nextTitle: string) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to rename a document.");
  }

  const trimmedTitle = nextTitle.trim().replace(/\s+/g, " ");
  if (!trimmedTitle) {
    throw new Error("A page needs a title.");
  }

  if (trimmedTitle.length > 160) {
    throw new Error("Keep page titles under 160 characters.");
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
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const document = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!document) {
    throw new Error("Document not found in this Nest.");
  }

  if (document.title === trimmedTitle) {
    revalidatePath(`/create`);
    return { ok: true, title: trimmedTitle };
  }

  await prisma.studioDocument.update({
    where: { id: document.id },
    data: { title: trimmedTitle },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return { ok: true, title: trimmedTitle };
}

export async function duplicateDocumentAsDraftAction(projectSlug: string, documentId: string) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to duplicate a document.");
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
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const sourceDocument = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
    },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!sourceDocument) {
    throw new Error("Document not found in this Nest.");
  }

  const stableDocumentId = randomUUID();
  const sourceLabel = [
    "document-kind:draft",
    "draft-kind:branch",
    `branched-from-document:${sourceDocument.id}`,
    sourceDocument.sourceLabel ? `branched-from-label:${sourceDocument.sourceLabel}` : null,
  ].filter(Boolean).join(";");

  const duplicate = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: `${sourceDocument.title} - Draft Copy`,
      sourceLabel,
      blocks: {
        create: sourceDocument.blocks.map((block, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: block.title,
          body: block.body,
          sourceLabel,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return {
    ok: true,
    documentId: duplicate.id,
    href: `/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(duplicate.id)}`,
  };
}

export async function promoteNoteToWritingPageAction(projectSlug: string, documentId: string) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to promote a note.");
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
    select: { id: true, slug: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const sourceDocument = await prisma.studioDocument.findFirst({
    where: {
      id: documentId,
      projectId: project.id,
    },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!sourceDocument) {
    throw new Error("Document not found in this Nest.");
  }

  if (!String(sourceDocument.sourceLabel ?? "").toLowerCase().includes("document-kind:note")) {
    throw new Error("Only quick notes can be promoted into writing pages.");
  }

  const stableDocumentId = randomUUID();
  const sourceLabel = [
    "document-kind:draft",
    "draft-kind:promoted-note",
    `promoted-from-document:${sourceDocument.id}`,
    sourceDocument.sourceLabel ? `promoted-from-label:${sourceDocument.sourceLabel}` : null,
  ].filter(Boolean).join(";");

  const title = sourceDocument.title.toLowerCase().includes("note")
    ? sourceDocument.title.replace(/\bnote\b/gi, "Draft").trim()
    : `${sourceDocument.title} - Writing Draft`;

  const promoted = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: title || `${sourceDocument.title} - Writing Draft`,
      sourceLabel,
      blocks: {
        create: sourceDocument.blocks.map((block, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: block.title,
          body: block.body,
          sourceLabel,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  return {
    ok: true,
    documentId: promoted.id,
    href: `/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(promoted.id)}`,
  };
}

export async function importHgoEpisodeSourceAction(projectSlug: string, sourceKey: HgoSourceKey) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to import a source document.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  if (projectSlug !== "high-ground-odyssey-manuscript") {
    throw new Error("HGO episode source import is only available inside the High Ground Odyssey Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const source = resolveHgoSource(sourceKey);
  const sourceLabel = [
    "document-kind:fixed-source",
    "hgo-source-family:podcast-year-1",
    `hgo-source:${source.key}`,
    `source-path:${source.relativePath}`,
  ].join(";");

  const existing = await prisma.studioDocument.findFirst({
    where: {
      projectId: project.id,
      sourceLabel: { contains: `hgo-source:${source.key}` },
    },
    select: { id: true },
  });

  if (existing) {
    redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(existing.id)}`);
  }

  if (!existsSync(/* turbopackIgnore: true */ source.sourcePath)) {
    throw new Error(`HGO source file is missing: ${source.sourcePath}`);
  }

  const rawText = await readFile(/* turbopackIgnore: true */ source.sourcePath, "utf-8");
  const stableDocumentId = randomUUID();
  const provenanceBlock = [
    `${source.label}`,
    "",
    "Quipsly imported this as a fixed Study Source document.",
    `Source family: Podcast Year 1`,
    `Source path: ${source.sourcePath}`,
    `Relative path: ${source.relativePath}`,
    "Safety rule: tag, annotate, cite, and draft from this source; do not silently replace the living manuscript with it.",
  ].join("\n");
  const sourceBlocks = [
    source.label,
    provenanceBlock,
    ...chunkSourceText(rawText),
  ];

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title: source.label,
      sourceLabel,
      blocks: {
        create: sourceBlocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? source.label : null,
          body,
          sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}

export async function createHgoEpisodeDraftShellAction(projectSlug: string, sourceKey: HgoSourceKey) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    throw new Error("UNAUTHORIZED: Must be logged in to create an episode draft.");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
  });

  if (!access.allowed) {
    throw new Error("UNAUTHORIZED: You do not have write access to this Nest.");
  }

  if (projectSlug !== "high-ground-odyssey-manuscript") {
    throw new Error("HGO episode draft shells are only available inside the High Ground Odyssey Nest.");
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const source = resolveHgoSource(sourceKey);
  const episodeNumber = source.key.replace("episode-", "");
  const sourceLabel = [
    "document-kind:draft",
    "hgo-draft-kind:episode-page",
    `hgo-source:${source.key}`,
    "source-family:podcast-year-1",
  ].join(";");

  const existing = await prisma.studioDocument.findFirst({
    where: {
      projectId: project.id,
      sourceLabel: { contains: `hgo-draft-kind:episode-page;hgo-source:${source.key}` },
    },
    select: { id: true },
  });

  if (existing) {
    redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(existing.id)}`);
  }

  const stableDocumentId = randomUUID();
  const title = `Episode ${episodeNumber} Draft / Episode Page`;
  const blocks = [
    title,
    [
      `Source-linked draft shell for ${source.label}.`,
      `Source family: Podcast Year 1`,
      `Source path: ${source.sourcePath}`,
      "",
      "Use this document for episode-page copy, article drafts, manuscript connective tissue, social descriptions, and human/AI co-writing.",
      "Drafting is allowed here. Promotion into the living manuscript or public publishing remains a separate reviewed action.",
    ].join("\n"),
    "Working thesis / hook\n\nWhat is the useful promise of this episode for a reader, listener, or viewer?",
    "Episode page draft\n\nStart with a human-useful summary, then add sections, quotes, links, and source-backed notes.",
    "Book/manuscript candidate notes\n\nIf this episode reveals a stronger chapter idea, capture it here before promoting anything.",
    "Platform copy seeds\n\nYouTube description:\n\nPodcast/RSS summary:\n\nPatreon/support note:\n\nShorts/social hooks:",
  ];

  const document = await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: stableDocumentId,
      title,
      sourceLabel,
      blocks: {
        create: blocks.map((body, index) => ({
          stableId: `${stableDocumentId}-block-${index + 1}`,
          order: index,
          title: index === 0 ? title : null,
          body,
          sourceLabel,
        })),
      },
    },
  });

  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/create`);
  redirect(`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`);
}
