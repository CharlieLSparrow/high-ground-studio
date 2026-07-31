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

const eligible = {
  notes: [
    {
      id: "note-safe",
      title: "Practice evidence",
      body: "Bring one concrete example.",
      kind: "FOLLOW_UP",
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
      },
    ],
    tasks: [
      {
        id: "task-client",
        title: "Run one protected rehearsal",
        detail: "Write down what changed.",
        status: "OPEN",
        dueAt: null,
      },
    ],
    goals: [
      {
        id: "goal-client",
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence.",
        status: "ACTIVE",
        targetAt: null,
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
      output: { ...releasedOutput, status: "DRAFT", revision: 1, releasedAt: null },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(coachState))
      .mockResolvedValueOnce(response({
        ok: true,
        output: draftState.output,
        idempotentReplay: false,
      }))
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
      .mockResolvedValueOnce(response({
        ok: true,
        output: openedState.output,
        idempotentReplay: false,
      }))
      .mockResolvedValueOnce(response(openedState));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionClientFollowUpCard roomId="room-1" />);

    expect(
      await screen.findByText("Here is the exact work we agreed to carry forward."),
    ).toBeInTheDocument();
    expect(screen.getByText("Bring one concrete example.")).toBeInTheDocument();
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
});
