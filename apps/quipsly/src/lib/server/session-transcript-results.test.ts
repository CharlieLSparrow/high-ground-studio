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
      highlights: [
        {
          id: "note-1",
          title: "Insight",
          body: "Pause first.",
          sourceJson: source,
        },
      ],
      actionItems: [
        {
          id: "task-1",
          title: "Practice",
          detail: null,
          status: "OPEN",
          assignedUserId: "client-1",
          sourceJson: source,
        },
        {
          id: "task-other",
          title: "Wrong room",
          status: "OPEN",
          sourceJson: { ...source, roomId: "room-2" },
        },
      ],
      goals: [
        {
          id: "goal-1",
          title: "Respond intentionally",
          description: null,
          status: "ACTIVE",
          ownerUserId: "client-1",
          sourceJson: source,
        },
        {
          id: "goal-other",
          title: "Wrong transcript",
          status: "ACTIVE",
          ownerUserId: "client-1",
          sourceJson: { ...source, transcriptJobId: "job-2" },
        },
      ],
    });

    expect(result).toMatchObject({
      automaticallyCreated: true,
      editable: true,
      removable: true,
      notes: [
        {
          id: "note-1",
          source: { segmentId: "segment-1", speakerLabel: "Client" },
        },
      ],
      tasks: [{ id: "task-1" }],
      goals: [{ id: "goal-1" }],
    });
  });

  it("returns work from every assembled participant source with source and Session clocks", () => {
    const result = sessionTranscriptResults({
      roomId: "room-1",
      transcriptJobId: "job-coach",
      transcriptJobIds: ["job-coach", "job-client"],
      summary: { id: "summary-1", title: "Recap", body: "Shared recap." },
      highlights: [
        {
          id: "note-client",
          title: "Client insight",
          body: "Pause and breathe.",
          sourceJson: {
            transcriptJobId: "job-client",
            recordingAssetId: "asset-client",
            segmentId: "segment-client",
            startSeconds: 2,
            endSeconds: 4,
            sourceStartSeconds: 2,
            sourceEndSeconds: 4,
            programStartSeconds: 2.75,
            programEndSeconds: 4.75,
            speakerLabel: "Client",
          },
        },
      ],
      actionItems: [
        {
          id: "task-client",
          title: "Practice pausing",
          status: "OPEN",
          sourceJson: {
            origin: "quipsly-session-follow-through",
            roomId: "room-1",
            transcriptJobId: "job-client",
            recordingAssetId: "asset-client",
            segmentId: "segment-client",
            startSeconds: 2,
            endSeconds: 4,
            sourceStartSeconds: 2,
            sourceEndSeconds: 4,
            programStartSeconds: 2.75,
            programEndSeconds: 4.75,
            speakerLabel: "Client",
          },
        },
      ],
      goals: [
        {
          id: "goal-other",
          title: "Never leak a neighboring transcript",
          status: "ACTIVE",
          sourceJson: {
            origin: "quipsly-session-follow-through",
            roomId: "room-1",
            transcriptJobId: "job-neighbor",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      notes: [
        {
          id: "note-client",
          source: {
            transcriptJobId: "job-client",
            recordingAssetId: "asset-client",
            sourceStartSeconds: 2,
            programStartSeconds: 2.75,
          },
        },
      ],
      tasks: [
        {
          id: "task-client",
          source: {
            transcriptJobId: "job-client",
            recordingAssetId: "asset-client",
            sourceStartSeconds: 2,
            programStartSeconds: 2.75,
          },
        },
      ],
      goals: [],
    });
  });
});
