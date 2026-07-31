import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SchedulePlanner } from "./schedule-planner";
import { createWorkPlanBlock, rescheduleWorkPlanBlock } from "./actions";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("./actions", () => ({ createWorkPlanBlock: jest.fn(), rescheduleWorkPlanBlock: jest.fn(), updateWorkPlanBlockStatus: jest.fn() }));

describe("SchedulePlanner", () => {
  beforeEach(() => {
    jest.mocked(createWorkPlanBlock).mockReset();
    jest.mocked(rescheduleWorkPlanBlock).mockReset();
  });

  it("keeps internal planning, deadlines, appointments, and provider calendars visibly separate", () => {
    render(<SchedulePlanner initialBlocks={[]} targets={[]} />);
    expect(screen.getByRole("heading", { name: "Put the work on your day" })).toBeInTheDocument();
    expect(screen.getByText(/not a deadline, appointment, provider event/i)).toBeInTheDocument();
    expect(screen.getByText(/does not call Google Calendar or send invitations/i)).toBeInTheDocument();
    expect(screen.getByText(/No personal focus blocks are saved yet/i)).toBeInTheDocument();
  });

  it("keeps a planned transcript-derived task linked to its exact reviewed source", () => {
    render(<SchedulePlanner initialBlocks={[{
      id: "plan-1",
      targetType: "task",
      targetId: "task-1",
      title: "Use the client commitment",
      targetStatus: "OPEN",
      startsAt: "2026-07-19T18:00:00.000Z",
      endsAt: "2026-07-19T18:50:00.000Z",
      timezone: "America/Denver",
      status: "PLANNED",
      completedAt: null,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: "room-1",
      tags: [{ id: "tag-1", label: "Coaching follow-up", isActive: true }],
      sourceAnchor: {
        schema: "quipsly-transcript-derived-task-v1",
        roomId: "room-1",
        transcriptJobId: "job-1",
        segmentId: "segment-1",
        startSeconds: 3.66,
        endSeconds: 4.84,
        providerTextSha256: "a".repeat(64),
        providerSpeakerLabel: "Speaker",
        effectiveTextSnapshot: "Keep one clear next move.",
        effectiveSpeakerLabelSnapshot: "Homer",
        acceptedCorrectionId: "correction-1",
        recordingAssetId: "asset-1",
        playbackSourceId: "playback-1",
      },
    }]} targets={[]} />);
    const link = screen.getByRole("link", { name: "Return to 0:03–0:04" });
    expect(link).toHaveAttribute("href", "/sessions/room-1#transcript-segment-segment-1");
    expect(screen.getByText("Homer: Keep one clear next move.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tags: Coaching follow-up")).toHaveTextContent("#Coaching follow-up");
    expect(screen.getByRole("link", { name: "Find all accessible work tagged Coaching follow-up" })).toHaveAttribute("href", "/find?tag=tag-1");
  });

  it("keeps a planned transcript-derived goal linked to the same exact source", () => {
    render(<SchedulePlanner initialBlocks={[{
      id: "plan-goal",
      targetType: "goal",
      targetId: "goal-1",
      title: "Build the coaching review habit",
      targetStatus: "ACTIVE",
      startsAt: "2026-07-20T18:00:00.000Z",
      endsAt: "2026-07-20T18:50:00.000Z",
      timezone: "America/Denver",
      status: "PLANNED",
      completedAt: null,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: "room-2",
      tags: [],
      sourceAnchor: {
        schema: "quipsly-transcript-derived-goal-v1",
        roomId: "room-2",
        transcriptJobId: "job-2",
        segmentId: "segment-2",
        startSeconds: 12.4,
        endSeconds: 17.8,
        providerTextSha256: "b".repeat(64),
        providerSpeakerLabel: "Speaker",
        effectiveTextSnapshot: "Build a repeatable coaching review habit.",
        effectiveSpeakerLabelSnapshot: "Homer",
        acceptedCorrectionId: "correction-2",
        recordingAssetId: "asset-2",
        playbackSourceId: "playback-2",
      },
    }]} targets={[]} />);
    expect(screen.getByRole("link", { name: "Return to 0:12–0:17" })).toHaveAttribute(
      "href",
      "/sessions/room-2#transcript-segment-segment-2",
    );
    expect(screen.getByText("Homer: Build a repeatable coaching review habit.")).toBeInTheDocument();
  });

  it("submits the start shown in the datetime field instead of stale component state", async () => {
    jest.mocked(createWorkPlanBlock).mockResolvedValue({
      ok: true,
      planBlockId: "plan-created",
      updatedAt: "2026-07-19T18:00:00.000Z",
      receiptId: "receipt-created",
    });
    render(<SchedulePlanner initialBlocks={[]} targets={[{
      id: "task-1",
      type: "task",
      title: "Protect one editing block",
      context: "Coaching Session",
      roomId: "room-1",
      sourceAnchor: null,
    }]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Work to focus on" }), {
      target: { value: "task:task-1" },
    });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-07-20T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Plan focus" }));

    await waitFor(() => expect(createWorkPlanBlock).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "task",
      targetId: "task-1",
      startsAt: "2026-07-20T10:00",
      durationMinutes: 50,
    })));
  });

  it("shows and preserves an existing block's IANA wall clock while rescheduling", async () => {
    jest.mocked(rescheduleWorkPlanBlock).mockResolvedValue({
      ok: true,
      planBlockId: "plan-honolulu",
      status: "PLANNED",
      updatedAt: "2026-07-19T18:00:01.000Z",
      receiptId: "receipt-move",
    });
    render(<SchedulePlanner initialBlocks={[{
      id: "plan-honolulu",
      targetType: "task",
      targetId: "task-1",
      title: "Review the coaching packet",
      targetStatus: "OPEN",
      startsAt: "2026-07-19T18:00:00.000Z",
      endsAt: "2026-07-19T18:50:00.000Z",
      timezone: "Pacific/Honolulu",
      status: "PLANNED",
      completedAt: null,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null,
      tags: [],
      sourceAnchor: null,
    }]} targets={[]} />);

    const moveInput = screen.getByLabelText("Move to · Pacific/Honolulu");
    expect(moveInput).toHaveValue("2026-07-19T08:00");
    fireEvent.change(moveInput, { target: { value: "2026-07-19T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(rescheduleWorkPlanBlock).toHaveBeenCalledWith(expect.objectContaining({
      planBlockId: "plan-honolulu",
      startsAt: "2026-07-19T09:30",
      timezone: "Pacific/Honolulu",
      durationMinutes: 50,
    })));
  });
});
