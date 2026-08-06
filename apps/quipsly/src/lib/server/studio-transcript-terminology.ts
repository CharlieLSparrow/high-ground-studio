import "server-only";

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS,
  STUDIO_TRANSCRIPT_TERMINOLOGY_PROVIDER_MODE,
  STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
  compileWhisperTerminologyPrompt,
  parseStudioTranscriptTerminologySnapshot,
  type StudioTranscriptTerminologySnapshot,
  type StudioTranscriptTerminologyTermSnapshot,
} from "@high-ground/quipsly-media-processing";

const CATEGORIES = new Set(["general", "person", "organization", "brand", "product", "place", "title", "technical", "coaching"]);

export class StudioTranscriptTerminologyError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409, readonly code: string) {
    super(message);
    this.name = "StudioTranscriptTerminologyError";
  }
}

export type StudioTranscriptTerminologyActor = { id: string; email: string };

export type StudioTranscriptTerminologyInput = {
  canonicalText: string;
  aliases?: string[];
  category?: string;
  pronunciationHint?: string | null;
  contextHint?: string | null;
  priority?: number;
};

export async function readStudioTranscriptTerminology(input: { prisma: any; projectId: string }) {
  const [terms, candidates] = await Promise.all([
    input.prisma.studioTranscriptTerminologyTerm.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { canonicalText: "asc" }, { id: "asc" }],
    }),
    input.prisma.studioTranscriptTerminologyCandidate.findMany({
      where: { projectId: input.projectId, status: "proposed" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);
  const activeTerms = terms.filter((term: any) => term.status === "active");
  return {
    terms: terms.map(publicTerm),
    candidates: candidates.map((candidate: any) => ({
      id: candidate.id,
      proposedCanonicalText: candidate.proposedCanonicalText,
      aliases: jsonStringArray(candidate.aliasesJson),
      category: candidate.category,
      pronunciationHint: candidate.pronunciationHint,
      contextHint: candidate.contextHint,
      priority: candidate.priority,
      sourceCorrectionId: candidate.sourceCorrectionId,
      sourceTranscriptJobId: candidate.sourceTranscriptJobId,
      evidence: jsonObject(candidate.evidenceJson),
      createdAt: candidate.createdAt.toISOString(),
    })),
    activeRevisionToken: activeTerms.length ? terminologyRevisionToken(activeTerms) : null,
    activeTermCount: activeTerms.length,
    boundaries: terminologyBoundaries(),
  };
}

export async function createStudioTranscriptTerminologyTerm(input: {
  prisma: any;
  projectId: string;
  actor: StudioTranscriptTerminologyActor;
  value: StudioTranscriptTerminologyInput;
}) {
  const value = normalizeInput(input.value);
  return input.prisma.$transaction(async (transaction: any) => {
    const existing = await transaction.studioTranscriptTerminologyTerm.findUnique({
      where: { projectId_normalizedText: { projectId: input.projectId, normalizedText: normalized(value.canonicalText) } },
    });
    if (existing) throw new StudioTranscriptTerminologyError(
      existing.status === "active" ? "That preferred spelling already exists in this Nest." : "That term is archived. Restore it instead of creating a duplicate.",
      409,
      existing.status === "active" ? "TERMINOLOGY_EXISTS" : "TERMINOLOGY_ARCHIVED",
    );
    const term = await transaction.studioTranscriptTerminologyTerm.create({
      data: {
        projectId: input.projectId,
        canonicalText: value.canonicalText,
        normalizedText: normalized(value.canonicalText),
        aliasesJson: toPrismaJson(value.aliases),
        category: value.category,
        pronunciationHint: value.pronunciationHint,
        contextHint: value.contextHint,
        priority: value.priority,
        status: "active",
        currentRevision: 1,
        createdByUserId: input.actor.id || null,
        createdByEmailSnapshot: input.actor.email,
      },
    });
    await transaction.studioTranscriptTerminologyRevision.create({
      data: {
        termId: term.id,
        revision: 1,
        operation: "created",
        actorUserId: input.actor.id || null,
        actorEmailSnapshot: input.actor.email,
        snapshotJson: toPrismaJson(revisionSnapshot(term)),
      },
    });
    return { term: publicTerm(term), boundaries: terminologyBoundaries() };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}

export async function mutateStudioTranscriptTerminologyTerm(input: {
  prisma: any;
  projectId: string;
  termId: string;
  expectedRevision: number;
  operation: "update" | "archive" | "restore";
  actor: StudioTranscriptTerminologyActor;
  value?: StudioTranscriptTerminologyInput;
}) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new StudioTranscriptTerminologyError("Refresh this vocabulary before changing it.", 409, "TERMINOLOGY_STALE");
  }
  return input.prisma.$transaction(async (transaction: any) => {
    const current = await transaction.studioTranscriptTerminologyTerm.findFirst({ where: { id: input.termId, projectId: input.projectId } });
    if (!current) throw new StudioTranscriptTerminologyError("That vocabulary term was not found in this Nest.", 404, "TERMINOLOGY_NOT_FOUND");
    if (current.currentRevision !== input.expectedRevision) {
      throw new StudioTranscriptTerminologyError("This vocabulary changed elsewhere. Refresh before replacing it.", 409, "TERMINOLOGY_STALE");
    }
    if (input.operation === "archive" && current.status !== "active") {
      throw new StudioTranscriptTerminologyError("That vocabulary term is already archived.", 409, "TERMINOLOGY_ALREADY_ARCHIVED");
    }
    if (input.operation === "restore" && current.status !== "archived") {
      throw new StudioTranscriptTerminologyError("That vocabulary term is already active.", 409, "TERMINOLOGY_ALREADY_ACTIVE");
    }
    const value = input.operation === "update" ? normalizeInput(input.value || { canonicalText: "" }) : {
      canonicalText: current.canonicalText,
      aliases: jsonStringArray(current.aliasesJson),
      category: current.category,
      pronunciationHint: current.pronunciationHint,
      contextHint: current.contextHint,
      priority: current.priority,
    };
    const nextRevision = current.currentRevision + 1;
    const status = input.operation === "archive" ? "archived" : "active";
    const updated = await transaction.studioTranscriptTerminologyTerm.update({
      where: { id: current.id },
      data: {
        canonicalText: value.canonicalText,
        normalizedText: normalized(value.canonicalText),
        aliasesJson: toPrismaJson(value.aliases),
        category: value.category,
        pronunciationHint: value.pronunciationHint,
        contextHint: value.contextHint,
        priority: value.priority,
        status,
        currentRevision: nextRevision,
      },
    }).catch((error: unknown) => {
      if (String(record(error).code) === "P2002") throw new StudioTranscriptTerminologyError("That preferred spelling already exists in this Nest.", 409, "TERMINOLOGY_EXISTS");
      throw error;
    });
    await transaction.studioTranscriptTerminologyRevision.create({
      data: {
        termId: updated.id,
        revision: nextRevision,
        operation: input.operation === "update" ? "updated" : input.operation === "archive" ? "archived" : "restored",
        actorUserId: input.actor.id || null,
        actorEmailSnapshot: input.actor.email,
        snapshotJson: toPrismaJson(revisionSnapshot(updated)),
      },
    });
    return { term: publicTerm(updated), boundaries: terminologyBoundaries() };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}

export async function compileStudioTranscriptTerminologySnapshot(input: {
  prisma: any;
  projectId: string;
  compiledAt: Date;
}): Promise<StudioTranscriptTerminologySnapshot | null> {
  const rows = await input.prisma.studioTranscriptTerminologyTerm.findMany({
    where: { projectId: input.projectId, status: "active" },
    orderBy: [{ priority: "desc" }, { canonicalText: "asc" }, { id: "asc" }],
    take: STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS,
  });
  if (!rows.length) return null;
  const terms: StudioTranscriptTerminologyTermSnapshot[] = rows.map((row: any) => ({
    id: row.id,
    revision: row.currentRevision,
    canonicalText: row.canonicalText,
    aliases: jsonStringArray(row.aliasesJson),
    category: row.category,
    pronunciationHint: row.pronunciationHint,
    contextHint: row.contextHint,
    priority: row.priority,
  }));
  const providerInput = compileWhisperTerminologyPrompt(terms);
  const canonicalTerms = JSON.stringify(terms.map((term) => ({
    id: term.id,
    revision: term.revision,
    canonicalText: term.canonicalText,
    aliases: term.aliases,
    category: term.category,
    pronunciationHint: term.pronunciationHint,
    contextHint: term.contextHint,
    priority: term.priority,
  })));
  const snapshot = {
    kind: STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
    projectId: input.projectId,
    compiledAt: input.compiledAt.toISOString(),
    revisionToken: terminologyRevisionToken(terms),
    termsSha256: sha256(canonicalTerms),
    terms,
    providerInput: {
      provider: "openai-whisper-local" as const,
      // Keep the hint bounded to Whisper's first decoding window. Carrying a
      // vocabulary prompt through every window can amplify hallucinations in
      // silence and non-speech audio.
      mode: STUDIO_TRANSCRIPT_TERMINOLOGY_PROVIDER_MODE,
      promptText: providerInput.promptText,
      promptSha256: sha256(providerInput.promptText),
      includedTermIds: providerInput.includedTermIds,
      omittedTermIds: providerInput.omittedTermIds,
      maxCharacters: 1_000 as const,
    },
    boundaries: terminologyBoundaries(),
  };
  return parseStudioTranscriptTerminologySnapshot(snapshot);
}

function normalizeInput(input: StudioTranscriptTerminologyInput) {
  const canonicalText = boundedText(input.canonicalText, 120, "Preferred spelling");
  if (canonicalText.includes(";")) throw new StudioTranscriptTerminologyError("Preferred spellings cannot contain semicolons.", 400, "TERMINOLOGY_INVALID");
  const aliases = [...new Set((input.aliases || []).map((entry) => {
    const alias = boundedText(entry, 120, "Alias");
    if (alias.includes(";")) throw new StudioTranscriptTerminologyError("Aliases cannot contain semicolons.", 400, "TERMINOLOGY_INVALID");
    return alias;
  }))]
    .filter((entry) => normalized(entry) !== normalized(canonicalText));
  if (aliases.length > 12) throw new StudioTranscriptTerminologyError("Use no more than 12 aliases for one term.", 400, "TERMINOLOGY_INVALID");
  const category = String(input.category || "general").trim().toLowerCase();
  if (!CATEGORIES.has(category)) throw new StudioTranscriptTerminologyError("Choose a supported terminology category.", 400, "TERMINOLOGY_INVALID");
  const priority = input.priority == null ? 50 : Number(input.priority);
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > 100) throw new StudioTranscriptTerminologyError("Terminology priority must be from 0 through 100.", 400, "TERMINOLOGY_INVALID");
  return {
    canonicalText,
    aliases,
    category,
    pronunciationHint: nullableBoundedText(input.pronunciationHint, 160, "Pronunciation hint"),
    contextHint: nullableBoundedText(input.contextHint, 240, "Context hint"),
    priority,
  };
}

function publicTerm(term: any) {
  return {
    id: term.id,
    canonicalText: term.canonicalText,
    aliases: jsonStringArray(term.aliasesJson),
    category: term.category,
    pronunciationHint: term.pronunciationHint,
    contextHint: term.contextHint,
    priority: term.priority,
    status: term.status,
    revision: term.currentRevision,
    updatedAt: term.updatedAt.toISOString(),
  };
}
function revisionSnapshot(term: any) { return { ...publicTerm(term), schema: "quipsly-transcript-terminology-revision-v1" }; }
function terminologyBoundaries() { return { vocabularyIsProviderContextNotTruth: true as const, providerEvidenceRemainsImmutable: true as const, historicalTranscriptsAreNotRewritten: true as const, measuredAccuracyRequiredBeforeDefaultRouting: true as const }; }
function boundedText(value: unknown, max: number, label: string) { const result = String(value || "").normalize("NFKC").trim(); if (!result || result.length > max || /[\u0000-\u001f\u007f]/u.test(result)) throw new StudioTranscriptTerminologyError(`${label} is invalid.`, 400, "TERMINOLOGY_INVALID"); return result; }
function nullableBoundedText(value: unknown, max: number, label: string) { if (value == null || value === "") return null; return boundedText(value, max, label); }
function normalized(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase("en-US"); }
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function terminologyRevisionToken(terms: Array<{ id: string; revision?: number; currentRevision?: number; priority: number; canonicalText: string }>) {
  const revisions = [...terms]
    .sort((left, right) => right.priority - left.priority || left.canonicalText.localeCompare(right.canonicalText) || left.id.localeCompare(right.id))
    .slice(0, STUDIO_TRANSCRIPT_TERMINOLOGY_MAX_TERMS)
    .map((term) => `${term.id}:${term.revision ?? term.currentRevision}`)
    .join("\n");
  return sha256(`${revisions}\nprovider-mode:${STUDIO_TRANSCRIPT_TERMINOLOGY_PROVIDER_MODE}`);
}
function jsonStringArray(value: unknown) { return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : []; }
function jsonObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function toPrismaJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
