import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { listProjectsVisibleToEmail } from "./home-nest";
import { normalizeWorkTagLabel, workTagSlug } from "./work-tag-normalization";

export { normalizeWorkTagLabel, workTagSlug } from "./work-tag-normalization";

export type WorkTagEntityKind = "task" | "goal" | "session" | "note" | "document";

export type ReplaceWorkTagsResult =
  | {
      ok: true;
      entityKind: WorkTagEntityKind;
      entityId: string;
      projectId: string;
      tagIds: string[];
      requestedTagIds: string[];
      newTagLabels: string[];
      resolvedTags: Array<{ id: string; requestedLabel: string; label: string; slug: string; created: boolean }>;
      updatedAt: Date;
      tagRevision: number | null;
      receiptId: string;
      idempotentReplay: boolean;
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT"; error: string };

export type CreateAndAssignWorkTagResult =
  | {
      ok: true;
      entityKind: WorkTagEntityKind;
      entityId: string;
      projectId: string;
      tag: { id: string; label: string; slug: string; category: string; projectId: string };
      created: boolean;
      assignmentChanged: boolean;
      updatedAt: Date;
      tagRevision: number | null;
      receiptId: string;
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ARCHIVED"; error: string };

export type WorkTagTaxonomyOperation = "RENAME" | "ARCHIVE" | "RESTORE";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateWorkTagTaxonomyResult =
  | {
      ok: true;
      projectId: string;
      tag: {
        id: string;
        label: string;
        slug: string;
        isActive: boolean;
        archivedAt: Date | null;
        updatedAt: Date;
      };
      aliases: Array<{ id: string; label: string; slug: string }>;
      created: boolean;
      revision: number;
      receiptId: string | null;
    }
  | {
      ok: false;
      code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "ARCHIVED" | "SLUG_CONFLICT";
      error: string;
    };

export type MutateWorkTagTaxonomyResult =
  | {
      ok: true;
      operation: WorkTagTaxonomyOperation;
      projectId: string;
      tag: { id: string; label: string; slug: string; isActive: boolean; archivedAt: Date | null; updatedAt: Date };
      aliases: Array<{ id: string; label: string; slug: string }>;
      revision: number;
      receiptId: string;
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ALREADY_ACTIVE" | "ALREADY_ARCHIVED" | "MERGED"; error: string };

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedTagIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 24) return null;
  const ids = [...new Set(value.map(cleanId).filter(Boolean))];
  return ids.length === value.length ? ids : null;
}

function normalizedNewTagLabels(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  const labels = value.map(normalizeWorkTagLabel);
  if (labels.some((label) => !label)) return null;
  const canonical = labels.map(canonicalTagLabel);
  if (new Set(canonical).size !== labels.length) return null;
  return labels;
}

function canonicalTagLabel(label: string) {
  return label.normalize("NFKC").toLocaleLowerCase("en-US");
}

const reusableProjectTagSelect = {
  id: true,
  projectId: true,
  slug: true,
  label: true,
  category: true,
  isActive: true,
} satisfies Prisma.StudioTagSelect;

export type ReusableProjectTag = Prisma.StudioTagGetPayload<{
  select: typeof reusableProjectTagSelect;
}>;

export type ResolveReusableProjectTagResult =
  | { ok: true; tag: ReusableProjectTag; created: boolean }
  | { ok: false; code: "INVALID_INPUT" | "ARCHIVED"; error: string }
  | { ok: false; code: "SLUG_CONFLICT"; error: string; existingLabel: string };

/**
 * Resolve one human-entered label to the canonical private Nest vocabulary.
 * Former names follow aliases or merge redirects; ambiguous slug collisions
 * fail closed. Callers must prove write access before entering this transaction.
 */
export async function resolveReusableProjectTag(input: {
  tx: Prisma.TransactionClient;
  projectId: string;
  label: unknown;
}): Promise<ResolveReusableProjectTagResult> {
  const projectId = cleanId(input.projectId);
  const label = normalizeWorkTagLabel(input.label);
  const slug = label ? workTagSlug(label) : "";
  if (!projectId || !label || !slug) {
    return { ok: false, code: "INVALID_INPUT", error: "Enter a reusable tag name of 80 characters or fewer." };
  }

  const directTag = await input.tx.studioTag.findUnique({
    where: { projectId_slug: { projectId, slug } },
    select: {
      ...reusableProjectTagSelect,
      mergedInto: { select: reusableProjectTagSelect },
    },
  });
  let tag: ReusableProjectTag | null = directTag?.mergedInto ?? directTag;
  let resolvedFormerName = Boolean(directTag?.mergedInto);

  if (!tag) {
    const alias = await input.tx.studioTagAlias.findUnique({
      where: { projectId_slug: { projectId, slug } },
      select: {
        label: true,
        tag: { select: reusableProjectTagSelect },
      },
    });
    if (alias) {
      if (canonicalTagLabel(alias.label) !== canonicalTagLabel(label)) {
        return {
          ok: false,
          code: "SLUG_CONFLICT",
          existingLabel: alias.label,
          error: `“${label}” conflicts with the existing “${alias.label}” tag. Choose a more distinct name.`,
        };
      }
      tag = alias.tag;
      resolvedFormerName = true;
    }
  }

  if (tag) {
    if (!tag.isActive) {
      return {
        ok: false,
        code: "ARCHIVED",
        error: "That tag is archived. Restore or rename it from the Nest vocabulary before using it.",
      };
    }
    const resolvesByAlias = await input.tx.studioTagAlias.findFirst({
      where: {
        projectId,
        tagId: tag.id,
        slug,
        label: { equals: label, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (
      canonicalTagLabel(tag.label) !== canonicalTagLabel(label)
      && !resolvesByAlias
      && !resolvedFormerName
    ) {
      return {
        ok: false,
        code: "SLUG_CONFLICT",
        existingLabel: tag.label,
        error: `“${label}” conflicts with the existing “${tag.label}” tag. Choose a more distinct name.`,
      };
    }
    return { ok: true, tag, created: false };
  }

  const created = await input.tx.studioTag.create({
    data: {
      projectId,
      slug,
      label,
      category: "meaning",
      nodeType: "source_note",
      isPrivate: true,
      isActive: true,
    },
    select: reusableProjectTagSelect,
  });
  return { ok: true, tag: created, created: true };
}

async function writableProjectIds(prisma: PrismaClient, actorEmail: string) {
  const visibleProjects = await listProjectsVisibleToEmail(actorEmail, prisma);
  return new Set(visibleProjects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id));
}

/**
 * Create or reuse one project-scoped canonical tag without attaching it to a
 * record. This is deliberately online-only vocabulary authoring: the active
 * editor grant is rechecked inside the serializable transaction, creation
 * receives append-only history, and aliases or merge redirects converge on
 * their existing canonical identity.
 */
export async function createWorkTagTaxonomy(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  label: unknown;
}): Promise<CreateWorkTagTaxonomyResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string"
    ? input.actorEmail.trim().toLowerCase()
    : "";
  const projectId = cleanId(input.projectId);
  const label = normalizeWorkTagLabel(input.label);
  if (!actorUserId || !actorEmail || !projectId || !label) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Enter a reusable tag name of 80 characters or fewer.",
    };
  }

  const visibleProjects = await listProjectsVisibleToEmail(
    actorEmail,
    input.prisma,
  );
  const visibleProject = visibleProjects.find((project) => project.id === projectId);
  if (!visibleProject) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "That Nest is not available to this account.",
    };
  }
  if (visibleProject.role !== "OWNER" && visibleProject.role !== "EDITOR") {
    return {
      ok: false,
      code: "FORBIDDEN",
      error: "Editor access to this Nest is required to create reusable vocabulary.",
    };
  }

  const prisma = input.prisma as any;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const activeGrant = await tx.studioProjectAccessGrant.findFirst({
          where: {
            projectId,
            email: actorEmail,
            status: "ACTIVE",
            role: { in: ["OWNER", "EDITOR"] },
          },
          select: { id: true },
        });
        if (!activeGrant) return { kind: "forbidden" as const };

        const resolved = await resolveReusableProjectTag({
          tx,
          projectId,
          label,
        });
        if (!resolved.ok) return { kind: "rejected" as const, result: resolved };

        let receiptId: string | null = null;
        let revision = 0;
        if (resolved.created) {
          receiptId = randomUUID();
          revision = 1;
          await tx.studioTagRevision.create({
            data: {
              tagId: resolved.tag.id,
              revision,
              operation: "create",
              actorUserId,
              snapshotJson: {
                kind: "quipsly-tag-taxonomy-v1",
                receiptId,
                projectId,
                before: null,
                after: {
                  label: resolved.tag.label,
                  slug: resolved.tag.slug,
                  isActive: true,
                  archivedAt: null,
                },
                assignmentChanged: false,
                externalSideEffects: false,
              },
            },
          });
        } else {
          const latest = await tx.studioTagRevision.aggregate({
            where: { tagId: resolved.tag.id },
            _max: { revision: true },
          });
          revision = latest._max.revision ?? 0;
        }

        const saved = await tx.studioTag.findUnique({
          where: { id: resolved.tag.id },
          select: {
            id: true,
            label: true,
            slug: true,
            isActive: true,
            archivedAt: true,
            updatedAt: true,
            aliases: {
              orderBy: { createdAt: "asc" },
              select: { id: true, label: true, slug: true },
            },
          },
        });
        return {
          kind: "saved" as const,
          saved,
          created: resolved.created,
          revision,
          receiptId,
        };
      }, { isolationLevel: "Serializable", timeout: 30_000 });

      if (result.kind === "forbidden") {
        return {
          ok: false,
          code: "FORBIDDEN",
          error: "Editor access to this Nest is required to create reusable vocabulary.",
        };
      }
      if (result.kind === "rejected") return result.result;
      if (!result.saved) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: "The canonical tag could not be read after creation.",
        };
      }
      return {
        ok: true,
        projectId,
        tag: result.saved,
        aliases: result.saved.aliases,
        created: result.created,
        revision: result.revision,
        receiptId: result.receiptId,
      };
    } catch (error) {
      const code = String(safeRecord(error).code || "");
      if (attempt === 0 && (code === "P2002" || code === "P2034")) continue;
      throw error;
    }
  }
  throw new Error("The bounded canonical tag creation retry was exhausted.");
}

function entityWhere(entityKind: WorkTagEntityKind, entityId: string, actorUserId: string) {
  return entityKind === "task"
    ? { id: entityId, assignedUserId: actorUserId }
    : entityKind === "goal"
      ? { id: entityId, ownerUserId: actorUserId }
      : entityKind === "note"
        ? { id: entityId, authorUserId: actorUserId }
        : entityKind === "document"
          ? {
              id: entityId,
              OR: [
                { personalOwnerUserId: null },
                { personalOwnerUserId: actorUserId },
              ],
            }
        : { id: entityId, createdByUserId: actorUserId };
}

function entityModel(prisma: any, entityKind: WorkTagEntityKind) {
  return entityKind === "task"
    ? prisma.actionItem
    : entityKind === "goal"
      ? prisma.goal
      : entityKind === "note"
        ? prisma.coachingNote
        : entityKind === "document"
          ? prisma.studioDocument
        : prisma.callRoom;
}

function entitySourceField(entityKind: WorkTagEntityKind) {
  return entityKind === "document"
    ? null
    : entityKind === "session"
      ? "metadataJson"
      : "sourceJson";
}

function entityMutationLabel(entityKind: WorkTagEntityKind) {
  return entityKind === "document" ? "Nest editor" : `${entityKind} owner`;
}

async function findOwnedTagEntity(
  prisma: any,
  entityKind: WorkTagEntityKind,
  entityId: string,
  actorUserId: string,
  expectedUpdatedAt?: Date,
  expectedProjectId?: string,
  receiptId?: string,
  expectedTagRevision?: number,
) {
  const where: any = {
    ...entityWhere(entityKind, entityId, actorUserId),
    ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
  };
  if (entityKind === "note") {
    if (expectedProjectId) where.room = { projectId: expectedProjectId };
    const note = await prisma.coachingNote.findFirst({
      where,
      select: { id: true, roomId: true, updatedAt: true, sourceJson: true, room: { select: { projectId: true } } },
    });
    return note ? { ...note, projectId: note.room?.projectId ?? null } : null;
  }
  if (entityKind === "document") {
    return prisma.studioDocument.findFirst({
      where: {
        ...where,
        ...(expectedProjectId ? { projectId: expectedProjectId } : {}),
        ...(expectedTagRevision !== undefined ? { tagRevision: expectedTagRevision } : {}),
      },
      select: {
        id: true,
        projectId: true,
        updatedAt: true,
        tagRevision: true,
        tagLinks: {
          orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
          select: { tagId: true },
        },
        documentOperations: receiptId ? {
          where: {
            groupId: receiptId,
            operationType: { in: ["create-document-tag", "replace-document-tags"] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { afterJson: true },
        } : {
          where: { id: "__no-document-tag-receipt__" },
          take: 1,
          select: { afterJson: true },
        },
      },
    });
  }
  const sourceField = entitySourceField(entityKind) ?? "sourceJson";
  return entityModel(prisma, entityKind).findFirst({
    where: {
      ...where,
      ...(expectedProjectId ? { projectId: expectedProjectId } : {}),
    },
    select: { id: true, projectId: true, updatedAt: true, [sourceField]: true },
  });
}

/**
 * Create one reusable Nest tag and apply it to the current record in the same
 * transaction. Exact-label retries reuse the canonical tag; ambiguous slug
 * collisions and archived vocabulary fail closed instead of silently merging.
 */
export async function createAndAssignWorkEntityTag(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  entityKind: WorkTagEntityKind;
  entityId: string;
  label: string;
  expectedUpdatedAt: Date;
  expectedTagRevision?: number;
}): Promise<CreateAndAssignWorkTagResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const entityId = cleanId(input.entityId);
  const label = normalizeWorkTagLabel(input.label);
  const slug = label ? workTagSlug(label) : "";
  const documentRevisionValid = input.entityKind !== "document"
    || (Number.isInteger(input.expectedTagRevision) && Number(input.expectedTagRevision) >= 0);
  if (!actorUserId || !actorEmail || !entityId || !label || !slug
    || !Number.isFinite(input.expectedUpdatedAt?.getTime()) || !documentRevisionValid) {
    return { ok: false, code: "INVALID_INPUT", error: "Enter a reusable tag name of 80 characters or fewer." };
  }

  const prisma = input.prisma as any;
  const ownerWhere = entityWhere(input.entityKind, entityId, actorUserId);
  const sourceField = entitySourceField(input.entityKind);
  const entity = await findOwnedTagEntity(prisma, input.entityKind, entityId, actorUserId);
  if (!entity) return { ok: false, code: "NOT_FOUND", error: `Only a ${entityMutationLabel(input.entityKind)} can create and apply these tags.` };
  if (!entity.projectId) return { ok: false, code: "PROJECT_REQUIRED", error: "Choose a Nest before creating a reusable tag." };
  if (input.entityKind === "document") {
    if (entity.tagRevision !== input.expectedTagRevision) {
      return { ok: false, code: "CONFLICT", error: "These document tags changed elsewhere. Refresh before creating a tag." };
    }
  } else if (entity.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before creating a tag." };
  }

  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(entity.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to create tags." };

  const receiptId = randomUUID();
  const now = new Date();
  const result = await prisma.$transaction(async (tx: any) => {
    const activeGrant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: entity.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!activeGrant) return { kind: "forbidden" as const };

    const currentEntity = await findOwnedTagEntity(
      tx,
      input.entityKind,
      entityId,
      actorUserId,
      input.entityKind === "document" ? undefined : input.expectedUpdatedAt,
      entity.projectId,
      undefined,
      input.entityKind === "document" ? input.expectedTagRevision : undefined,
    );
    if (!currentEntity) return { kind: "conflict" as const };

    const resolvedTag = await resolveReusableProjectTag({
      tx: tx as Prisma.TransactionClient,
      projectId: entity.projectId,
      label,
    });
    if (!resolvedTag.ok) {
      if (resolvedTag.code === "ARCHIVED") return { kind: "archived" as const };
      return {
        kind: "slug-conflict" as const,
        existingLabel: resolvedTag.code === "SLUG_CONFLICT" ? resolvedTag.existingLabel : label,
      };
    }
    const { tag, created } = resolvedTag;

    const receipt = {
      id: receiptId,
      kind: "quipsly-work-tag-create-v1",
      entityKind: input.entityKind,
      projectId: entity.projectId,
      tagId: tag.id,
      tagSlug: tag.slug,
      tagLabel: tag.label,
      created,
      changedAt: now.toISOString(),
      changedByUserId: actorUserId,
      externalSideEffects: false,
    };
    const sourceJson = { source: "quipsly-work-tag-create-v1", receiptId, externalSideEffects: false };
    if (input.entityKind === "document") {
      const beforeTagIds = currentEntity.tagLinks.map((link: { tagId: string }) => link.tagId).sort();
      const alreadyAssigned = beforeTagIds.includes(tag.id);
      let updatedAt = currentEntity.updatedAt as Date;
      if (!alreadyAssigned) {
        const update = await tx.studioDocument.updateMany({
          where: {
            id: entityId,
            projectId: entity.projectId,
            tagRevision: input.expectedTagRevision,
            OR: [
              { personalOwnerUserId: null },
              { personalOwnerUserId: actorUserId },
            ],
          },
          data: { tagRevision: { increment: 1 } },
        });
        if (update.count !== 1) return { kind: "conflict" as const };
        await tx.studioDocumentTagLink.create({
          data: { documentId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson },
        });
        updatedAt = (await tx.studioDocument.findUnique({
          where: { id: entityId },
          select: { updatedAt: true },
        })).updatedAt as Date;
      }
      const afterTagIds = [...new Set([...beforeTagIds, tag.id])].sort();
      await tx.studioDocumentOperation.create({
        data: {
          projectId: entity.projectId,
          documentId: entityId,
          groupId: receiptId,
          actorEmail,
          origin: "human",
          operationType: "create-document-tag",
          status: alreadyAssigned ? "no-op" : "applied",
          beforeJson: { tagIds: beforeTagIds, tagRevision: currentEntity.tagRevision },
          afterJson: {
            ...receipt,
            tagIds: afterTagIds,
            tagRevision: alreadyAssigned ? currentEntity.tagRevision : currentEntity.tagRevision + 1,
          },
          payloadJson: {
            schema: "quipsly-document-tag-create-v1",
            sourceMutated: false,
            externalSideEffects: false,
          },
          reversible: true,
        },
      });
      return {
        kind: "saved" as const,
        tag,
        created,
        assignmentChanged: !alreadyAssigned,
        updatedAt,
        tagRevision: alreadyAssigned ? currentEntity.tagRevision : currentEntity.tagRevision + 1,
      };
    }

    const update = await entityModel(tx, input.entityKind).updateMany({
      where: {
        ...ownerWhere,
        ...(input.entityKind === "note" ? { room: { projectId: entity.projectId } } : { projectId: entity.projectId }),
        updatedAt: input.expectedUpdatedAt,
      },
      data: { [sourceField!]: { ...safeRecord(currentEntity[sourceField!]), lastTagReceipt: receipt } },
    });
    if (update.count !== 1) return { kind: "conflict" as const };

    if (input.entityKind === "task") {
      await tx.actionItemTagLink.createMany({ data: [{ actionItemId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else if (input.entityKind === "goal") {
      await tx.goalTagLink.createMany({ data: [{ goalId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else if (input.entityKind === "note") {
      await tx.coachingNoteTagLink.createMany({ data: [{ noteId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else if (input.entityKind === "session") {
      await tx.callRoomTagLink.createMany({ data: [{ roomId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    }
    const saved = await entityModel(tx, input.entityKind).findUnique({ where: { id: entityId }, select: { updatedAt: true } });
    return {
      kind: "saved" as const,
      tag,
      created,
      assignmentChanged: true,
      updatedAt: saved.updatedAt as Date,
      tagRevision: null,
    };
  });

  if (result.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to create tags." };
  if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before creating a tag." };
  if (result.kind === "archived") return { ok: false, code: "ARCHIVED", error: "That tag is archived. Restore or rename it from the Nest vocabulary before using it." };
  if (result.kind === "slug-conflict") return { ok: false, code: "SLUG_CONFLICT", error: `“${label}” conflicts with the existing “${result.existingLabel}” tag. Choose a more distinct name.` };
  return {
    ok: true,
    entityKind: input.entityKind,
    entityId,
    projectId: entity.projectId,
    tag: { id: result.tag.id, label: result.tag.label, slug: result.tag.slug, category: String(result.tag.category), projectId: result.tag.projectId },
    created: result.created,
    assignmentChanged: result.assignmentChanged,
    updatedAt: result.updatedAt,
    tagRevision: result.tagRevision,
    receiptId,
  };
}

/**
 * Replace one private entity's complete tag set. This deliberately does not
 * offer a polymorphic public write: each branch enforces the entity's own
 * ownership rule and writes its own explicit join table.
 */
export async function replaceWorkEntityTags(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  entityKind: WorkTagEntityKind;
  entityId: string;
  tagIds: string[];
  newTagLabels?: string[];
  expectedUpdatedAt: Date;
  expectedTagRevision?: number;
  clientRequestId?: string;
  surface?: "nest-work" | "nest-writing" | "ios-capture-today";
}): Promise<ReplaceWorkTagsResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const entityId = cleanId(input.entityId);
  const requestedTagIds = normalizedTagIds(input.tagIds);
  const newTagLabels = normalizedNewTagLabels(input.newTagLabels);
  const clientRequestId = cleanId(input.clientRequestId);
  const documentRevisionValid = input.entityKind !== "document"
    || (Number.isInteger(input.expectedTagRevision) && Number(input.expectedTagRevision) >= 0);
  if (!actorUserId || !actorEmail || !entityId || !requestedTagIds || !newTagLabels
    || requestedTagIds.length + newTagLabels.length > 24
    || !Number.isFinite(input.expectedUpdatedAt?.getTime())
    || !documentRevisionValid
    || (clientRequestId && !UUID_PATTERN.test(clientRequestId))) {
    return { ok: false, code: "INVALID_INPUT", error: "The tag decision is incomplete or invalid." };
  }

  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  const prisma = input.prisma as any;
  const receiptId = clientRequestId ? `work-tags-${clientRequestId}` : randomUUID();
  const entity = await findOwnedTagEntity(
    prisma,
    input.entityKind,
    entityId,
    actorUserId,
    undefined,
    undefined,
    input.entityKind === "document" ? receiptId : undefined,
  );

  if (!entity) return { ok: false, code: "NOT_FOUND", error: `Only a ${entityMutationLabel(input.entityKind)} can change these tags.` };
  if (!entity.projectId) return { ok: false, code: "PROJECT_REQUIRED", error: "Choose a Nest before adding its tags." };
  if (!writableProjects.has(entity.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to change tags." };
  const priorReceipt = input.entityKind === "document"
    ? safeRecord(entity.documentOperations[0]?.afterJson)
    : safeRecord(safeRecord(entity[entitySourceField(input.entityKind)!]).lastTagReceipt);
  if (priorReceipt.id === receiptId) {
    const priorTagIds = normalizedTagIds(priorReceipt.tagIds);
    const priorRequestedTagIds = normalizedTagIds(priorReceipt.requestedTagIds ?? priorReceipt.tagIds);
    const priorNewTagLabels = normalizedNewTagLabels(priorReceipt.newTagLabels);
    const priorResolvedTags = Array.isArray(priorReceipt.resolvedTags)
      ? priorReceipt.resolvedTags
          .map(safeRecord)
          .map((tag) => ({
            id: cleanId(tag.id),
            requestedLabel: normalizeWorkTagLabel(tag.requestedLabel),
            label: normalizeWorkTagLabel(tag.label),
            slug: cleanId(tag.slug),
            created: tag.created === true,
          }))
          .filter((tag) => tag.id && tag.requestedLabel && tag.label && tag.slug)
      : [];
    const priorFinalTagIds = priorRequestedTagIds
      ? [...new Set([...priorRequestedTagIds, ...priorResolvedTags.map((tag) => tag.id)])].sort()
      : null;
    const receiptIsComplete = priorTagIds !== null
      && priorRequestedTagIds !== null
      && priorNewTagLabels !== null
      && priorResolvedTags.length === priorNewTagLabels.length
      && JSON.stringify(priorResolvedTags.map((tag) => tag.requestedLabel)) === JSON.stringify(priorNewTagLabels)
      && JSON.stringify(priorFinalTagIds) === JSON.stringify(priorTagIds);
    const sameRequest = receiptIsComplete
      && priorReceipt.entityKind === input.entityKind
      && priorReceipt.projectId === entity.projectId
      && priorReceipt.changedByUserId === actorUserId
      && priorReceipt.clientRequestId === clientRequestId
      && JSON.stringify(priorRequestedTagIds) === JSON.stringify(requestedTagIds)
      && JSON.stringify(priorNewTagLabels) === JSON.stringify(newTagLabels);
    if (!sameRequest) return { ok: false, code: "CONFLICT", error: "That phone request identity is already bound to a different tag decision." };
    const receiptRevision = Number(priorReceipt.tagRevision);
    if (input.entityKind === "document") {
      const currentTagIds = entity.tagLinks.map((link: { tagId: string }) => link.tagId).sort();
      if (!Number.isInteger(receiptRevision)
        || entity.tagRevision !== receiptRevision
        || JSON.stringify(currentTagIds) !== JSON.stringify(priorTagIds)) {
        return {
          ok: false,
          code: "CONFLICT",
          error: "That saved document-tag request was superseded by a later change. Refresh before continuing.",
        };
      }
    }
    return {
      ok: true,
      entityKind: input.entityKind,
      entityId,
      projectId: entity.projectId,
      tagIds: priorTagIds,
      requestedTagIds,
      newTagLabels,
      resolvedTags: priorResolvedTags,
      updatedAt: entity.updatedAt,
      tagRevision: input.entityKind === "document" ? receiptRevision : null,
      receiptId,
      idempotentReplay: true,
    };
  }
  if (input.entityKind === "document") {
    if (entity.tagRevision !== input.expectedTagRevision) {
      return { ok: false, code: "CONFLICT", error: "These document tags changed elsewhere. Refresh before changing tags." };
    }
  } else if (entity.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before changing tags." };
  }

  if (requestedTagIds.length) {
    const validTags = await prisma.studioTag.findMany({
      where: { id: { in: requestedTagIds }, projectId: entity.projectId, isActive: true },
      select: { id: true },
    });
    if (validTags.length !== requestedTagIds.length) {
      return { ok: false, code: "FORBIDDEN", error: "Every tag must be active and belong to the record's Nest." };
    }
  }

  const now = new Date();
  const saved = await prisma.$transaction(async (tx: any) => {
    const activeGrant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: entity.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!activeGrant) return { kind: "forbidden" as const };
    if (requestedTagIds.length) {
      const validTagCount = await tx.studioTag.count({ where: { id: { in: requestedTagIds }, projectId: entity.projectId, isActive: true } });
      if (validTagCount !== requestedTagIds.length) return { kind: "forbidden" as const };
    }
    const resolvedTags: Array<{ id: string; requestedLabel: string; label: string; slug: string; created: boolean }> = [];
    for (const label of newTagLabels) {
      const resolved = await resolveReusableProjectTag({
        tx: tx as Prisma.TransactionClient,
        projectId: entity.projectId,
        label,
      });
      if (!resolved.ok) {
        if (resolved.code === "ARCHIVED") return { kind: "archived" as const };
        if (resolved.code === "SLUG_CONFLICT") {
          return { kind: "slug-conflict" as const, label, existingLabel: resolved.existingLabel };
        }
        return { kind: "invalid" as const };
      }
      resolvedTags.push({
        id: resolved.tag.id,
        requestedLabel: label,
        label: resolved.tag.label,
        slug: resolved.tag.slug,
        created: resolved.created,
      });
    }
    const tagIds = [...new Set([...requestedTagIds, ...resolvedTags.map((tag) => tag.id)])].sort();
    if (tagIds.length > 24) return { kind: "invalid" as const };
    const receipt = {
      id: receiptId,
      kind: "quipsly-work-tags-v1",
      entityKind: input.entityKind,
      projectId: entity.projectId,
      requestedTagIds,
      newTagLabels,
      tagIds,
      resolvedTags,
      changedAt: now.toISOString(),
      changedByUserId: actorUserId,
      clientRequestId: clientRequestId || null,
      surface: input.surface ?? "nest-work",
      externalSideEffects: false,
    };
    if (input.entityKind === "document") {
      const currentDocument = await findOwnedTagEntity(
        tx,
        "document",
        entityId,
        actorUserId,
        undefined,
        entity.projectId,
        receiptId,
        input.expectedTagRevision,
      );
      if (!currentDocument) return { kind: "conflict" as const };
      const beforeTagIds = currentDocument.tagLinks
        .map((link: { tagId: string }) => link.tagId)
        .sort();
      const changed = JSON.stringify(beforeTagIds) !== JSON.stringify(tagIds);
      if (changed) {
        const update = await tx.studioDocument.updateMany({
          where: {
            id: entityId,
            projectId: entity.projectId,
            tagRevision: input.expectedTagRevision,
            OR: [
              { personalOwnerUserId: null },
              { personalOwnerUserId: actorUserId },
            ],
          },
          data: { tagRevision: { increment: 1 } },
        });
        if (update.count !== 1) return { kind: "conflict" as const };
        await tx.studioDocumentTagLink.deleteMany({ where: { documentId: entityId } });
        if (tagIds.length) {
          await tx.studioDocumentTagLink.createMany({
            data: tagIds.map((tagId) => ({
              documentId: entityId,
              tagId,
              createdByUserId: actorUserId,
              sourceJson: { source: "quipsly-document-tags-v1", receiptId, externalSideEffects: false },
            })),
          });
        }
      }
      await tx.studioDocumentOperation.create({
        data: {
          projectId: entity.projectId,
          documentId: entityId,
          groupId: receiptId,
          actorEmail,
          origin: "human",
          operationType: "replace-document-tags",
          status: changed ? "applied" : "no-op",
          beforeJson: {
            tagIds: beforeTagIds,
            tagRevision: currentDocument.tagRevision,
          },
          afterJson: {
            ...receipt,
            tagRevision: currentDocument.tagRevision + (changed ? 1 : 0),
            sourceMutated: false,
          },
          payloadJson: {
            schema: "quipsly-document-tags-v1",
            sourceMutated: false,
            externalSideEffects: false,
          },
          reversible: true,
        },
      });
      return {
        kind: "saved" as const,
        entity: await tx.studioDocument.findUnique({
          where: { id: entityId },
          select: { updatedAt: true, tagRevision: true },
        }),
        tagIds,
        resolvedTags,
      };
    }
    const update = input.entityKind === "task"
      ? await tx.actionItem.updateMany({ where: { id: entityId, assignedUserId: actorUserId, projectId: entity.projectId, updatedAt: input.expectedUpdatedAt }, data: { sourceJson: { ...safeRecord(entity.sourceJson), lastTagReceipt: receipt } } })
      : input.entityKind === "goal"
        ? await tx.goal.updateMany({ where: { id: entityId, ownerUserId: actorUserId, projectId: entity.projectId, updatedAt: input.expectedUpdatedAt }, data: { sourceJson: { ...safeRecord(entity.sourceJson), lastTagReceipt: receipt } } })
        : input.entityKind === "note"
          ? await tx.coachingNote.updateMany({ where: { id: entityId, authorUserId: actorUserId, room: { projectId: entity.projectId }, updatedAt: input.expectedUpdatedAt }, data: { sourceJson: { ...safeRecord(entity.sourceJson), lastTagReceipt: receipt } } })
          : await tx.callRoom.updateMany({ where: { id: entityId, createdByUserId: actorUserId, projectId: entity.projectId, updatedAt: input.expectedUpdatedAt }, data: { metadataJson: { ...safeRecord(entity.metadataJson), lastTagReceipt: receipt } } });
    if (update.count !== 1) return { kind: "conflict" as const };

    const sourceJson = { source: "quipsly-work-tags-v1", receiptId, externalSideEffects: false };
    if (input.entityKind === "task") {
      await tx.actionItemTagLink.deleteMany({ where: { actionItemId: entityId } });
      if (tagIds.length) await tx.actionItemTagLink.createMany({ data: tagIds.map((tagId) => ({ actionItemId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
      return {
        kind: "saved" as const,
        entity: await tx.actionItem.findUnique({ where: { id: entityId }, select: { updatedAt: true } }),
        tagIds,
        resolvedTags,
      };
    }
    if (input.entityKind === "goal") {
      await tx.goalTagLink.deleteMany({ where: { goalId: entityId } });
      if (tagIds.length) await tx.goalTagLink.createMany({ data: tagIds.map((tagId) => ({ goalId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
      return {
        kind: "saved" as const,
        entity: await tx.goal.findUnique({ where: { id: entityId }, select: { updatedAt: true } }),
        tagIds,
        resolvedTags,
      };
    }
    if (input.entityKind === "note") {
      await tx.coachingNoteTagLink.deleteMany({ where: { noteId: entityId } });
      if (tagIds.length) await tx.coachingNoteTagLink.createMany({ data: tagIds.map((tagId) => ({ noteId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
      return {
        kind: "saved" as const,
        entity: await tx.coachingNote.findUnique({ where: { id: entityId }, select: { updatedAt: true } }),
        tagIds,
        resolvedTags,
      };
    }
    await tx.callRoomTagLink.deleteMany({ where: { roomId: entityId } });
    if (tagIds.length) await tx.callRoomTagLink.createMany({ data: tagIds.map((tagId) => ({ roomId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
    return {
      kind: "saved" as const,
      entity: await tx.callRoom.findUnique({ where: { id: entityId }, select: { updatedAt: true } }),
      tagIds,
      resolvedTags,
    };
  });

  if (saved.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access and active same-Nest tags are required." };
  if (saved.kind === "archived") return { ok: false, code: "FORBIDDEN", error: "That tag is archived. Restore or rename it in the Nest vocabulary before using it." };
  if (saved.kind === "slug-conflict") return { ok: false, code: "CONFLICT", error: `“${saved.label}” conflicts with the existing “${saved.existingLabel}” tag. Choose a more distinct name.` };
  if (saved.kind === "invalid") return { ok: false, code: "INVALID_INPUT", error: "Choose no more than 24 canonical tags and valid new names." };
  if (saved.kind === "conflict" || !saved.entity) return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before changing tags." };
  return {
    ok: true,
    entityKind: input.entityKind,
    entityId,
    projectId: entity.projectId,
    tagIds: saved.tagIds,
    requestedTagIds,
    newTagLabels,
    resolvedTags: saved.resolvedTags,
    updatedAt: saved.entity.updatedAt,
    tagRevision: input.entityKind === "document" ? saved.entity.tagRevision : null,
    receiptId,
    idempotentReplay: false,
  };
}

/**
 * Rename, archive, or restore one Nest's reusable vocabulary. Renames retain
 * the former label as an alias, so older iPhone outbox entries and saved human
 * language converge on the same canonical tag.
 */
export async function mutateWorkTagTaxonomy(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  tagId: string;
  operation: WorkTagTaxonomyOperation;
  label?: string;
  expectedUpdatedAt: Date;
}): Promise<MutateWorkTagTaxonomyResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const tagId = cleanId(input.tagId);
  const operation = input.operation;
  const label = operation === "RENAME" ? normalizeWorkTagLabel(input.label) : "";
  if (!actorUserId || !actorEmail || !tagId || !["RENAME", "ARCHIVE", "RESTORE"].includes(operation)
    || (operation === "RENAME" && !label) || !Number.isFinite(input.expectedUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "The vocabulary change is incomplete or invalid." };
  }

  const prisma = input.prisma as any;
  const current = await prisma.studioTag.findUnique({
    where: { id: tagId },
    select: { id: true, projectId: true, label: true, slug: true, isActive: true, archivedAt: true, mergedIntoTagId: true, updatedAt: true },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "That tag no longer exists." };
  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  if (!writableProjects.has(current.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to manage its vocabulary." };
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { ok: false, code: "CONFLICT", error: "This tag changed elsewhere. Refresh before changing it." };
  if (current.mergedIntoTagId) return { ok: false, code: "MERGED", error: "This tag is a preserved merge redirect and cannot be renamed or restored." };
  if (operation === "ARCHIVE" && !current.isActive) return { ok: false, code: "ALREADY_ARCHIVED", error: "This tag is already archived." };
  if (operation === "RESTORE" && current.isActive) return { ok: false, code: "ALREADY_ACTIVE", error: "This tag is already active." };

  const nextSlug = operation === "RENAME" ? workTagSlug(label) : current.slug;
  const receiptId = randomUUID();
  const now = new Date();
  const result = await prisma.$transaction(async (tx: any) => {
    const activeGrant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: current.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!activeGrant) return { kind: "forbidden" as const };
    const fresh = await tx.studioTag.findFirst({
      where: { id: tagId, projectId: current.projectId, updatedAt: input.expectedUpdatedAt },
      select: { id: true, projectId: true, label: true, slug: true, isActive: true, archivedAt: true, mergedIntoTagId: true, updatedAt: true },
    });
    if (!fresh) return { kind: "conflict" as const };

    if (operation === "RENAME") {
      if (!fresh.isActive) return { kind: "already-archived" as const };
      const canonicalConflict = await tx.studioTag.findFirst({
        where: { projectId: current.projectId, slug: nextSlug, id: { not: tagId } },
        select: { label: true },
      });
      const aliasConflict = await tx.studioTagAlias.findFirst({
        where: { projectId: current.projectId, slug: nextSlug, tagId: { not: tagId } },
        select: { label: true },
      });
      if (canonicalConflict || aliasConflict) {
        return { kind: "slug-conflict" as const, existingLabel: (canonicalConflict || aliasConflict).label };
      }
    }

    const latest = await tx.studioTagRevision.aggregate({ where: { tagId }, _max: { revision: true } });
    const revision = (latest._max.revision ?? 0) + 1;
    const nextActive = operation === "ARCHIVE" ? false : operation === "RESTORE" ? true : fresh.isActive;
    const nextArchivedAt = operation === "ARCHIVE" ? now : operation === "RESTORE" ? null : fresh.archivedAt;
    const nextLabel = operation === "RENAME" ? label : fresh.label;
    const before = { label: fresh.label, slug: fresh.slug, isActive: fresh.isActive, archivedAt: fresh.archivedAt?.toISOString() ?? null };
    const after = { label: nextLabel, slug: nextSlug, isActive: nextActive, archivedAt: nextArchivedAt?.toISOString() ?? null };

    const update = await tx.studioTag.updateMany({
      where: { id: tagId, projectId: current.projectId, updatedAt: input.expectedUpdatedAt },
      data: { label: nextLabel, slug: nextSlug, isActive: nextActive, archivedAt: nextArchivedAt },
    });
    if (update.count !== 1) return { kind: "conflict" as const };

    if (operation === "RENAME" && canonicalTagLabel(fresh.label) !== canonicalTagLabel(label)) {
      await tx.studioTagAlias.upsert({
        where: { projectId_slug: { projectId: current.projectId, slug: fresh.slug } },
        create: {
          projectId: current.projectId,
          tagId,
          slug: fresh.slug,
          label: fresh.label,
          createdByUserId: actorUserId,
          provenanceJson: { source: "quipsly-tag-rename-v1", receiptId, revision },
        },
        update: {},
      });
    }
    await tx.studioTagRevision.create({
      data: {
        tagId,
        revision,
        operation: operation.toLowerCase(),
        actorUserId,
        snapshotJson: { kind: "quipsly-tag-taxonomy-v1", receiptId, projectId: current.projectId, before, after, externalSideEffects: false },
      },
    });
    const saved = await tx.studioTag.findUnique({
      where: { id: tagId },
      select: {
        id: true, label: true, slug: true, isActive: true, archivedAt: true, updatedAt: true,
        aliases: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, slug: true } },
      },
    });
    return { kind: "saved" as const, saved, revision };
  });

  if (result.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to manage its vocabulary." };
  if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "This tag changed elsewhere. Refresh before changing it." };
  if (result.kind === "slug-conflict") return { ok: false, code: "SLUG_CONFLICT", error: `That name conflicts with “${result.existingLabel}”. Choose a more distinct name.` };
  if (result.kind === "already-archived") return { ok: false, code: "ALREADY_ARCHIVED", error: "Restore this archived tag before renaming it." };
  return { ok: true, operation, projectId: current.projectId, tag: result.saved, aliases: result.saved.aliases, revision: result.revision, receiptId };
}
