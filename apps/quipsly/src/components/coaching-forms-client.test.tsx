/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  CoachingFormOutcomeReview,
  type Assignment,
} from "./coaching-forms-client";

const assignment: Assignment = {
  id: "assignment-1",
  status: "SUBMITTED",
  timing: "AFTER_SESSION",
  dueAt: null,
  startedAt: "2026-08-26T12:00:00.000Z",
  submittedAt: "2026-08-26T12:05:00.000Z",
  template: {
    id: "template-1",
    title: "After-session reflection",
    description: "Keep what matters.",
    purpose: "POST_SESSION",
    revision: 3,
    definition: {
      schema: "quipsly-coaching-form-definition-v1",
      key: "after-session",
      title: "After-session reflection",
      description: "Keep what matters.",
      purpose: "POST_SESSION",
      submitLabel: "Share with my coach",
      fields: [
        {
          id: "next-step",
          type: "LONG_TEXT",
          label: "What will you do next?",
          required: true,
        },
        {
          id: "support",
          type: "LONG_TEXT",
          label: "What support would help?",
          required: false,
        },
      ],
    },
  },
  engagement: { id: "engagement-1", title: "Coaching with Scott" },
  booking: null,
  room: null,
  assignedBy: { id: "coach-1", name: "Scott", email: "coach@example.test" },
  assignedTo: { id: "client-1", name: "Casey", email: "client@example.test" },
  viewerRole: "COACH",
  response: {
    revision: 2,
    state: "SUBMITTED",
    answers: {
      "next-step": "Block thirty minutes for the outline.",
      support: "A check-in on Friday.",
    },
    submittedAt: "2026-08-26T12:05:00.000Z",
  },
  outcomePromotions: [],
  boundaries: {
    clientCanEditOwnResponse: false,
    coachCanReadSubmittedResponse: true,
    coachCanReadDraftResponse: false,
    coachInitiatedPromotion: true,
    editableAfterCreation: true,
    sourceReceiptVisible: true,
    externalSideEffects: false,
  },
};

describe("CoachingFormOutcomeReview", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    });
    global.fetch = jest.fn();
  });

  it("creates sensible follow-through in one tap after explicit answer selection", async () => {
    const onPromoted = jest.fn().mockResolvedValue(undefined);
    const onError = jest.fn();
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { receipt: { id: "receipt-1" } },
      }),
    } as Response);

    render(
      <CoachingFormOutcomeReview
        assignment={assignment}
        onPromoted={onPromoted}
        onError={onError}
      />,
    );

    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Use answer to What will you do next?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, request] = jest.mocked(global.fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      action: "PROMOTE_RESPONSE_OUTCOME",
      requestId: "11111111-1111-4111-8111-111111111111",
      assignmentId: "assignment-1",
      responseRevision: 2,
      kind: "TASK",
      selectedFieldIds: ["next-step"],
      title: "Block thirty minutes for the outline.",
      body: "What will you do next?\nBlock thirty minutes for the outline.",
      ownerUserId: "client-1",
      visibility: "SHARED",
      targetAt: "",
    });
    expect(onPromoted).toHaveBeenCalledWith(
      "Task added to Coaching with Scott.",
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows only server-projected shared follow-through receipts", () => {
    render(
      <CoachingFormOutcomeReview
        assignment={{
          ...assignment,
          outcomePromotions: [
            {
              id: "receipt-shared",
              kind: "GOAL",
              targetId: "goal-1",
              responseRevision: 2,
              selectedFieldIds: ["next-step"],
              sourceSha256: "a".repeat(64),
              reviewedPayload: {
                schema: "quipsly-coaching-form-outcome-reviewed-v1",
                title: "Finish the outline",
                body: null,
                owner: { id: "client-1", name: "Casey", email: null },
                visibility: "SHARED",
                targetAt: null,
                coachInitiated: true,
              },
              createdAt: "2026-08-26T12:06:00.000Z",
            },
          ],
        }}
        onPromoted={jest.fn()}
        onError={jest.fn()}
      />,
    );

    expect(screen.getByText("Finish the outline")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open notes, tasks, and goals/ }),
    ).toHaveAttribute(
      "href",
      "/coaching/engagements/engagement-1#relationship-work",
    );
  });
});
