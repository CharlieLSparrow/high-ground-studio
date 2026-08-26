import { sessionTranscriptResults } from "./session-transcript-results";

describe("sessionTranscriptResults", () => {
  it("returns only ordinary work bound to the exact room and transcript", () => {
    const source = {
      origin: "quipsly-session-follow-through",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      startSeconds: 12.4,
      endSeconds: 17.8,
      speakerLabel: "Client",
    };
    const result = sessionTranscriptResults({
      roomId: "room-1",
      transcriptJobId: "job-1",
      summary: { id: "summary-1", title: "Recap", body: "A useful Session." },
      highlights: [{ id: "note-1", title: "Insight", body: "Pause first.", sourceJson: source }],
      actionItems: [
        { id: "task-1", title: "Practice", detail: null, status: "OPEN", assignedUserId: "client-1", sourceJson: source },
        { id: "task-other", title: "Wrong room", status: "OPEN", sourceJson: { ...source, roomId: "room-2" } },
      ],
      goals: [
        { id: "goal-1", title: "Respond intentionally", description: null, status: "ACTIVE", ownerUserId: "client-1", sourceJson: source },
        { id: "goal-other", title: "Wrong transcript", status: "ACTIVE", ownerUserId: "client-1", sourceJson: { ...source, transcriptJobId: "job-2" } },
      ],
    });

    expect(result).toMatchObject({
      automaticallyCreated: true,
      editable: true,
      removable: true,
      notes: [{ id: "note-1", source: { segmentId: "segment-1", speakerLabel: "Client" } }],
      tasks: [{ id: "task-1" }],
      goals: [{ id: "goal-1" }],
    });
  });
});
