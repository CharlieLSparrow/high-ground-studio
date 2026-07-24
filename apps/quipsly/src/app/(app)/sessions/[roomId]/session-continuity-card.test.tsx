import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SessionContinuityState } from "./session-continuity-model";
import { SessionContinuityCard } from "./session-continuity-card";

function continuity(saved: SessionContinuityState["saved"] = []): SessionContinuityState {
  return {
    current: {
      snapshotSha256: "a".repeat(64),
      summary: {
        noteCount: 1,
        openTaskCount: 1,
        completedTaskCount: 0,
        activeGoalCount: 1,
        achievedGoalCount: 0,
        plannedBlockCount: 1,
        completedBlockCount: 0,
        unresolvedPastBlockCount: 1,
      },
      snapshot: {
        schema: "quipsly-session-continuity-brief-v1",
        actorUserId: "actor-1",
        room: {
          id: "room-1",
          title: "Coaching rehearsal",
          purpose: "COACHING",
          status: "ENDED",
          projectId: "project-1",
          updatedAt: "2026-07-20T16:00:00.000Z",
        },
        notes: [{
          id: "note-1",
          title: "Bring forward",
          bodyExcerpt: "Name the next rehearsal.",
          bodySha256: "b".repeat(64),
          updatedAt: "2026-07-20T16:00:00.000Z",
          tags: [],
        }],
        tasks: [{
          id: "task-1",
          title: "Rehearse follow-through",
          detailExcerpt: "Use the canonical records.",
          detailSha256: "c".repeat(64),
          status: "OPEN",
          dueAt: null,
          completedAt: null,
          updatedAt: "2026-07-20T16:01:00.000Z",
          tagIds: [],
          goalIds: ["goal-1"],
          planBlockIds: ["block-1"],
        }],
        goals: [{
          id: "goal-1",
          title: "Build a coaching habit",
          descriptionExcerpt: null,
          descriptionSha256: null,
          status: "ACTIVE",
          targetAt: null,
          achievedAt: null,
          updatedAt: "2026-07-20T16:02:00.000Z",
          tagIds: [],
          taskIds: ["task-1"],
          planBlockIds: ["block-1"],
          latestProgress: null,
        }],
        planBlocks: [{
          id: "block-1",
          actionItemId: "task-1",
          goalId: "goal-1",
          startsAt: "2026-07-20T16:00:00.000Z",
          endsAt: "2026-07-20T16:50:00.000Z",
          timezone: "America/Denver",
          status: "PLANNED",
          completedAt: null,
          updatedAt: "2026-07-20T16:01:00.000Z",
        }],
        externalSideEffects: false,
        aiGenerated: false,
      },
    },
    saved,
    canSave: true,
  };
}

function response(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}

describe("SessionContinuityCard", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("makes canonical work, overdue truth, and side-effect boundaries obvious", () => {
    render(<SessionContinuityCard roomId="room-1" initial={continuity()} />);

    expect(screen.getByRole("heading", { name: "Next-session continuity" })).toBeInTheDocument();
    expect(screen.getByText(/passed without a completion, skip, or cancellation decision/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rehearse follow-through/i })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: /build a coaching habit/i })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByRole("link", { name: /bring forward/i })).toHaveAttribute("href", "/sessions/room-1?mode=notes#session-note-note-1");
    expect(screen.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/schedule");
    expect(screen.getByText(/private to this actor · no AI · no external side effects/i)).toBeInTheDocument();
  });

  it("saves the exact displayed receipt and reads the private brief back", async () => {
    const saved = {
      id: "brief-1",
      title: "Next-session brief — Coaching rehearsal",
      body: "Exact saved brief",
      snapshotSha256: "a".repeat(64),
      createdAt: "2026-07-24T18:00:00.000Z",
    };
    const updated = continuity([saved]);
    const fetchMock = jest.fn().mockResolvedValue(response({
      ok: true,
      idempotentReplay: false,
      continuity: updated,
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionContinuityCard roomId="room-1" initial={continuity()} />);

    await user.click(screen.getByRole("button", { name: "Save private brief" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sessions/room-1/continuity-brief");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      expectedSnapshotSha256: "a".repeat(64),
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(await screen.findByText(/private next-session brief saved with exact note, task, goal, and focus-block receipts/i)).toBeInTheDocument();
    expect(screen.getByText("1 saved private brief")).toBeInTheDocument();
  });
});
