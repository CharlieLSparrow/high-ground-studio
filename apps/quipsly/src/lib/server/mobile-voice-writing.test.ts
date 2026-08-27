import {
  mobileVoiceWritingBodyBlockId,
  mobileVoiceWritingDraftIdFromDocumentId,
  mobileVoiceWritingDocumentId,
  mobileVoiceWritingOperationId,
  mobileVoiceWritingSource,
  validateMobileVoiceWriting,
} from "./mobile-voice-writing";

const draftId = "11111111-1111-4111-8111-111111111111";
const recordingId = "22222222-2222-4222-8222-222222222222";
const transcriptId = "33333333-3333-4333-8333-333333333333";
const continuationRecordingId = "44444444-4444-4444-8444-444444444444";
const continuationTranscriptId = "55555555-5555-4555-8555-555555555555";

describe("mobile voice writing", () => {
  it("normalizes an editable transcript-derived draft without changing its source identity", () => {
    const result = validateMobileVoiceWriting({
      draftId,
      localRecordingId: recordingId,
      transcriptClientRequestId: transcriptId,
      sourceSha256: "a".repeat(64),
      callRoomId: "room-1",
      title: "  Chapter   idea  ",
      body: "First line\r\nSecond line",
      localRevision: 4,
      expectedServerRevision: 3,
      expectedContentRevision: "b".repeat(64),
      sources: [
        {
          localRecordingId: recordingId.toUpperCase(),
          transcriptClientRequestId: transcriptId.toUpperCase(),
          sourceSha256: "A".repeat(64),
          callRoomId: "room-1",
        },
        {
          localRecordingId: continuationRecordingId,
          transcriptClientRequestId: continuationTranscriptId,
          sourceSha256: "c".repeat(64),
          callRoomId: "room-2",
        },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        title: "Chapter idea",
        body: "First line\nSecond line",
        localRevision: 4,
        expectedServerRevision: 3,
        sources: [
          {
            localRecordingId: recordingId,
            transcriptClientRequestId: transcriptId,
            sourceSha256: "a".repeat(64),
            callRoomId: "room-1",
          },
          {
            localRecordingId: continuationRecordingId,
            transcriptClientRequestId: continuationTranscriptId,
            sourceSha256: "c".repeat(64),
            callRoomId: "room-2",
          },
        ],
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
      sources: expect.arrayContaining([
        expect.objectContaining({ localRecordingId: continuationRecordingId }),
      ]),
    });
  });

  it.each([
    [
      [{
        localRecordingId: recordingId,
        transcriptClientRequestId: transcriptId,
        sourceSha256: "a".repeat(64),
        callRoomId: "different-room",
      }],
      "a source list whose first item does not exactly describe the original",
    ],
    [
      [
        { localRecordingId: recordingId, transcriptClientRequestId: transcriptId, sourceSha256: "a".repeat(64), callRoomId: "room-1" },
        { localRecordingId: recordingId, transcriptClientRequestId: continuationTranscriptId, sourceSha256: "c".repeat(64), callRoomId: "room-2" },
      ],
      "duplicate recording identities",
    ],
  ])("rejects %s", (sources) => {
    expect(validateMobileVoiceWriting({
      draftId,
      localRecordingId: recordingId,
      transcriptClientRequestId: transcriptId,
      sourceSha256: "a".repeat(64),
      callRoomId: "room-1",
      title: "Draft",
      body: "Text",
      localRevision: 1,
      expectedServerRevision: 0,
      sources,
    })).toMatchObject({ ok: false, code: "VOICE_WRITING_SOURCES_INVALID" });
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
