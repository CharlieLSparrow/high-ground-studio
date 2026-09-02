import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CoachingSessionPlanCard,
  type Preparation,
} from "./coaching-session-plan-card";

const ROOM_ID = "coaching_room_123";

describe("Coaching Session plan card", () => {
  beforeEach(() => {
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: typeof fetch }).fetch;
  });

  it("lets the client save a simple optional plan without exposing coach-private prep", async () => {
    const initial = preparation("client");
    const saved = {
      ...initial,
      revision: 1,
      client: {
        ...initial.client,
        focus: "Choose the next step",
        submittedAt: "2026-08-26T12:00:00.000Z",
      },
    };
    const fetchMock = (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(json({ ok: true, preparation: initial }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          preparation: saved,
          savedRevision: 1,
          idempotentReplay: false,
        }),
      );
    const user = userEvent.setup();

    render(<CoachingSessionPlanCard roomId={ROOM_ID} />);

    const focus = await screen.findByLabelText(
      "What would make this Session useful?",
    );
    expect(screen.getByText(/nothing here is required to join/i)).toBeInTheDocument();
    expect(screen.queryByText("Private coach prep")).not.toBeInTheDocument();
    await user.type(focus, "Choose the next step");
    await user.selectOptions(screen.getByLabelText("Progress (optional)"), "7");
    await user.click(screen.getByRole("button", { name: "Save Session plan" }));

    await screen.findByText(/Session plan is saved/i);
    const request = fetchMock.mock.calls[1];
    expect(request?.[0]).toBe(`/api/sessions/${ROOM_ID}/preparation`);
    const body = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      operation: "SAVE_CLIENT",
      focus: "Choose the next step",
      progressScore: 7,
    });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("shows the assigned coach the shared check-in and a separate private lane", async () => {
    const coach = preparation("coach");
    coach.client.focus = "Prepare for a difficult conversation";
    coach.client.desiredOutcome = "A calm opening sentence";
    coach.client.submittedAt = "2026-08-26T12:00:00.000Z";
    coach.coachPrivate = {
      note: "Remember the client's stated values.",
      preparedAt: "2026-08-26T12:01:00.000Z",
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
      json({ ok: true, preparation: coach }),
    );

    render(<CoachingSessionPlanCard roomId={ROOM_ID} />);

    expect(
      await screen.findByText("Prepare for a difficult conversation"),
    ).toBeInTheDocument();
    expect(screen.getByText("A calm opening sentence")).toBeInTheDocument();
    expect(screen.getByLabelText("Private coach prep")).toHaveValue(
      "Remember the client's stated values.",
    );
    expect(screen.getByText(/Only the assigned coach can read this/i)).toBeInTheDocument();
  });

  it("submits the visible private note even before controlled state catches up", async () => {
    const coach = preparation("coach");
    const saved = {
      ...coach,
      revision: 1,
      coachPrivate: {
        note: "Keep the client's own evidence of progress in view.",
        preparedAt: "2026-08-26T12:01:00.000Z",
      },
    };
    const fetchMock = (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(json({ ok: true, preparation: coach }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          preparation: saved,
          savedRevision: 1,
          idempotentReplay: false,
        }),
      );

    render(<CoachingSessionPlanCard roomId={ROOM_ID} />);

    const note = await screen.findByLabelText("Private coach prep");
    const visibleNote = "Keep the client's own evidence of progress in view.";
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      note,
      visibleNote,
    );
    fireEvent.submit(note.closest("form")!);

    await screen.findByText("Private coach prep saved.");
    const request = fetchMock.mock.calls[1];
    const body = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(body).toMatchObject({ operation: "SAVE_COACH", note: visibleNote });
  });
});

function preparation(role: "client" | "coach"): Preparation {
  return {
    roomId: ROOM_ID,
    bookingId: "booking_123",
    role,
    revision: 0,
    client: {
      focus: "",
      desiredOutcome: "",
      successMeasure: "",
      progressScore: null,
      update: "",
      submittedAt: null,
    },
    coachPrivate:
      role === "coach" ? { note: "", preparedAt: null } : null,
  };
}

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
