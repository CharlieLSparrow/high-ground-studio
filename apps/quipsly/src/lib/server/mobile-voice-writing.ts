import { createHash } from "node:crypto";

import {
  VOICE_WRITING_BLOCK_KINDS,
  VOICE_WRITING_MARK_KINDS,
  type VoiceWritingBlockKind,
  type VoiceWritingBlockStyle,
  type VoiceWritingMark,
  type VoiceWritingMarkKind,
  type VoiceWritingRichText,
} from "@/lib/voice-writing-contract";

export {
  VOICE_WRITING_BLOCK_KINDS as MOBILE_VOICE_WRITING_BLOCK_KINDS,
  VOICE_WRITING_MARK_KINDS as MOBILE_VOICE_WRITING_MARK_KINDS,
  type VoiceWritingMark as MobileVoiceWritingMark,
  type VoiceWritingMarkKind as MobileVoiceWritingMarkKind,
  type VoiceWritingRichText as MobileVoiceWritingRichText,
} from "@/lib/voice-writing-contract";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MobileVoiceWritingInput = {
  draftId: string;
  writingOrigin: "typed" | "recorded";
  localRecordingId: string | null;
  transcriptClientRequestId: string | null;
  sourceSha256: string | null;
  callRoomId: string | null;
  title: string;
  body: string;
  localRevision: number;
  expectedServerRevision: number;
  expectedContentRevision: string | null;
  destinationProjectId: string | null;
  sources: MobileVoiceWritingSourceInput[];
  richText: VoiceWritingRichText | null;
};

export type MobileVoiceWritingSourceInput = {
  localRecordingId: string;
  transcriptClientRequestId: string;
  sourceSha256: string;
  callRoomId: string | null;
};

export type MobileVoiceWritingValidation =
  | { ok: true; value: MobileVoiceWritingInput }
  | { ok: false; code: string; error: string };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : NaN;
}

function source(value: unknown): MobileVoiceWritingSourceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const localRecordingId = text(input.localRecordingId, 80).toLowerCase();
  const transcriptClientRequestId = text(input.transcriptClientRequestId, 80).toLowerCase();
  const sourceSha256 = text(input.sourceSha256, 64).toLowerCase();
  const callRoomId = text(input.callRoomId, 200) || null;
  if (!UUID_PATTERN.test(localRecordingId)
    || !UUID_PATTERN.test(transcriptClientRequestId)
    || !/^[0-9a-f]{64}$/.test(sourceSha256)) return null;
  return { localRecordingId, transcriptClientRequestId, sourceSha256, callRoomId };
}

export function normalizeMobileVoiceWritingRichText(
  value: unknown,
  body: string,
): VoiceWritingRichText | null | undefined {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.schema !== "quipsly-writing-runs-v1" || input.text !== body || !Array.isArray(input.marks)) {
    return undefined;
  }
  if (input.marks.length > 5_000) return undefined;
  const marks: VoiceWritingMark[] = [];
  const seen = new Set<string>();
  for (const candidate of input.marks) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const mark = candidate as Record<string, unknown>;
    if (!VOICE_WRITING_MARK_KINDS.includes(mark.kind as VoiceWritingMarkKind)) return undefined;
    const startUtf16 = integer(mark.startUtf16);
    const endUtf16 = integer(mark.endUtf16);
    if (!Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > body.length) return undefined;
    const normalized: VoiceWritingMark = {
      kind: mark.kind as VoiceWritingMarkKind,
      startUtf16,
      endUtf16,
    };
    const identity = `${normalized.kind}:${startUtf16}:${endUtf16}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      marks.push(normalized);
    }
  }
  marks.sort((left, right) => left.startUtf16 - right.startUtf16
    || left.endUtf16 - right.endUtf16
    || left.kind.localeCompare(right.kind));
  const merged: VoiceWritingMark[] = [];
  for (const kind of VOICE_WRITING_MARK_KINDS) {
    for (const mark of marks.filter((candidate) => candidate.kind === kind)) {
      const previous = merged.at(-1);
      if (previous && previous.kind === mark.kind && mark.startUtf16 <= previous.endUtf16) {
        previous.endUtf16 = Math.max(previous.endUtf16, mark.endUtf16);
      } else {
        merged.push({ ...mark });
      }
    }
  }
  merged.sort((left, right) => left.startUtf16 - right.startUtf16
    || left.endUtf16 - right.endUtf16
    || left.kind.localeCompare(right.kind));
  const requestedStructures = input.structures ?? [];
  if (!Array.isArray(requestedStructures) || requestedStructures.length > 2_000) return undefined;
  const structures: VoiceWritingBlockStyle[] = [];
  const structureIdentities = new Set<string>();
  for (const candidate of requestedStructures) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const structure = candidate as Record<string, unknown>;
    if (!VOICE_WRITING_BLOCK_KINDS.includes(structure.kind as VoiceWritingBlockKind)) return undefined;
    const startUtf16 = integer(structure.startUtf16);
    const endUtf16 = integer(structure.endUtf16);
    if (!Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > body.length
      || (startUtf16 > 0 && body[startUtf16 - 1] !== "\n")
      || (endUtf16 < body.length && body[endUtf16] !== "\n")) return undefined;
    const normalized: VoiceWritingBlockStyle = {
      kind: structure.kind as VoiceWritingBlockKind,
      startUtf16,
      endUtf16,
    };
    const identity = `${normalized.kind}:${startUtf16}:${endUtf16}`;
    if (!structureIdentities.has(identity)) {
      structureIdentities.add(identity);
      structures.push(normalized);
    }
  }
  structures.sort((left, right) => left.startUtf16 - right.startUtf16
    || left.endUtf16 - right.endUtf16
    || left.kind.localeCompare(right.kind));
  if (structures.some((structure, index) => {
    const previous = structures[index - 1];
    return previous && structure.startUtf16 < previous.endUtf16;
  })) return undefined;
  return {
    schema: "quipsly-writing-runs-v1",
    text: body,
    marks: merged,
    structures,
  };
}

export function validateMobileVoiceWriting(value: unknown): MobileVoiceWritingValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "VOICE_WRITING_INVALID", error: "The writing draft is not valid JSON." };
  }
  const input = value as Record<string, unknown>;
  const draftId = text(input.draftId, 80).toLowerCase();
  const requestedWritingOrigin = text(input.writingOrigin, 20).toLowerCase();
  const writingOrigin = requestedWritingOrigin === "typed" ? "typed" : "recorded";
  const localRecordingId = text(input.localRecordingId, 80).toLowerCase() || null;
  const transcriptClientRequestId = text(input.transcriptClientRequestId, 80).toLowerCase() || null;
  const sourceSha256 = text(input.sourceSha256, 64).toLowerCase() || null;
  const callRoomId = text(input.callRoomId, 200) || null;
  const title = typeof input.title === "string"
    ? input.title.replace(/\s+/g, " ").trim().slice(0, 320)
    : "";
  const body = typeof input.body === "string"
    ? input.body.replace(/\r\n?/g, "\n").slice(0, 200_000)
    : "";
  const localRevision = integer(input.localRevision);
  const expectedServerRevision = integer(input.expectedServerRevision);
  const expectedContentRevision = text(input.expectedContentRevision, 64).toLowerCase() || null;
  const destinationProjectId = text(input.destinationProjectId, 200) || null;
  if (!UUID_PATTERN.test(draftId)) {
    return { ok: false, code: "VOICE_WRITING_ID_INVALID", error: "The writing identity is invalid." };
  }
  const hasAnyLegacySource = Boolean(localRecordingId || transcriptClientRequestId || sourceSha256 || callRoomId);
  const hasCompleteLegacySource = Boolean(
    localRecordingId
      && transcriptClientRequestId
      && sourceSha256
      && UUID_PATTERN.test(localRecordingId)
      && UUID_PATTERN.test(transcriptClientRequestId)
      && /^[0-9a-f]{64}$/.test(sourceSha256),
  );
  if (hasAnyLegacySource && !hasCompleteLegacySource) {
    return { ok: false, code: "VOICE_WRITING_SOURCE_INVALID", error: "The connected transcript source is incomplete." };
  }
  if (!body.trim()) {
    return { ok: false, code: "VOICE_WRITING_EMPTY", error: "Speak or write something before syncing this note." };
  }
  if (!Number.isSafeInteger(localRevision) || localRevision < 1 || localRevision > 1_000_000_000) {
    return { ok: false, code: "VOICE_WRITING_REVISION_INVALID", error: "The local writing revision is invalid." };
  }
  if (!Number.isSafeInteger(expectedServerRevision) || expectedServerRevision < 0 || expectedServerRevision > 1_000_000_000) {
    return { ok: false, code: "VOICE_WRITING_REVISION_INVALID", error: "The expected Nest revision is invalid." };
  }
  if (expectedContentRevision && !/^[0-9a-f]{64}$/.test(expectedContentRevision)) {
    return { ok: false, code: "VOICE_WRITING_REVISION_INVALID", error: "The expected Nest content revision is invalid." };
  }
  if (destinationProjectId && !/^[A-Za-z0-9_-]{1,200}$/.test(destinationProjectId)) {
    return { ok: false, code: "VOICE_WRITING_DESTINATION_INVALID", error: "The writing destination is invalid." };
  }
  const fallbackSource = hasCompleteLegacySource
    ? { localRecordingId: localRecordingId!, transcriptClientRequestId: transcriptClientRequestId!, sourceSha256: sourceSha256!, callRoomId }
    : null;
  const requestedSources = input.sources === undefined
    ? (fallbackSource ? [fallbackSource] : [])
    : input.sources;
  if (!Array.isArray(requestedSources) || requestedSources.length > 100) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Keep up to 100 source recordings connected to one writing draft." };
  }
  const sources = requestedSources.map(source);
  if (sources.some((item) => !item)) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "A connected source recording is invalid." };
  }
  const validSources = sources as MobileVoiceWritingSourceInput[];
  if (new Set(validSources.map((item) => item.localRecordingId)).size !== validSources.length) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Connected recordings must be unique." };
  }
  if (hasCompleteLegacySource && (
    validSources[0]?.localRecordingId !== localRecordingId
      || validSources[0]?.transcriptClientRequestId !== transcriptClientRequestId
      || validSources[0]?.sourceSha256 !== sourceSha256
      || validSources[0]?.callRoomId !== callRoomId
  )) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Connected recordings must begin with the draft's original source." };
  }
  if (writingOrigin === "recorded" && validSources.length < 1) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Recorded writing must retain its original source." };
  }
  const normalizedRichText = normalizeMobileVoiceWritingRichText(input.richText, body);
  if (normalizedRichText === undefined) {
    return { ok: false, code: "VOICE_WRITING_RICH_TEXT_INVALID", error: "The writing format does not match its searchable text." };
  }
  return {
    ok: true,
    value: {
      draftId,
      writingOrigin,
      localRecordingId,
      transcriptClientRequestId,
      sourceSha256,
      callRoomId,
      title: title || "Untitled",
      body,
      localRevision,
      expectedServerRevision,
      expectedContentRevision,
      destinationProjectId,
      sources: validSources,
      richText: normalizedRichText,
    },
  };
}

export function mobileVoiceWritingDocumentId(draftId: string) {
  return `voice-writing-${draftId}`;
}

export function mobileVoiceWritingDraftIdFromDocumentId(documentId: string) {
  const match = /^voice-writing-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(documentId);
  return match?.[1]?.toLowerCase() ?? null;
}

export function mobileVoiceWritingBodyBlockId(draftId: string) {
  return `${mobileVoiceWritingDocumentId(draftId)}-body`;
}

export function mobileVoiceWritingOperationId(draftId: string, localRevision: number) {
  return `${mobileVoiceWritingDocumentId(draftId)}-revision-${localRevision}`;
}

export function mobileVoiceWritingContentHash(
  input: Pick<MobileVoiceWritingInput, "title" | "body"> & { richText?: VoiceWritingRichText | null },
) {
  const revisionMaterial = input.richText
    ? [input.title, input.body, input.richText]
    : [input.title, input.body];
  return createHash("sha256").update(JSON.stringify(revisionMaterial)).digest("hex");
}

export function mobileVoiceWritingSource(input: MobileVoiceWritingInput, actorUserId: string) {
  return {
    schema: "quipsly-mobile-writing-v2",
    surface: "ios-capture",
    actorUserId,
    draftId: input.draftId,
    writingOrigin: input.writingOrigin,
    localRecordingId: input.localRecordingId,
    transcriptClientRequestId: input.transcriptClientRequestId,
    sourceSha256: input.sourceSha256,
    callRoomId: input.callRoomId,
    sources: input.sources,
    richText: input.richText,
    localRevision: input.localRevision,
    destinationProjectId: input.destinationProjectId,
    contentHash: mobileVoiceWritingContentHash(input),
  };
}
