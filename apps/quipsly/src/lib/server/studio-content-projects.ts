import "server-only";

import type { Prisma, StudioContentProject } from "@prisma/client";

import {
  CONTENT_STUDIO_SCHEMA_VERSION,
  createContentStudioProductionPacket,
  createContentStudioProjectHandoff,
  isContentStudioProject,
  type ContentStudioProject as ContentStudioProjectInput,
} from "@/app/content-studio/content-studio-model";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeStudioAuthEmail } from "@/lib/server/studio-auth-mode";

const MAX_CONTENT_STUDIO_DESCRIPTION_LENGTH = 500;
const MAX_CONTENT_STUDIO_NOTES_LENGTH = 5000;
const MAX_CONTENT_STUDIO_PROJECT_LIMIT = 50;
const MAX_CONTENT_STUDIO_TITLE_LENGTH = 140;

type StudioContentProjectRecord = StudioContentProject;

export type StudioContentProjectSummary = {
  id: string;
  ownerEmail: string;
  localProjectId: string;
  title: string;
  kind: string;
  status: string;
  stage: string;
  description: string | null;
  notes: string | null;
  schemaVersion: number;
  clientUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioContentProjectDetail = StudioContentProjectSummary & {
  project: ContentStudioProjectInput;
  handoff: ReturnType<typeof createContentStudioProjectHandoff>;
  productionPacket: ReturnType<typeof createContentStudioProductionPacket> | null;
};

export type SafeContentStudioProjectInputResult =
  | {
      project: ContentStudioProjectInput;
      errors: [];
    }
  | {
      project: null;
      errors: string[];
    };

function normalizeOwnerEmail(email: string) {
  return normalizeStudioAuthEmail(email);
}

function normalizeTitle(title: string | null | undefined) {
  const normalized = String(title ?? "").trim();

  return (normalized || "Untitled Content Studio project").slice(
    0,
    MAX_CONTENT_STUDIO_TITLE_LENGTH,
  );
}

function normalizeDescription(description: string | null | undefined) {
  const normalized = String(description ?? "").trim();

  return normalized
    ? normalized.slice(0, MAX_CONTENT_STUDIO_DESCRIPTION_LENGTH)
    : null;
}

function normalizeNotes(notes: string | null | undefined) {
  const normalized = String(notes ?? "").trim();

  return normalized ? normalized.slice(0, MAX_CONTENT_STUDIO_NOTES_LENGTH) : null;
}

function parseClientUpdatedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeStoredProject(value: unknown): ContentStudioProjectInput {
  if (isContentStudioProject(value)) {
    return value;
  }

  throw new Error("Stored Content Studio project failed validation.");
}

function mapProjectSummary(
  project: StudioContentProjectRecord,
): StudioContentProjectSummary {
  return {
    id: project.id,
    ownerEmail: project.ownerEmail,
    localProjectId: project.localProjectId,
    title: project.title,
    kind: project.kind,
    status: project.status,
    stage: project.stage,
    description: project.description,
    notes: project.notes,
    schemaVersion: project.schemaVersion,
    clientUpdatedAt: project.clientUpdatedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function mapProjectDetail(
  project: StudioContentProjectRecord,
): StudioContentProjectDetail {
  const storedProject = safeStoredProject(project.projectJson);
  const productionPacket = createContentStudioProductionPacket(storedProject);

  return {
    ...mapProjectSummary(project),
    project: storedProject,
    handoff: createContentStudioProjectHandoff(storedProject),
    productionPacket,
  };
}

export function safeContentStudioProjectInput(
  value: unknown,
): SafeContentStudioProjectInputResult {
  if (isContentStudioProject(value)) {
    return {
      project: value,
      errors: [],
    };
  }

  return {
    project: null,
    errors: ["Content Studio project did not match the expected project shape."],
  };
}

export async function listStudioContentProjects(input: {
  ownerEmail: string;
  limit?: number;
}): Promise<StudioContentProjectSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 25), 1),
    MAX_CONTENT_STUDIO_PROJECT_LIMIT,
  );

  const projects = await prisma.studioContentProject.findMany({
    where: { ownerEmail },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return projects.map(mapProjectSummary);
}

export async function getStudioContentProject(input: {
  ownerEmail: string;
  projectId: string;
}): Promise<StudioContentProjectDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const projectId = input.projectId.trim();

  if (!projectId) {
    return null;
  }

  const prisma = getPrismaClient();
  const project = await prisma.studioContentProject.findFirst({
    where: {
      id: projectId,
      ownerEmail,
    },
  });

  return project ? mapProjectDetail(project) : null;
}

export async function upsertStudioContentProject(input: {
  ownerEmail: string;
  project: ContentStudioProjectInput;
  description?: string | null;
}): Promise<StudioContentProjectDetail> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const handoff = createContentStudioProjectHandoff(input.project);
  const productionPacket = createContentStudioProductionPacket(input.project);

  const project = await prisma.studioContentProject.upsert({
    where: {
      ownerEmail_localProjectId: {
        ownerEmail,
        localProjectId: input.project.id,
      },
    },
    update: {
      title: normalizeTitle(input.project.title),
      kind: input.project.kind,
      status: input.project.status,
      stage: input.project.activeStage,
      description: normalizeDescription(input.description),
      notes: normalizeNotes(input.project.notes),
      schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
      projectJson: input.project as unknown as Prisma.InputJsonValue,
      handoffJson: handoff as unknown as Prisma.InputJsonValue,
      productionPacketJson: productionPacket as unknown as Prisma.InputJsonValue,
      clientUpdatedAt: parseClientUpdatedAt(input.project.updatedAt),
    },
    create: {
      ownerEmail,
      localProjectId: input.project.id,
      title: normalizeTitle(input.project.title),
      kind: input.project.kind,
      status: input.project.status,
      stage: input.project.activeStage,
      description: normalizeDescription(input.description),
      notes: normalizeNotes(input.project.notes),
      schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
      projectJson: input.project as unknown as Prisma.InputJsonValue,
      handoffJson: handoff as unknown as Prisma.InputJsonValue,
      productionPacketJson: productionPacket as unknown as Prisma.InputJsonValue,
      clientUpdatedAt: parseClientUpdatedAt(input.project.updatedAt),
    },
  });

  return mapProjectDetail(project);
}
