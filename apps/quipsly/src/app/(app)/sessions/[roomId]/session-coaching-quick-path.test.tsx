import { render, screen } from "@testing-library/react";

import {
  buildCoachingQuickPath,
  SessionCoachingQuickPath,
} from "./session-coaching-quick-path";

const preparation = {
  participants: [{ id: "coach" }, { id: "client" }],
} as any;

const emptyFinishing = {
  transcriptJobs: [],
  outputs: [],
  analyzedSourceCount: 0,
};

describe("SessionCoachingQuickPath", () => {
  it("routes a not-yet-invited coach to preparation instead of opening the call dock", () => {
    const steps = buildCoachingQuickPath({
      roomId: "room-1",
      preparation: { participants: [{ id: "coach" }] } as any,
      contentReadiness: { status: "none" },
      finishingEvidence: emptyFinishing,
    });

    expect(steps[0]).toMatchObject({
      action: "Invite client",
      state: "NEXT",
      href: "/sessions/room-1?mode=prepare",
    });
  });

  it("makes recording the next action after both people are attached", () => {
    const steps = buildCoachingQuickPath({
      roomId: "room-1",
      preparation,
      contentReadiness: { status: "none" },
      finishingEvidence: emptyFinishing,
    });

    expect(steps.map((step) => step.state)).toEqual([
      "DONE",
      "NEXT",
      "LATER",
      "LATER",
    ]);
    expect(steps[1]).toMatchObject({
      action: "Start Session",
      href: "/sessions/room-1?mode=live",
    });
  });

  it("routes a completed transcript to the client-safe follow-up", () => {
    render(
      <SessionCoachingQuickPath
        roomId="room-1"
        preparation={preparation}
        contentReadiness={{ status: "substantial" }}
        finishingEvidence={{
          ...emptyFinishing,
          transcriptJobs: [
            {
              id: "transcript-1",
              recordingAssetId: "asset-1",
              status: "COMPLETED",
              segmentCount: 12,
              updatedAt: "2026-08-19T22:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(
      screen
        .getAllByRole("link", { name: /prepare follow-up/i })
        .every(
          (link) =>
            link.getAttribute("href") ===
            "/sessions/room-1?mode=outputs#client-follow-up",
        ),
    ).toBe(true);
    expect(screen.getAllByLabelText("Done")).toHaveLength(3);
    expect(screen.getByLabelText("Next")).toBeInTheDocument();
  });

  it("does not call historical transcript or follow-up evidence complete before the recording is ready", () => {
    const steps = buildCoachingQuickPath({
      roomId: "room-1",
      preparation,
      contentReadiness: { status: "capture-proof-only" },
      finishingEvidence: {
        ...emptyFinishing,
        transcriptJobs: [
          {
            id: "transcript-1",
            recordingAssetId: "asset-1",
            status: "COMPLETED",
            segmentCount: 12,
            updatedAt: "2026-08-19T22:00:00.000Z",
          },
        ],
        outputs: [
          {
            id: "follow-up-1",
            kind: "CLIENT_FOLLOW_UP",
            status: "RELEASED",
            deliveryCount: 1,
            updatedAt: "2026-08-19T22:10:00.000Z",
          },
        ],
      },
    });

    expect(steps.map((step) => step.state)).toEqual([
      "DONE",
      "NEXT",
      "LATER",
      "LATER",
    ]);
    expect(steps[2].detail).toMatch(/held until the retained recording/i);
    expect(steps[3].detail).toMatch(/waits for production-ready recording/i);
  });

  it("does not advance to follow-up when completed provider text still needs speaker review", () => {
    const steps = buildCoachingQuickPath({
      roomId: "room-1",
      preparation,
      contentReadiness: { status: "substantial" },
      finishingEvidence: {
        ...emptyFinishing,
        transcriptJobs: [{
          id: "transcript-1",
          recordingAssetId: "asset-1",
          status: "COMPLETED",
          segmentCount: 12,
          readiness: {
            state: "REVIEW_REQUIRED",
            detail: "Mixed-room speaker labels remain candidates.",
          } as any,
          updatedAt: "2026-08-19T22:00:00.000Z",
        }],
      },
    });

    expect(steps.map((step) => step.state)).toEqual(["DONE", "DONE", "NEXT", "LATER"]);
    expect(steps[2].detail).toMatch(/speaker evidence needs review/i);
  });
});
