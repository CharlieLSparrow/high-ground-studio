import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionClientFollowUpCard } from "./session-client-follow-up-card";

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

const room = {
  id: "room-1",
  title: "Coaching rehearsal",
  scheduledStart: "2026-07-31T16:00:00.000Z",
  coach: { id: "coach-1", label: "Coach Test" },
  client: { id: "client-1", label: "Client Test" },
};

const sourceAnchor = (schema: string, segmentId: string) => ({
  schema,
  roomId: "room-1",
  transcriptJobId: "transcript-1",
  segmentId,
  startSeconds: 63.4,
  endSeconds: 68.9,
  providerTextSha256: "b".repeat(64),
  providerSpeakerLabel: "Speaker 2",
  effectiveTextSnapshot: "I will rehearse the boundary once and bring the evidence back.",
  effectiveSpeakerLabelSnapshot: "Client Test",
  acceptedCorrectionId: "correction-1",
  recordingAssetId: "asset-1",
  playbackSourceId: "playback-1",
});

const eligible = {
  notes: [
    {
      id: "note-safe",
      title: "Practice evidence",
      body: "Bring one concrete example.",
      kind: "FOLLOW_UP",
      sourceAnchor: sourceAnchor("quipsly-transcript-derived-note-v1", "note-segment"),
      revisionCount: 1,
      updatedAt: "2026-07-31T17:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-client",
      title: "Run one protected rehearsal",
      detail: "Write down what changed.",
      status: "OPEN",
      dueAt: null,
      completedAt: null,
      sourceAnchor: sourceAnchor("quipsly-transcript-derived-task-v1", "task-segment"),
      updatedAt: "2026-07-31T17:00:00.000Z",
    },
  ],
  goals: [
    {
      id: "goal-client",
      title: "Use a sustainable boundary",
      description: "Prefer repeatable evidence.",
      status: "ACTIVE",
      targetAt: null,
      achievedAt: null,
      sourceAnchor: sourceAnchor("quipsly-transcript-derived-goal-v1", "goal-segment"),
      updatedAt: "2026-07-31T17:00:00.000Z",
    },
  ],
};

const releasedOutput = {
  id: "follow-up-1",
  roomId: "room-1",
  createdByUserId: "coach-1",
  recipientUserId: "client-1",
  kind: "CLIENT_FOLLOW_UP",
  status: "RELEASED",
  title: "Your coaching follow-up",
  intro: "Here is the exact work we agreed to carry forward.",
  nextSessionFocus: "Review the rehearsal evidence.",
  contentSha256: "a".repeat(64),
  revision: 2,
  releasedAt: "2026-07-31T17:05:00.000Z",
  revokedAt: null,
  createdAt: "2026-07-31T17:00:00.000Z",
  updatedAt: "2026-07-31T17:05:00.000Z",
  createdBy: { id: "coach-1", label: "Coach Test" },
  recipient: { id: "client-1", label: "Client Test" },
  body: {
    schema: "quipsly-client-follow-up-v1",
    notes: [
      {
        id: "note-safe",
        title: "Practice evidence",
        body: "Bring one concrete example.",
        kind: "FOLLOW_UP",
        sourceAnchor: sourceAnchor("quipsly-transcript-derived-note-v1", "note-segment"),
      },
    ],
    tasks: [
      {
        id: "task-client",
        title: "Run one protected rehearsal",
        detail: "Write down what changed.",
        status: "OPEN",
        dueAt: null,
        sourceAnchor: sourceAnchor("quipsly-transcript-derived-task-v1", "task-segment"),
      },
    ],
    goals: [
      {
        id: "goal-client",
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence.",
        status: "ACTIVE",
        targetAt: null,
        sourceAnchor: sourceAnchor("quipsly-transcript-derived-goal-v1", "goal-segment"),
      },
    ],
    nextSessionFocus: "Review the rehearsal evidence.",
  },
  deliveryEvents: [
    {
      id: "release-event",
      kind: "RELEASED_IN_APP",
      actorUserId: "coach-1",
      recipientUserId: "client-1",
      occurredAt: "2026-07-31T17:05:00.000Z",
      contentSha256: "a".repeat(64),
    },
  ],
};

const readyReadiness = {
  status: "READY",
  releaseAllowed: true,
  checkedRevision: 1,
  selectedCount: 3,
  changedCount: 0,
  changes: [],
};

describe("SessionClientFollowUpCard", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("defaults only eligible canonical records into a private coach draft", async () => {
    const coachState = {
      ok: true,
      role: "COACH",
      room,
      eligible,
      output: null,
    };
    const draftState = {
      ...coachState,
      readiness: readyReadiness,
      output: {
        ...releasedOutput,
        status: "DRAFT",
        revision: 1,
        releasedAt: null,
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(coachState))
      .mockResolvedValueOnce(
        response({
          ok: true,
          output: draftState.output,
          idempotentReplay: false,
        }),
      )
      .mockResolvedValueOnce(response(draftState));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(
      await screen.findByRole("heading", { name: "Client follow-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Unreviewed transcript candidates, private notes/i),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(
      screen.getByText(/3 canonical records selected/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Includes exact source 01:03–01:08/i)).toHaveLength(3);

    await user.click(
      screen.getByRole("button", { name: /create private draft/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/sessions/room-1/client-follow-up");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      action: "CREATE_DRAFT",
      title: "Follow-up — Coaching rehearsal",
      noteIds: ["note-safe"],
      taskIds: ["task-client"],
      goalIds: ["goal-client"],
    });
    expect(
      await screen.findByText(/The client cannot see it yet/i),
    ).toBeInTheDocument();
  });

  it("shows only a released snapshot to the client and explicitly receipts its open", async () => {
    const clientState = {
      ok: true,
      role: "CLIENT",
      room,
      eligible: null,
      output: releasedOutput,
    };
    const openedState = {
      ...clientState,
      output: {
        ...releasedOutput,
        deliveryEvents: [
          ...releasedOutput.deliveryEvents,
          {
            id: "opened-event",
            kind: "OPENED_IN_APP",
            actorUserId: "client-1",
            recipientUserId: "client-1",
            occurredAt: "2026-07-31T17:06:00.000Z",
            contentSha256: "a".repeat(64),
          },
        ],
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(clientState))
      .mockResolvedValueOnce(
        response({
          ok: true,
          output: openedState.output,
          idempotentReplay: false,
        }),
      )
      .mockResolvedValueOnce(response(openedState));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(
      await screen.findByText(
        "Here is the exact work we agreed to carry forward.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bring one concrete example.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to exact source for Practice evidence at 01:03" }),
    ).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript#transcript-segment-note-segment",
    );
    expect(
      screen.getByRole("link", { name: "Return to exact source for Run one protected rehearsal at 01:03" }),
    ).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript#transcript-segment-task-segment",
    );
    expect(
      screen.getByRole("link", { name: "Return to exact source for Use a sustainable boundary at 01:03" }),
    ).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript#transcript-segment-goal-segment",
    );
    expect(
      screen.queryByRole("button", { name: /create private draft/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirm follow-up opened" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      action: "ACKNOWLEDGE_OPEN",
      outputId: "follow-up-1",
    });
    expect(
      await screen.findByText(
        /recipient-confirmed in-app open receipt for this exact content hash/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm follow-up opened" }),
    ).toBeDisabled();
  });

  it("reopens the current private draft and saves an explicit immutable revision", async () => {
    const draftOutput = {
      ...releasedOutput,
      status: "DRAFT",
      revision: 1,
      releasedAt: null,
    };
    const revisedOutput = {
      ...draftOutput,
      revision: 2,
      intro: "A clearer review after checking the exact commitments.",
    };
    const initialState = {
      ok: true,
      role: "COACH",
      room,
      eligible,
      readiness: readyReadiness,
      output: draftOutput,
    };
    const revisedState = {
      ...initialState,
      readiness: { ...readyReadiness, checkedRevision: 2 },
      output: revisedOutput,
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(initialState))
      .mockResolvedValueOnce(
        response({
          ok: true,
          output: revisedOutput,
          idempotentReplay: false,
        }),
      )
      .mockResolvedValueOnce(response(revisedState));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(
      await screen.findByText(/Editing private revision 1/i),
    ).toBeInTheDocument();
    const intro = screen.getByLabelText("Opening note");
    expect(intro).toHaveValue(
      "Here is the exact work we agreed to carry forward.",
    );
    await user.clear(intro);
    await user.type(
      intro,
      "A clearer review after checking the exact commitments.",
    );
    await user.click(
      screen.getByRole("button", { name: /save private draft changes/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      action: "UPDATE_DRAFT",
      outputId: "follow-up-1",
      expectedRevision: 1,
      intro: "A clearer review after checking the exact commitments.",
      noteIds: ["note-safe"],
      taskIds: ["task-client"],
      goalIds: ["goal-client"],
    });
    expect(
      await screen.findByText(
        /Private draft revised with an immutable history/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Editing private revision 2/i)).toBeInTheDocument();
  });

  it("holds release when a selected canonical record changed and directs the coach to save a current revision", async () => {
    const draftOutput = {
      ...releasedOutput,
      status: "DRAFT",
      revision: 4,
      releasedAt: null,
    };
    const state = {
      ok: true,
      role: "COACH",
      room,
      eligible: {
        ...eligible,
        tasks: [{ ...eligible.tasks[0], detail: "Use the newly agreed rehearsal format." }],
      },
      output: draftOutput,
      readiness: {
        status: "SOURCE_CHANGED",
        releaseAllowed: false,
        checkedRevision: 4,
        selectedCount: 3,
        changedCount: 1,
        changes: [{
          kind: "TASK",
          id: "task-client",
          label: "Run one protected rehearsal",
          reason: "CONTENT_CHANGED",
        }],
      },
    };
    global.fetch = jest.fn().mockResolvedValue(response(state)) as typeof fetch;

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(await screen.findByText("Release held — review current sources")).toBeInTheDocument();
    expect(screen.getByText(/Task · Run one protected rehearsal/).closest("li")).toHaveTextContent(/changed after this draft was saved/i);
    expect(screen.getByText(/Review the current selections.*save private draft changes/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /I reviewed this exact snapshot/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release to client in Quipsly" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save private draft changes" })).toBeEnabled();
  });

  it("clears confirmation and holds release while the editor differs from the immutable private revision", async () => {
    const user = userEvent.setup();
    const draftOutput = {
      ...releasedOutput,
      status: "DRAFT",
      releasedAt: null,
    };
    global.fetch = jest.fn().mockResolvedValue(response({
      ok: true,
      role: "COACH",
      room,
      eligible,
      output: draftOutput,
      readiness: { ...readyReadiness, checkedRevision: 2 },
    })) as typeof fetch;

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(await screen.findByText("Current sources verified")).toBeInTheDocument();
    const confirmation = screen.getByRole("checkbox", {
      name: /I reviewed this exact snapshot/i,
    });
    await user.click(confirmation);
    expect(confirmation).toBeChecked();

    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Follow-up with one unsaved clarification");

    expect(await screen.findByText("Save edits before release")).toBeInTheDocument();
    expect(screen.getByText(/release controls still point to private revision 2/i)).toBeInTheDocument();
    await waitFor(() => expect(confirmation).not.toBeChecked());
    expect(confirmation).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release to client in Quipsly" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save private draft changes" })).toBeEnabled();
  });
});
