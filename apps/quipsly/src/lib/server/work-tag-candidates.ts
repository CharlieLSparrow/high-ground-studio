import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { listProjectsVisibleToEmail } from "./home-nest";
import { normalizeWorkTagLabel, workTagSlug } from "./work-tags";

type CandidateClient = PrismaClient | Prisma.TransactionClient;

export type ImportedTagCandidateInput = {
  projectId: string;
  sourceKind: string;
  sourceIdentity: string;
  labels: unknown;
  provenanceJson?: Record<string, unknown>;
};

export type RecordImportedTagCandidatesResult = {
  acceptedLabels: number;
  candidateCreates: number;
  candidateReuses: number;
  evidenceCreates: number;
  evidenceReuses: number;
  candidates: Array<{ id: string; label: string; slug: string; status: "PENDING" | "PROMOTED" | "REJECTED" }>;
};

export type WorkTagCandidateOperation = "PROMOTE" | "REJECT" | "REOPEN";

export type MutateWorkTagCandidateResult =
  | {
      ok: true;
      operation: WorkTagCandidateOperation;
      projectId: string;
      candidate: {
        id: string;
        label: string;
        slug: string;
        status: "PENDING" | "PROMOTED" | "REJECTED";
        promotedTagId: string | null;
        reviewedAt: Date | null;
        updatedAt: Date;
      };
      tag: { id: string; label: string; slug: string; isActive: boolean } | null;
      revision: number;
      receiptId: string;
    }
  | {
      ok: false;
      code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_STATE" | "SLUG_CONFLICT" | "ARCHIVED";
      error: string;
    };

function cleanId(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function canonicalLabel(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

export function extractImportedKeywords(metadataJson: unknown): string[] {
  if (!metadataJson || typeof metadataJson !== "object" || Array.isArray(metadataJson)) return [];
  const keywords = (metadataJson as Record<string, unknown>).keywords;
  const values = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string"
      ? keywords.split(/[,;\n]/)
      : [];
  const unique = new Map<string, string>();
  for (const value of values.slice(0, 100)) {
    const label = normalizeWorkTagLabel(value);
    if (!label) continue;
    const slug = workTagSlug(label);
    if (!unique.has(slug)) unique.set(slug, label);
    if (unique.size >= 50) break;
  }
  return [...unique.values()];
}

/**
 * Preserve imported keyword evidence without making it available as canonical
 * vocabulary. Re-imports are idempotent and never reopen a rejected candidate.
 */
export async function recordImportedTagCandidatesInTransaction(
  client: CandidateClient,
  input: ImportedTagCandidateInput,
): Promise<RecordImportedTagCandidatesResult> {
  const projectId = cleanId(input.projectId);
  const sourceKind = cleanId(input.sourceKind, 120);
  const sourceIdentity = cleanId(input.sourceIdentity, 500);
  const labels = extractImportedKeywords({ keywords: input.labels });
  if (!projectId || !sourceKind || !sourceIdentity) {
    throw new Error("Imported keyword evidence requires a project, source kind, and stable source identity.");
  }

  let candidateCreates = 0;
  let candidateReuses = 0;
  let evidenceCreates = 0;
  let evidenceReuses = 0;
  const candidates: RecordImportedTagCandidatesResult["candidates"] = [];
  for (const label of labels) {
    const slug = workTagSlug(label);
    const candidateInsert = await client.studioTagCandidate.createMany({
      data: [{ projectId, slug, label }],
      skipDuplicates: true,
    });
    const candidate = await client.studioTagCandidate.findUniqueOrThrow({
      where: { projectId_slug: { projectId, slug } },
      select: { id: true, label: true, slug: true, status: true },
    });
    if (candidateInsert.count === 1) candidateCreates += 1;
    else candidateReuses += 1;

    const evidenceFingerprint = fingerprint({
      projectId,
      candidateSlug: slug,
      sourceKind,
      sourceIdentity,
      label,
      provenanceJson: input.provenanceJson ?? {},
    });
    const evidenceInsert = await client.studioTagCandidateEvidence.createMany({
      data: [{
          candidateId: candidate.id,
          fingerprint: evidenceFingerprint,
          sourceKind,
          sourceIdentity,
          labelSnapshot: label,
          provenanceJson: (input.provenanceJson ?? {}) as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
    if (evidenceInsert.count === 1) evidenceCreates += 1;
    else evidenceReuses += 1;
    candidates.push({
      id: candidate.id,
      label: candidate.label,
      slug: candidate.slug,
      status: candidate.status as "PENDING" | "PROMOTED" | "REJECTED",
    });
  }

  return {
    acceptedLabels: labels.length,
    candidateCreates,
    candidateReuses,
    evidenceCreates,
    evidenceReuses,
    candidates,
  };
}

export async function mutateWorkTagCandidate(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  candidateId: string;
  operation: WorkTagCandidateOperation;
  expectedUpdatedAt: Date;
}): Promise<MutateWorkTagCandidateResult> {
  const actorUserId = cleanId(input.actorUserId);
  const actorEmail = cleanId(input.actorEmail, 320).toLowerCase();
  const candidateId = cleanId(input.candidateId);
  const operation = input.operation;
  if (!actorUserId || !actorEmail || !candidateId || !["PROMOTE", "REJECT", "REOPEN"].includes(operation)
    || !Number.isFinite(input.expectedUpdatedAt?.getTime())) {
    return { ok: false, code: "INVALID_INPUT", error: "The imported-keyword decision is incomplete or invalid." };
  }

  const current = await input.prisma.studioTagCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, projectId: true, status: true, updatedAt: true },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "That imported keyword no longer exists." };
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { ok: false, code: "CONFLICT", error: "This imported keyword changed elsewhere. Refresh before reviewing it." };
  }
  const visibleProjects = await listProjectsVisibleToEmail(actorEmail, input.prisma);
  if (!visibleProjects.some((project) => project.id === current.projectId && (project.role === "OWNER" || project.role === "EDITOR"))) {
    return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to review imported keywords." };
  }

  const result = await input.prisma.$transaction(async (tx) => {
    const grant = await tx.studioProjectAccessGrant.findFirst({
      where: { projectId: current.projectId, email: actorEmail, status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
      select: { id: true },
    });
    if (!grant) return { kind: "forbidden" as const };
    const candidate = await tx.studioTagCandidate.findFirst({
      where: { id: candidateId, projectId: current.projectId, updatedAt: input.expectedUpdatedAt },
      include: {
        evidence: {
          orderBy: [{ importedAt: "asc" }, { id: "asc" }],
          select: { id: true, sourceKind: true, sourceIdentity: true, labelSnapshot: true },
        },
      },
    });
    if (!candidate) return { kind: "conflict" as const };
    if (operation === "PROMOTE" && candidate.status !== "PENDING") return { kind: "invalid-state" as const };
    if (operation === "REJECT" && candidate.status !== "PENDING") return { kind: "invalid-state" as const };
    if (operation === "REOPEN" && candidate.status !== "REJECTED") return { kind: "invalid-state" as const };

    let tag: { id: string; label: string; slug: string; isActive: boolean; mergedIntoTagId?: string | null } | null = null;
    let tagCreated = false;
    if (operation === "PROMOTE") {
      const canonical = await tx.studioTag.findUnique({
        where: { projectId_slug: { projectId: candidate.projectId, slug: candidate.slug } },
        include: { mergedInto: true },
      });
      const alias = await tx.studioTagAlias.findUnique({
        where: { projectId_slug: { projectId: candidate.projectId, slug: candidate.slug } },
        include: { tag: { include: { mergedInto: true } } },
      });
      const canonicalTarget = canonical?.mergedInto ?? canonical;
      const aliasTarget = alias?.tag.mergedInto ?? alias?.tag;
      if (canonicalTarget && aliasTarget && canonicalTarget.id !== aliasTarget.id) {
        return { kind: "slug-conflict" as const, existingLabel: canonicalTarget.label };
      }
      const resolved = canonicalTarget ?? aliasTarget ?? null;
      if (resolved) {
        const exactName = canonicalLabel(resolved.label) === canonicalLabel(candidate.label)
          || (alias && canonicalLabel(alias.label) === canonicalLabel(candidate.label));
        if (!exactName) return { kind: "slug-conflict" as const, existingLabel: resolved.label };
        if (!resolved.isActive) return { kind: "archived" as const };
        tag = resolved;
      } else {
        tag = await tx.studioTag.create({
          data: {
            projectId: candidate.projectId,
            slug: candidate.slug,
            label: candidate.label,
            category: "meaning",
            nodeType: "source_note",
            isPrivate: true,
            isActive: true,
          },
          select: { id: true, label: true, slug: true, isActive: true, mergedIntoTagId: true },
        });
        tagCreated = true;
      }
    }

    const now = new Date();
    const nextStatus = operation === "PROMOTE" ? "PROMOTED" : operation === "REJECT" ? "REJECTED" : "PENDING";
    const candidateRevision = await tx.studioTagCandidateRevision.aggregate({
      where: { candidateId },
      _max: { revision: true },
    });
    const revision = (candidateRevision._max.revision ?? 0) + 1;
    const saved = await tx.studioTagCandidate.update({
      where: { id: candidateId },
      data: {
        status: nextStatus,
        promotedTagId: operation === "PROMOTE" ? tag!.id : operation === "REOPEN" ? null : candidate.promotedTagId,
        reviewedByUserId: operation === "REOPEN" ? null : actorUserId,
        reviewedAt: operation === "REOPEN" ? null : now,
      },
      select: {
        id: true, projectId: true, label: true, slug: true, status: true,
        promotedTagId: true, reviewedAt: true, updatedAt: true,
      },
    });
    const receipt = await tx.studioTagCandidateRevision.create({
      data: {
        candidateId,
        revision,
        operation: operation.toLowerCase(),
        actorUserId,
        snapshotJson: {
          kind: "quipsly-imported-keyword-review-v1",
          projectId: candidate.projectId,
          beforeStatus: candidate.status,
          afterStatus: nextStatus,
          promotedTagId: tag?.id ?? null,
          tagCreated,
          evidence: candidate.evidence,
          externalSideEffects: false,
        },
      },
      select: { id: true },
    });
    if (operation === "PROMOTE") {
      const tagRevision = await tx.studioTagRevision.aggregate({
        where: { tagId: tag!.id },
        _max: { revision: true },
      });
      await tx.studioTagRevision.create({
        data: {
          tagId: tag!.id,
          revision: (tagRevision._max.revision ?? 0) + 1,
          operation: "imported-keyword-promoted",
          actorUserId,
          snapshotJson: {
            kind: "quipsly-imported-keyword-promotion-v1",
            candidateId,
            candidateRevision: revision,
            candidateReceiptId: receipt.id,
            tagCreated,
            evidenceIds: candidate.evidence.map((evidence) => evidence.id),
            externalSideEffects: false,
          },
        },
      });
    }
    return { kind: "saved" as const, saved, tag, revision, receiptId: receipt.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.kind === "forbidden") return { ok: false, code: "FORBIDDEN", error: "Editor access to this Nest is required to review imported keywords." };
  if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "This imported keyword changed elsewhere. Refresh before reviewing it." };
  if (result.kind === "invalid-state") return { ok: false, code: "INVALID_STATE", error: "That keyword has already been reviewed. Refresh to see its current state." };
  if (result.kind === "slug-conflict") return { ok: false, code: "SLUG_CONFLICT", error: `This imported keyword conflicts with the existing “${result.existingLabel}” vocabulary. Rename or merge deliberately instead.` };
  if (result.kind === "archived") return { ok: false, code: "ARCHIVED", error: "The matching canonical tag is archived. Restore it before promoting this keyword." };
  return {
    ok: true,
    operation,
    projectId: result.saved.projectId,
    candidate: {
      ...result.saved,
      status: result.saved.status as "PENDING" | "PROMOTED" | "REJECTED",
    },
    tag: result.tag ? { id: result.tag.id, label: result.tag.label, slug: result.tag.slug, isActive: result.tag.isActive } : null,
    revision: result.revision,
    receiptId: result.receiptId,
  };
}
