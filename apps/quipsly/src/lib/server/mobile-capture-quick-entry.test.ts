import {
  mobileCaptureQuickEntryId,
  mobileCaptureQuickEntrySeriesId,
  mobileCaptureQuickEntrySource,
  validateMobileCaptureQuickEntry,
} from "./mobile-capture-quick-entry";

const requestId = "018f4f2a-7b61-7d3c-8a55-90d799e0d5f4";

describe("mobile Capture quick-entry contract", () => {
  it("normalizes an explicit task without inventing dates or external actions", () => {
    const result = validateMobileCaptureQuickEntry({
      clientRequestId: requestId.toUpperCase(),
      callRoomId: " room-1 ",
      kind: "task",
      title: "  Send   the revised outline ",
      body: " Include the corrected   opening beat. ",
      capturedAt: "2026-07-19T09:00:00.000Z",
    });
    expect(result).toEqual({ ok: true, value: {
      clientRequestId: requestId,
      callRoomId: "room-1",
      projectId: null,
      kind: "TASK",
      noteKind: null,
      noteVisibility: null,
      title: "Send the revised outline",
      body: "Include the corrected   opening beat.",
      sourceUrl: null,
      tagIds: [],
      newTagLabels: [],
      capturedAt: new Date("2026-07-19T09:00:00.000Z"),
      dueAt: null,
      reminderAt: null,
      recurrence: null,
    } });
    if (!result.ok) return;
    expect(mobileCaptureQuickEntryId(result.value.kind, result.value.clientRequestId)).toBe(`mobile-task-${requestId}`);
    expect(mobileCaptureQuickEntrySource(result.value, "user-1", "project-1")).toMatchObject({
      schema: "quipsly-mobile-quick-entry-v1",
      surface: "ios-capture",
      origin: "explicit-human-capture",
      humanCommitted: true,
      offlineRetrySafe: true,
      externalSideEffects: false,
      calendarMutated: false,
      messageSent: false,
      published: false,
    });
  });

  it("accepts an explicit iPhone recurrence rule without inventing reminders or provider work", () => {
    const result = validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      callRoomId: "room-1",
      kind: "TASK",
      title: "Weekly production review",
      body: "Listen against the retained source.",
      capturedAt: "2026-07-19T09:00:00.000Z",
      recurrence: {
        cadence: "FIXED",
        frequency: "WEEKLY",
        interval: 1,
        timezone: "America/Denver",
        localTimeMinutes: 540,
        anchorLocalDate: "2026-07-27",
      },
    });
    expect(result).toMatchObject({ ok: true, value: { recurrence: {
      cadence: "FIXED",
      frequency: "WEEKLY",
      interval: 1,
      timezone: "America/Denver",
      localTimeMinutes: 540,
      anchorLocalDate: "2026-07-27",
      anchorDayOfMonth: 27,
    } } });
    expect(mobileCaptureQuickEntrySeriesId(requestId)).toBe(`mobile-task-series-${requestId}`);
    if (!result.ok) return;
    expect(mobileCaptureQuickEntrySource(result.value, "user-1", "project-1")).toMatchObject({
      recurrence: result.value.recurrence,
      externalSideEffects: false,
    });
  });

  it("allows a body-first note and preserves its intentional line structure", () => {
    expect(validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      callRoomId: "room-1",
      kind: "NOTE",
      body: "First observation\n\nSecond observation",
      capturedAt: "2026-07-19T09:00:00.000Z",
    })).toMatchObject({
      ok: true,
      value: {
        title: null,
        body: "First observation\n\nSecond observation",
        noteKind: "SESSION_NOTE",
        noteVisibility: "AUTHOR_PRIVATE",
      },
    });
  });

  it("preserves an explicit Session note purpose and audience in the retry identity", () => {
    const result = validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      callRoomId: "room-1",
      kind: "NOTE",
      noteKind: "decision",
      noteVisibility: "client_safe",
      title: "Opening decision",
      body: "Keep the quiet question before the first clip.",
      capturedAt: "2026-07-19T09:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        noteKind: "DECISION",
        noteVisibility: "CLIENT_SAFE",
      },
    });
    if (!result.ok) return;
    expect(mobileCaptureQuickEntrySource(result.value, "user-1", "project-1")).toMatchObject({
      noteKind: "DECISION",
      noteVisibility: "CLIENT_SAFE",
      externalSideEffects: false,
      messageSent: false,
      published: false,
    });
  });

  it("allows a personal source capture without pretending it already belongs to a Session or Nest", () => {
    expect(validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      kind: "SOURCE",
      title: "Interview reference",
      body: "https://example.com/interview",
      capturedAt: "2026-07-19T09:00:00.000Z",
    })).toMatchObject({ ok: true, value: { kind: "SOURCE", callRoomId: null, title: "Interview reference", body: "https://example.com/interview", sourceUrl: null } });
  });

  it.each([
    ["TASK", "Prepare the next episode"],
    ["GOAL", "Publish consistently"],
  ] as const)("allows a personal %s to target the Home Nest without a Session", (kind, title) => {
    expect(validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      kind,
      title,
      body: "Keep the next action honest and visible.",
      capturedAt: "2026-07-19T09:00:00.000Z",
    })).toMatchObject({
      ok: true,
      value: {
        kind,
        callRoomId: null,
        title,
      },
    });
  });

  it("retains one explicit writable Nest destination without inventing a Session", () => {
    expect(validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      projectId: "project-high-ground",
      kind: "TASK",
      title: "Shape the next episode",
      body: "Keep the work with its real project.",
      tagIds: ["tag-episode"],
      capturedAt: "2026-07-19T09:00:00.000Z",
    })).toMatchObject({
      ok: true,
      value: {
        callRoomId: null,
        projectId: "project-high-ground",
        kind: "TASK",
        tagIds: ["tag-episode"],
      },
    });
  });

  it("preserves a selected passage together with its canonical webpage provenance", () => {
    expect(validateMobileCaptureQuickEntry({
      clientRequestId: requestId,
      kind: "SOURCE",
      title: "Interview reference",
      body: "The selected passage stays exact.",
      sourceUrl: "https://example.com/interview#section",
      capturedAt: "2026-07-19T09:00:00.000Z",
    })).toMatchObject({ ok: true, value: { kind: "SOURCE", body: "The selected passage stays exact.", sourceUrl: "https://example.com/interview#section" } });
  });

  it.each([
    [{ callRoomId: "room-1", kind: "NOTE", body: "A note" }, "QUICK_ENTRY_REQUEST_ID_INVALID"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "IDEA", body: "Maybe" }, "QUICK_ENTRY_KIND_INVALID"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "NOTE", body: "" }, "QUICK_ENTRY_NOTE_REQUIRED"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "NOTE", noteKind: "SUMMARY", body: "Not editable" }, "QUICK_ENTRY_NOTE_KIND_INVALID"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "NOTE", noteVisibility: "PUBLIC", body: "Not public" }, "QUICK_ENTRY_NOTE_VISIBILITY_INVALID"],
    [{ clientRequestId: requestId, kind: "NOTE", noteVisibility: "CLIENT_SAFE", body: "No Session" }, "QUICK_ENTRY_NOTE_POLICY_SESSION_ONLY"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "TASK", noteKind: "DECISION", title: "Not a note" }, "QUICK_ENTRY_NOTE_POLICY_SESSION_ONLY"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "GOAL", title: "" }, "QUICK_ENTRY_TITLE_REQUIRED"],
    [{ clientRequestId: requestId, kind: "SOURCE", body: "" }, "QUICK_ENTRY_SOURCE_REQUIRED"],
    [{ clientRequestId: requestId, kind: "SOURCE", body: "Passage", sourceUrl: "file:///private/source" }, "QUICK_ENTRY_SOURCE_URL_INVALID"],
    [{ clientRequestId: requestId, callRoomId: "room-1", projectId: "project-1", kind: "NOTE", body: "Ambiguous" }, "QUICK_ENTRY_DESTINATION_CONFLICT"],
    [{ clientRequestId: requestId, projectId: "project-1", kind: "SOURCE", body: "Private first" }, "QUICK_ENTRY_SOURCE_REQUIRES_INBOX"],
    [{ clientRequestId: requestId, kind: "SOURCE", body: "https://example.com/a", sourceUrl: "https://example.com/b" }, "QUICK_ENTRY_SOURCE_URL_CONFLICT"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "GOAL", title: "Repeat me", recurrence: { cadence: "FIXED" } }, "QUICK_ENTRY_RECURRENCE_TASK_ONLY"],
    [{ clientRequestId: requestId, callRoomId: "room-1", kind: "TASK", title: "Bad repeat", recurrence: { cadence: "FIXED", frequency: "WEEKLY", interval: 0, timezone: "Not/AZone", localTimeMinutes: 1_500, anchorLocalDate: "2026-02-30" } }, "QUICK_ENTRY_RECURRENCE_INVALID"],
  ])("fails closed before writes for malformed input %#", (input, code) => {
    expect(validateMobileCaptureQuickEntry(input)).toMatchObject({ ok: false, code });
  });
});
