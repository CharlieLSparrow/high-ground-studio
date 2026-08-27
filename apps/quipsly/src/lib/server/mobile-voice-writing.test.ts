import {
  mobileVoiceWritingBodyBlockId,
  mobileVoiceWritingDraftIdFromDocumentId,
  mobileVoiceWritingDocumentId,
  mobileVoiceWritingOperationId,
  mobileVoiceWritingSource,
  validateMobileVoiceWriting,
} from "./mobile-voice-writing";

const draftId = "11111111-1111-4111-8111-111111111111";

describe("mobile voice writing", () => {
  it("normalizes an editable transcript-derived draft without changing its source identity", () => {
    const result = validateMobileVoiceWriting({
      draftId,
      localRecordingId: "22222222-2222-4222-8222-222222222222",
      transcriptClientRequestId: "33333333-3333-4333-8333-333333333333",
      sourceSha256: "a".repeat(64),
      callRoomId: "room-1",
      title: "  Chapter   idea  ",
      body: "First line\r\nSecond line",
      localRevision: 4,
      expectedServerRevision: 3,
      expectedContentRevision: "b".repeat(64),
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        title: "Chapter idea",
        body: "First line\nSecond line",
        localRevision: 4,
        expectedServerRevision: 3,
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(mobileVoiceWritingDocumentId(draftId)).toBe(`voice-writing-${draftId}`);
    expect(mobileVoiceWritingDraftIdFromDocumentId(`voice-writing-${draftId}`)).toBe(draftId);
    expect(mobileVoiceWritingDraftIdFromDocumentId(`other-${draftId}`)).toBeNull();
    expect(mobileVoiceWritingBodyBlockId(draftId)).toBe(`voice-writing-${draftId}-body`);
    expect(mobileVoiceWritingOperationId(draftId, 4)).toBe(`voice-writing-${draftId}-revision-4`);
    expect(mobileVoiceWritingSource(result.value, "user-1")).toMatchObject({
      schema: "quipsly-mobile-voice-writing-v1",
      localRevision: 4,
      actorUserId: "user-1",
    });
  });

  it.each([
    [{}, "VOICE_WRITING_ID_INVALID"],
    [{ draftId, localRecordingId: draftId, transcriptClientRequestId: draftId, sourceSha256: "nope", body: "Text", localRevision: 1, expectedServerRevision: 0 }, "VOICE_WRITING_SOURCE_INVALID"],
    [{ draftId, localRecordingId: draftId, transcriptClientRequestId: draftId, sourceSha256: "a".repeat(64), body: " ", localRevision: 1, expectedServerRevision: 0 }, "VOICE_WRITING_EMPTY"],
    [{ draftId, localRecordingId: draftId, transcriptClientRequestId: draftId, sourceSha256: "a".repeat(64), body: "Text", localRevision: 1, expectedServerRevision: 0, expectedContentRevision: "not-a-revision" }, "VOICE_WRITING_REVISION_INVALID"],
  ])("rejects malformed durable drafts", (input, code) => {
    expect(validateMobileVoiceWriting(input)).toMatchObject({ ok: false, code });
  });
});
