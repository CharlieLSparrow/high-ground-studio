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

  if (![draftId, localRecordingId, transcriptClientRequestId].every((id) => UUID_PATTERN.test(id))) {
    return { ok: false, code: "VOICE_WRITING_ID_INVALID", error: "The protected writing identity is invalid." };
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
    },
  };
}

export function mobileVoiceWritingDocumentId(draftId: string) {
  return `voice-writing-${draftId}`;
}

export function mobileVoiceWritingBodyBlockId(draftId: string) {
  return `${mobileVoiceWritingDocumentId(draftId)}-body`;
}

export function mobileVoiceWritingOperationId(draftId: string, localRevision: number) {
  return `${mobileVoiceWritingDocumentId(draftId)}-revision-${localRevision}`;
}

export function mobileVoiceWritingContentHash(input: Pick<MobileVoiceWritingInput, "title" | "body">) {
  return createHash("sha256").update(JSON.stringify([input.title, input.body])).digest("hex");
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
    localRevision: input.localRevision,
    contentHash: mobileVoiceWritingContentHash(input),
  };
}
