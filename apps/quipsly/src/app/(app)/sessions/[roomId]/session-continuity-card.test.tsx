import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SessionContinuityState } from "./session-continuity-model";
import { SessionContinuityCard } from "./session-continuity-card";

const mergedTaskEvidence = {
  receiptId: "task-evidence-receipt-1",
  actionCandidateId: "packet-action-build-1-segment-1",
  mergedAt: "2026-07-20T16:04:00.000Z",
  sourceAnchor: {
    schema: "quipsly-transcript-derived-task-v1" as const,
    roomId: "room-1",
    transcriptJobId: "job-1",
    segmentId: "segment-1",
    startSeconds: 63.2,
    endSeconds: 71.8,
    providerTextSha256: "a".repeat(64),
    providerSpeakerLabel: "Speaker",
    effectiveTextSnapshot: "I will run the protected rehearsal before we meet again.",
    effectiveSpeakerLabelSnapshot: "Client",
    speakerAuthority: "source-binding" as const,
    sourceBoundParticipantId: "participant-client",
    acceptedCorrectionId: "correction-1",
    recordingAssetId: "asset-1",
    playbackSourceId: "source-1",
  },
};

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
          lastMergedTranscriptEvidence: mergedTaskEvidence,
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
    prior: null,
    priorFollowThrough: null,
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

  it("keeps canonical work and continuity details available without making them the default surface", async () => {
    const user = userEvent.setup();
    render(<SessionContinuityCard roomId="room-1" initial={continuity()} />);

    expect(screen.getByText("Carry work into the next session")).toBeInTheDocument();
    await user.click(screen.getByText("Carry work into the next session"));
    expect(screen.getByRole("heading", { name: "Next-session continuity" })).toBeInTheDocument();
    expect(screen.getByText(/passed without a completion, skip, or cancellation decision/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rehearse follow-through/i })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getAllByRole("link", { name: "Return to 1:03–1:11" }).some((link) => (
      link.getAttribute("href") === "/sessions/room-1?mode=transcript#transcript-segment-segment-1"
    ))).toBe(true);
    expect(screen.getByText(/evidence was appended without changing task definition/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Participant recording\. This speaker comes from that participant's isolated recording\./i)).toBeInTheDocument();
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

    await user.click(screen.getByText("Carry work into the next session"));
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

  it("shows an exact prior private brief without implying it changed the current Session", async () => {
    const state = continuity();
    state.prior = {
      sourceRoom: {
        id: "room-previous",
        title: "Previous coaching rehearsal",
        purpose: "COACHING",
        projectId: "project-1",
        scheduledStart: "2026-07-18T16:00:00.000Z",
        endedAt: "2026-07-18T17:00:00.000Z",
      },
      brief: {
        id: "brief-previous",
        title: "Next-session brief — Previous coaching rehearsal",
        body: "Carry the exact protected rehearsal forward.",
        snapshotSha256: "d".repeat(64),
        createdAt: "2026-07-18T18:00:00.000Z",
        taskEvidence: [{
          taskId: "task-1",
          taskTitle: "Rehearse follow-through",
          evidence: mergedTaskEvidence,
        }],
      },
      relationship: "legacy-same-project-and-purpose",
      currentSessionMutated: false,
      externalSideEffects: false,
    };

    const user = userEvent.setup();
    render(<SessionContinuityCard roomId="room-1" initial={state} />);

    await user.click(screen.getByText("Carry work into the next session"));
    expect(screen.getByRole("heading", { name: "Previous coaching rehearsal" })).toBeInTheDocument();
    expect(screen.getByText("Carry the exact protected rehearsal forward.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Return to what was actually said" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Participant recording\. This speaker comes from that participant's isolated recording\./i)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Return to 1:03–1:11" }).some((link) => (
      link.getAttribute("href") === "/sessions/room-1?mode=transcript#transcript-segment-segment-1"
    ))).toBe(true);
    expect(screen.getByRole("link", { name: "Open source Session" })).toHaveAttribute("href", "/sessions/room-previous?mode=work");
    expect(screen.getByText(/current Session unchanged · no AI or external side effects/i)).toBeInTheDocument();
  });

  it("shows released coaching work as live canonical follow-through without copying it", async () => {
    const state = continuity();
    state.priorFollowThrough = {
      schema: "quipsly-session-follow-through-v1",
      viewerRole: "CLIENT",
      sourceRoom: {
        id: "room-previous",
        title: "Previous coaching rehearsal",
        projectId: "project-1",
        scheduledStart: "2026-07-18T16:00:00.000Z",
      },
      output: {
        id: "follow-up-1",
        title: "Your follow-through",
        intro: "Use the smallest repeatable version.",
        nextSessionFocus: "What made the rehearsal easier to repeat?",
        contentSha256: "e".repeat(64),
        revision: 2,
        releasedAt: "2026-07-18T18:00:00.000Z",
        recipientLabel: "Retained client",
      },
      tasks: [{
        id: "task-1",
        title: "Run one protected rehearsal",
        detail: "Write down what changed.",
        status: "DONE",
        dueAt: "2026-07-20T18:00:00.000Z",
        completedAt: "2026-07-19T18:00:00.000Z",
        updatedAt: "2026-07-19T18:00:00.000Z",
        availability: "CURRENT",
        changedSinceRelease: true,
        releasedStatus: "OPEN",
        releasedContentSha256: "f".repeat(64),
      }],
      goals: [{
        id: "goal-1",
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence.",
        status: "ACTIVE",
        targetAt: "2026-08-14T18:00:00.000Z",
        achievedAt: null,
        updatedAt: "2026-07-19T18:00:00.000Z",
        availability: "CURRENT",
        changedSinceRelease: false,
        progressedSinceRelease: true,
        releasedStatus: "ACTIVE",
        releasedContentSha256: "1".repeat(64),
        latestProgress: {
          id: "progress-1",
          kind: "CHECK_IN",
          progressPercent: 60,
          note: "The smaller version worked.",
          occurredAt: "2026-07-19T18:00:00.000Z",
        },
      }],
      summary: {
        openTaskCount: 0,
        completedTaskCount: 1,
        activeGoalCount: 1,
        achievedGoalCount: 0,
        changedSinceReleaseCount: 2,
        unavailableCount: 0,
      },
      relationship: "legacy-same-project-purpose-client-and-coach",
      canOpenWork: true,
      canonicalRecordsMutated: false,
      currentSessionMutated: false,
      externalSideEffects: false,
    };

    const user = userEvent.setup();
    render(<SessionContinuityCard roomId="room-1" initial={state} />);

    await user.click(screen.getByText("Carry work into the next session"));
    expect(screen.getByRole("heading", { name: "Your follow-through" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run one protected rehearsal/i })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: /use a sustainable boundary/i })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByText(/updated since release · was Open/i)).toBeInTheDocument();
    expect(screen.getByText(/60% at latest check-in/i)).toBeInTheDocument();
    expect(screen.getByText(/new check-in since release/i)).toBeInTheDocument();
    expect(screen.getByText(/same canonical IDs · no copied work/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open release source" })).toHaveAttribute("href", "/sessions/room-previous?mode=outputs");
  });
});
