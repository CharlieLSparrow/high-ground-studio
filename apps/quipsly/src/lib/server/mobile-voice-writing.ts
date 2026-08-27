import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MobileVoiceWritingInput = {
  draftId: string;
  localRecordingId: string;
  transcriptClientRequestId: string;
  sourceSha256: string;
  callRoomId: string | null;
  title: string;
  body: string;
  localRevision: number;
  expectedServerRevision: number;
  expectedContentRevision: string | null;
  sources: MobileVoiceWritingSourceInput[];
  richText: MobileVoiceWritingRichText | null;
};

export const MOBILE_VOICE_WRITING_MARK_KINDS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
] as const;

export type MobileVoiceWritingMarkKind = typeof MOBILE_VOICE_WRITING_MARK_KINDS[number];

export type MobileVoiceWritingMark = {
  kind: MobileVoiceWritingMarkKind;
  startUtf16: number;
  endUtf16: number;
};

/**
 * Portable rich-writing projection shared by iOS and the web. Offsets use
 * UTF-16 code units because Swift's NSString bridge and JavaScript strings
 * agree on them, including text containing emoji or non-BMP characters.
 * StudioDocumentBlock.body remains the searchable plain-text projection.
 */
export type MobileVoiceWritingRichText = {
  schema: "quipsly-writing-runs-v1";
  text: string;
  marks: MobileVoiceWritingMark[];
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

function richText(value: unknown, body: string): MobileVoiceWritingRichText | null | undefined {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.schema !== "quipsly-writing-runs-v1" || input.text !== body || !Array.isArray(input.marks)) {
    return undefined;
  }
  if (input.marks.length > 5_000) return undefined;
  const marks: MobileVoiceWritingMark[] = [];
  const seen = new Set<string>();
  for (const candidate of input.marks) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const mark = candidate as Record<string, unknown>;
    if (!MOBILE_VOICE_WRITING_MARK_KINDS.includes(mark.kind as MobileVoiceWritingMarkKind)) return undefined;
    const startUtf16 = integer(mark.startUtf16);
    const endUtf16 = integer(mark.endUtf16);
    if (!Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > body.length) return undefined;
    const normalized: MobileVoiceWritingMark = {
      kind: mark.kind as MobileVoiceWritingMarkKind,
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
  const merged: MobileVoiceWritingMark[] = [];
  for (const kind of MOBILE_VOICE_WRITING_MARK_KINDS) {
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
  return { schema: "quipsly-writing-runs-v1", text: body, marks: merged };
}

export function validateMobileVoiceWriting(value: unknown): MobileVoiceWritingValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "VOICE_WRITING_INVALID", error: "The writing draft is not valid JSON." };
  }
  const input = value as Record<string, unknown>;
  const draftId = text(input.draftId, 80).toLowerCase();
  const localRecordingId = text(input.localRecordingId, 80).toLowerCase();
  const transcriptClientRequestId = text(input.transcriptClientRequestId, 80).toLowerCase();
  const sourceSha256 = text(input.sourceSha256, 64).toLowerCase();
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
  if (![draftId, localRecordingId, transcriptClientRequestId].every((id) => UUID_PATTERN.test(id))) {
    return { ok: false, code: "VOICE_WRITING_ID_INVALID", error: "The writing identity is invalid." };
  }
  if (!/^[0-9a-f]{64}$/.test(sourceSha256)) {
    return { ok: false, code: "VOICE_WRITING_SOURCE_INVALID", error: "The transcript source fingerprint is invalid." };
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
  const fallbackSource = { localRecordingId, transcriptClientRequestId, sourceSha256, callRoomId };
  const requestedSources = input.sources === undefined ? [fallbackSource] : input.sources;
  if (!Array.isArray(requestedSources) || requestedSources.length < 1 || requestedSources.length > 100) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Keep between 1 and 100 source recordings connected to one writing draft." };
  }
  const sources = requestedSources.map(source);
  if (sources.some((item) => !item)) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "A connected source recording is invalid." };
  }
  const validSources = sources as MobileVoiceWritingSourceInput[];
  if (new Set(validSources.map((item) => item.localRecordingId)).size !== validSources.length
    || validSources[0]?.localRecordingId !== localRecordingId
    || validSources[0]?.transcriptClientRequestId !== transcriptClientRequestId
    || validSources[0]?.sourceSha256 !== sourceSha256
    || validSources[0]?.callRoomId !== callRoomId) {
    return { ok: false, code: "VOICE_WRITING_SOURCES_INVALID", error: "Connected recordings must be unique and begin with the draft's original source." };
  }
  const normalizedRichText = richText(input.richText, body);
  if (normalizedRichText === undefined) {
    return { ok: false, code: "VOICE_WRITING_RICH_TEXT_INVALID", error: "The writing format does not match its searchable text." };
  }
  return {
    ok: true,
    value: {
      draftId,
      localRecordingId,
      transcriptClientRequestId,
      sourceSha256,
      callRoomId,
      title: title || "Voice note",
      body,
      localRevision,
      expectedServerRevision,
      expectedContentRevision,
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
  input: Pick<MobileVoiceWritingInput, "title" | "body"> & { richText?: MobileVoiceWritingRichText | null },
) {
  const revisionMaterial = input.richText
    ? [input.title, input.body, input.richText]
    : [input.title, input.body];
  return createHash("sha256").update(JSON.stringify(revisionMaterial)).digest("hex");
}

export function mobileVoiceWritingSource(input: MobileVoiceWritingInput, actorUserId: string) {
  return {
    schema: "quipsly-mobile-voice-writing-v1",
    surface: "ios-capture",
    actorUserId,
    draftId: input.draftId,
    localRecordingId: input.localRecordingId,
    transcriptClientRequestId: input.transcriptClientRequestId,
    sourceSha256: input.sourceSha256,
    callRoomId: input.callRoomId,
    sources: input.sources,
    richText: input.richText,
    localRevision: input.localRevision,
    contentHash: mobileVoiceWritingContentHash(input),
  };
}
