import React from "react";
import { render, screen } from "@testing-library/react";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import SchedulePage from "./page";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("./schedule-planner", () => ({ SchedulePlanner: () => <div>Personal planning surface</div> }));

describe("Schedule page truth states", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a real signed-in account before reading private planning", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await SchedulePage());
    expect(screen.getByText("The private Calendar is locked.")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(listProjectsVisibleToEmail).not.toHaveBeenCalled();
  });

  it("shows persistence unavailable instead of local-operator or sample planning", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1", email: "person@example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([] as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockRejectedValue(Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" })) },
      actionItem: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findMany: jest.fn().mockResolvedValue([]) },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);
    render(await SchedulePage());
    expect(screen.getByRole("status", { name: "Calendar unavailable" })).toHaveTextContent("database connection is unavailable");
    expect(screen.getByText(/Auth state: signed in/)).toBeInTheDocument();
    expect(screen.queryByText("Personal planning surface")).not.toBeInTheDocument();
    expect(screen.queryByText(/local preview access/i)).not.toBeInTheDocument();
  });

  it("returns an accepted transcript-derived task to its exact reviewed segment", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1", email: "person@example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([] as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      actionItem: { findMany: jest.fn().mockResolvedValue([
        {
          id: "task-1",
          title: "Use the client commitment",
          detail: "Carry the exact reviewed wording into the next session.",
          status: "OPEN",
          dueAt: null,
          recurrenceOccurrence: null,
          room: { id: "room-1", title: "Homer coaching session" },
          booking: null,
          tagLinks: [{ tag: { id: "tag-1", label: "Coaching follow-up", isActive: true } }],
          sourceJson: {
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
        },
        {
          id: "mobile-task-1",
          title: "Review the iPhone capture",
          detail: null,
          status: "OPEN",
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          reminder: { remindAt: new Date("2026-07-20T13:30:00.000Z"), status: "ACTIVE" },
          recurrenceOccurrence: null,
          room: { id: "room-1", title: "Homer coaching session" },
          booking: null,
          tagLinks: [],
          sourceJson: {
            schema: "quipsly-mobile-quick-entry-v1",
            surface: "ios-capture",
          },
        },
      ]) },
      goal: { findMany: jest.fn().mockResolvedValue([]) },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);

    render(await SchedulePage());

    expect(screen.getByText(/Source: Reviewed transcript timestamp/)).toBeInTheDocument();
    expect(screen.getByText("Source: iPhone capture")).toBeInTheDocument();
    expect(screen.getByLabelText("Tags: Coaching follow-up")).toHaveTextContent("#Coaching follow-up");
    expect(screen.getByText(/^Reminder .+Jul 20/)).toBeInTheDocument();
    expect(screen.getByText("Homer: Keep one clear next move.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to 0:03–0:04" })).toHaveAttribute(
      "href",
      "/sessions/room-1#transcript-segment-segment-1",
    );
    expect(screen.getByRole("heading", { name: "Time for the work you actually chose." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Real rooms, grouped by current status" })).not.toBeInTheDocument();
  });
});
