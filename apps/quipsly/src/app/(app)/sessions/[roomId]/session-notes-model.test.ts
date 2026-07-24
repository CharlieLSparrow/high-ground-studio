import {
  noteAppearsInView,
  parseSessionNoteView,
  sessionNotesHref,
  sessionNoteViewCounts,
  type SessionWorkspaceNote,
} from "./session-notes-model";

function note(
  id: string,
  visibility: SessionWorkspaceNote["visibility"],
  kind: SessionWorkspaceNote["kind"] = "SESSION_NOTE",
): SessionWorkspaceNote {
  return {
    id,
    title: id,
    body: id,
    kind,
    visibility,
    author: { id: "actor", label: "Charlie", isCurrentActor: true },
    originLabel: "Nest",
    canEdit: true,
    revisionCount: 1,
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
    tags: [],
  };
}

describe("Session Notes views", () => {
  const notes = [
    note("private", "AUTHOR_PRIVATE"),
    note("shared", "SESSION_SHARED"),
    note("client", "CLIENT_SAFE"),
    note("production", "PROJECT_TEAM", "PRODUCTION"),
    note("decision", "SESSION_SHARED", "DECISION"),
  ];

  it("parses URL-safe views and keeps all as the safe fallback", () => {
    expect(parseSessionNoteView("client-safe")).toBe("client-safe");
    expect(parseSessionNoteView(["decisions", "private"])).toBe("decisions");
    expect(parseSessionNoteView("transcript")).toBe("all");
    expect(sessionNotesHref("room / 1", "private")).toBe("/sessions/room%20%2F%201?mode=notes&view=private");
  });

  it("keeps purpose and visibility as separate filtering axes", () => {
    expect(notes.filter((item) => noteAppearsInView(item, "private")).map((item) => item.id)).toEqual(["private"]);
    expect(notes.filter((item) => noteAppearsInView(item, "production")).map((item) => item.id)).toEqual(["production"]);
    expect(notes.filter((item) => noteAppearsInView(item, "decisions")).map((item) => item.id)).toEqual(["decision"]);
    expect(sessionNoteViewCounts(notes)).toEqual({
      all: 5,
      private: 1,
      shared: 2,
      "client-safe": 1,
      production: 1,
      decisions: 1,
    });
  });
});
