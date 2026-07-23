import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { listProjectsVisibleToEmail } from "./home-nest";

export type WorkTagEntityKind = "task" | "goal" | "session" | "note";

export type ReplaceWorkTagsResult =
  | { ok: true; entityKind: WorkTagEntityKind; entityId: string; projectId: string; tagIds: string[]; updatedAt: Date; receiptId: string }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT"; error: string };

export type CreateAndAssignWorkTagResult =
  | {
      ok: true;
      entityKind: WorkTagEntityKind;
      entityId: string;
      projectId: string;
      tag: { id: string; label: string; slug: string; category: string; projectId: string };
      created: boolean;
      updatedAt: Date;
      receiptId: string;
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ARCHIVED"; error: string };

export type WorkTagTaxonomyOperation = "RENAME" | "ARCHIVE" | "RESTORE";

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

export function normalizeWorkTagLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const label = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return label.length <= 80 ? label : "";
}

export function workTagSlug(label: string) {
  const normalized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const readable = normalized
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (readable) return readable;
  return `tag-${createHash("sha256").update(label.normalize("NFKC").toLowerCase()).digest("hex").slice(0, 12)}`;
}

function canonicalTagLabel(label: string) {
  return label.normalize("NFKC").toLocaleLowerCase("en-US");
}

async function writableProjectIds(prisma: PrismaClient, actorEmail: string) {
  const visibleProjects = await listProjectsVisibleToEmail(actorEmail, prisma);
  return new Set(visibleProjects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id));
}

function entityWhere(entityKind: WorkTagEntityKind, entityId: string, actorUserId: string) {
  return entityKind === "task"
    ? { id: entityId, assignedUserId: actorUserId }
    : entityKind === "goal"
      ? { id: entityId, ownerUserId: actorUserId }
      : entityKind === "note"
        ? { id: entityId, authorUserId: actorUserId }
        : { id: entityId, createdByUserId: actorUserId };
}

function entityModel(prisma: any, entityKind: WorkTagEntityKind) {
  return entityKind === "task"
    ? prisma.actionItem
    : entityKind === "goal"
      ? prisma.goal
      : entityKind === "note"
        ? prisma.coachingNote
        : prisma.callRoom;
}

function entitySourceField(entityKind: WorkTagEntityKind) {
  return entityKind === "session" ? "metadataJson" : "sourceJson";
}

async function findOwnedTagEntity(
  prisma: any,
  entityKind: WorkTagEntityKind,
  entityId: string,
  actorUserId: string,
  expectedUpdatedAt?: Date,
  expectedProjectId?: string,
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
  const sourceField = entitySourceField(entityKind);
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
}): Promise<CreateAndAssignWorkTagResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const entityId = cleanId(input.entityId);
  const label = normalizeWorkTagLabel(input.label);
  const slug = label ? workTagSlug(label) : "";
  if (!actorUserId || !actorEmail || !entityId || !label || !slug || !Number.isFinite(input.expectedUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "Enter a reusable tag name of 80 characters or fewer." };
  }

  const prisma = input.prisma as any;
  const ownerWhere = entityWhere(input.entityKind, entityId, actorUserId);
  const sourceField = entitySourceField(input.entityKind);
  const entity = await findOwnedTagEntity(prisma, input.entityKind, entityId, actorUserId);
  if (!entity) return { ok: false, code: "NOT_FOUND", error: `Only the ${input.entityKind} owner can create and apply its tags.` };
  if (!entity.projectId) return { ok: false, code: "PROJECT_REQUIRED", error: "Choose a Nest before creating a reusable tag." };
  if (entity.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before creating a tag." };

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
      input.expectedUpdatedAt,
      entity.projectId,
    );
    if (!currentEntity) return { kind: "conflict" as const };

    let tag = await tx.studioTag.findUnique({
      where: { projectId_slug: { projectId: entity.projectId, slug } },
      include: { mergedInto: true },
    });
    let created = false;
    let resolvedFormerName = false;
    if (tag?.mergedInto) {
      tag = tag.mergedInto;
      resolvedFormerName = true;
    }
    if (!tag) {
      const alias = await tx.studioTagAlias.findUnique({
        where: { projectId_slug: { projectId: entity.projectId, slug } },
        include: { tag: true },
      });
      if (alias) {
        if (canonicalTagLabel(alias.label) !== canonicalTagLabel(label)) {
          return { kind: "slug-conflict" as const, existingLabel: alias.label };
        }
        tag = alias.tag;
        resolvedFormerName = true;
      }
    }
    if (tag) {
      if (!tag.isActive) return { kind: "archived" as const };
      const resolvesByAlias = await tx.studioTagAlias.findFirst({
        where: { projectId: entity.projectId, tagId: tag.id, slug, label: { equals: label, mode: "insensitive" } },
        select: { id: true },
      });
      if (canonicalTagLabel(tag.label) !== canonicalTagLabel(label) && !resolvesByAlias && !resolvedFormerName) {
        return { kind: "slug-conflict" as const, existingLabel: tag.label };
      }
    } else {
      tag = await tx.studioTag.create({
        data: { projectId: entity.projectId, slug, label, category: "meaning", nodeType: "source_note", isPrivate: true, isActive: true },
      });
      created = true;
    }

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
    const update = await entityModel(tx, input.entityKind).updateMany({
      where: {
        ...ownerWhere,
        ...(input.entityKind === "note" ? { room: { projectId: entity.projectId } } : { projectId: entity.projectId }),
        updatedAt: input.expectedUpdatedAt,
      },
      data: { [sourceField]: { ...safeRecord(currentEntity[sourceField]), lastTagReceipt: receipt } },
    });
    if (update.count !== 1) return { kind: "conflict" as const };

    const sourceJson = { source: "quipsly-work-tag-create-v1", receiptId, externalSideEffects: false };
    if (input.entityKind === "task") {
      await tx.actionItemTagLink.createMany({ data: [{ actionItemId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else if (input.entityKind === "goal") {
      await tx.goalTagLink.createMany({ data: [{ goalId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else if (input.entityKind === "note") {
      await tx.coachingNoteTagLink.createMany({ data: [{ noteId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    } else {
      await tx.callRoomTagLink.createMany({ data: [{ roomId: entityId, tagId: tag.id, createdByUserId: actorUserId, sourceJson }], skipDuplicates: true });
    }
    const saved = await entityModel(tx, input.entityKind).findUnique({ where: { id: entityId }, select: { updatedAt: true } });
    return { kind: "saved" as const, tag, created, updatedAt: saved.updatedAt as Date };
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
    updatedAt: result.updatedAt,
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
  expectedUpdatedAt: Date;
}): Promise<ReplaceWorkTagsResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : "";
  const entityId = cleanId(input.entityId);
  const tagIds = normalizedTagIds(input.tagIds);
  if (!actorUserId || !actorEmail || !entityId || !tagIds || !Number.isFinite(input.expectedUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "The tag decision is incomplete or invalid." };
  }

  const writableProjects = await writableProjectIds(input.prisma, actorEmail);
  const prisma = input.prisma as any;
  const entity = await findOwnedTagEntity(prisma, input.entityKind, entityId, actorUserId);

  if (!entity) return { ok: false, code: "NOT_FOUND", error: `Only the ${input.entityKind} owner can change these tags.` };
  if (!entity.projectId) return { ok: false, code: "PROJECT_REQUIRED", error: "Choose a Nest before adding its tags." };
  if (!writableProjects.has(entity.projectId)) return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to change tags." };
  if (entity.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before changing tags." };

  if (tagIds.length) {
    const validTags = await prisma.studioTag.findMany({
      where: { id: { in: tagIds }, projectId: entity.projectId, isActive: true },
      select: { id: true },
    });
    if (validTags.length !== tagIds.length) {
      return { ok: false, code: "FORBIDDEN", error: "Every tag must be active and belong to the record's Nest." };
    }
  }

  const receiptId = randomUUID();
  const now = new Date();
  const receipt = {
    id: receiptId,
    kind: "quipsly-work-tags-v1",
    entityKind: input.entityKind,
    projectId: entity.projectId,
    tagIds,
    changedAt: now.toISOString(),
    changedByUserId: actorUserId,
    externalSideEffects: false,
  };

  const saved = await prisma.$transaction(async (tx: any) => {
    const activeGrant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: entity.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!activeGrant) return { kind: "forbidden" as const };
    if (tagIds.length) {
      const validTagCount = await tx.studioTag.count({ where: { id: { in: tagIds }, projectId: entity.projectId, isActive: true } });
      if (validTagCount !== tagIds.length) return { kind: "forbidden" as const };
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
      return { kind: "saved" as const, entity: await tx.actionItem.findUnique({ where: { id: entityId }, select: { updatedAt: true } }) };
    }
    if (input.entityKind === "goal") {
      await tx.goalTagLink.deleteMany({ where: { goalId: entityId } });
      if (tagIds.length) await tx.goalTagLink.createMany({ data: tagIds.map((tagId) => ({ goalId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
      return { kind: "saved" as const, entity: await tx.goal.findUnique({ where: { id: entityId }, select: { updatedAt: true } }) };
    }
    if (input.entityKind === "note") {
      await tx.coachingNoteTagLink.deleteMany({ where: { noteId: entityId } });
      if (tagIds.length) await tx.coachingNoteTagLink.createMany({ data: tagIds.map((tagId) => ({ noteId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
      return { kind: "saved" as const, entity: await tx.coachingNote.findUnique({ where: { id: entityId }, select: { updatedAt: true } }) };
    }
    await tx.callRoomTagLink.deleteMany({ where: { roomId: entityId } });
    if (tagIds.length) await tx.callRoomTagLink.createMany({ data: tagIds.map((tagId) => ({ roomId: entityId, tagId, createdByUserId: actorUserId, sourceJson })) });
    return { kind: "saved" as const, entity: await tx.callRoom.findUnique({ where: { id: entityId }, select: { updatedAt: true } }) };
  });

  if (saved.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access and active same-Nest tags are required." };
  if (saved.kind === "conflict" || !saved.entity) return { ok: false, code: "CONFLICT", error: "This record changed elsewhere. Refresh before changing tags." };
  return { ok: true, entityKind: input.entityKind, entityId, projectId: entity.projectId, tagIds, updatedAt: saved.entity.updatedAt, receiptId };
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
