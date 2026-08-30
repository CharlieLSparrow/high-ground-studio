import {
  mobileVoiceWritingBodyBlockId,
  mobileVoiceWritingDraftIdFromDocumentId,
  mobileVoiceWritingDocumentId,
  mobileVoiceWritingOperationId,
  mobileVoiceWritingContentHash,
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
      richText: {
        schema: "quipsly-writing-runs-v1",
        text: "First line\nSecond line",
        marks: [
          { kind: "italic", startUtf16: 6, endUtf16: 10 },
          { kind: "bold", startUtf16: 0, endUtf16: 5 },
          { kind: "bold", startUtf16: 4, endUtf16: 8 },
        ],
        structures: [
          { kind: "heading", startUtf16: 0, endUtf16: 10 },
        ],
      },
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
        richText: {
          schema: "quipsly-writing-runs-v1",
          text: "First line\nSecond line",
          marks: [
            { kind: "bold", startUtf16: 0, endUtf16: 8 },
            { kind: "italic", startUtf16: 6, endUtf16: 10 },
          ],
          structures: [
            { kind: "heading", startUtf16: 0, endUtf16: 10 },
          ],
        },
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(mobileVoiceWritingDocumentId(draftId)).toBe(`voice-writing-${draftId}`);
    expect(mobileVoiceWritingDraftIdFromDocumentId(`voice-writing-${draftId}`)).toBe(draftId);
    expect(mobileVoiceWritingDraftIdFromDocumentId(`other-${draftId}`)).toBeNull();
    expect(mobileVoiceWritingBodyBlockId(draftId)).toBe(`voice-writing-${draftId}-body`);
    expect(mobileVoiceWritingOperationId(draftId, 4)).toBe(`voice-writing-${draftId}-revision-4`);
    expect(mobileVoiceWritingContentHash(result.value)).not.toBe(
      mobileVoiceWritingContentHash({ title: result.value.title, body: result.value.body }),
    );
    expect(mobileVoiceWritingSource(result.value, "user-1")).toMatchObject({
      schema: "quipsly-mobile-writing-v2",
      writingOrigin: "recorded",
      localRevision: 4,
      actorUserId: "user-1",
      sources: expect.arrayContaining([
        expect.objectContaining({ localRecordingId: continuationRecordingId }),
      ]),
    });
  });

  it("accepts keyboard-first writing without inventing an audio or transcript source", () => {
    const result = validateMobileVoiceWriting({
      draftId,
      writingOrigin: "typed",
      localRecordingId: null,
      transcriptClientRequestId: null,
      sourceSha256: null,
      callRoomId: null,
      sources: [],
      title: "  Research   reflection ",
      body: "A first paragraph written on iPhone.",
      localRevision: 1,
      expectedServerRevision: 0,
      expectedContentRevision: null,
      destinationProjectId: "research-team",
      richText: null,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        draftId,
        writingOrigin: "typed",
        localRecordingId: null,
        transcriptClientRequestId: null,
        sourceSha256: null,
        callRoomId: null,
        sources: [],
        title: "Research reflection",
        body: "A first paragraph written on iPhone.",
        localRevision: 1,
        expectedServerRevision: 0,
        expectedContentRevision: null,
        destinationProjectId: "research-team",
        richText: null,
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(mobileVoiceWritingSource(result.value, "user-1")).toMatchObject({
      schema: "quipsly-mobile-writing-v2",
      writingOrigin: "typed",
      localRecordingId: null,
      transcriptClientRequestId: null,
      sourceSha256: null,
      sources: [],
      destinationProjectId: "research-team",
    });
  });

  it("does not let recorded writing lose its source evidence", () => {
    expect(validateMobileVoiceWriting({
      draftId,
      writingOrigin: "recorded",
      localRecordingId: null,
      transcriptClientRequestId: null,
      sourceSha256: null,
      callRoomId: null,
      sources: [],
      title: "Draft",
      body: "Text",
      localRevision: 1,
      expectedServerRevision: 0,
    })).toMatchObject({ ok: false, code: "VOICE_WRITING_SOURCES_INVALID" });
  });

  it.each([
    [{ schema: "quipsly-writing-runs-v1", text: "Different", marks: [] }, "mismatched text"],
    [{ schema: "quipsly-writing-runs-v1", text: "Text", marks: [{ kind: "sparkles", startUtf16: 0, endUtf16: 1 }] }, "unknown mark"],
    [{ schema: "quipsly-writing-runs-v1", text: "Text", marks: [{ kind: "bold", startUtf16: 0, endUtf16: 8 }] }, "out-of-bounds mark"],
    [{ schema: "quipsly-writing-runs-v1", text: "Text", marks: [], structures: [{ kind: "banner", startUtf16: 0, endUtf16: 4 }] }, "unknown structure"],
    [{ schema: "quipsly-writing-runs-v1", text: "Text", marks: [], structures: [{ kind: "heading", startUtf16: 1, endUtf16: 4 }] }, "partial-line structure"],
    [{ schema: "quipsly-writing-runs-v1", text: "Text", marks: [], structures: [
      { kind: "heading", startUtf16: 0, endUtf16: 4 },
      { kind: "subheading", startUtf16: 0, endUtf16: 4 },
    ] }, "overlapping structures"],
  ])("rejects %s rich writing", (richText, _reason) => {
    expect(validateMobileVoiceWriting({
      draftId,
      localRecordingId: recordingId,
      transcriptClientRequestId: transcriptId,
      sourceSha256: "a".repeat(64),
      callRoomId: null,
      title: "Draft",
      body: "Text",
      localRevision: 1,
      expectedServerRevision: 0,
      richText,
    })).toMatchObject({ ok: false, code: "VOICE_WRITING_RICH_TEXT_INVALID" });
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
    [{ draftId, writingOrigin: "typed", sources: [], body: "Text", localRevision: 1, expectedServerRevision: 0, destinationProjectId: "not a project" }, "VOICE_WRITING_DESTINATION_INVALID"],
  ])("rejects malformed durable drafts", (input, code) => {
    expect(validateMobileVoiceWriting(input)).toMatchObject({ ok: false, code });
  });
});
