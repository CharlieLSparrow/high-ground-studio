import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { CoachingEngagementWorkspace } from "./coaching-engagement-workspace";

const members = [
  { id: "coach-1", label: "Morgan Coach", role: "COACH" },
  { id: "client-1", label: "Riley Client", role: "CLIENT" },
];

describe("CoachingEngagementWorkspace", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("shows only the choices needed for the selected kind of work", () => {
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    expect(screen.getByLabelText("Who can read it?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Who owns it?")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Target date/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "TASK" },
    });

    expect(screen.getByLabelText("Who owns it?")).toBeInTheDocument();
    expect(screen.getByLabelText(/Target date/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Who can read it?")).not.toBeInTheDocument();
  });

  it("creates client-owned work through the relationship API and renders it", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        entry: {
          id: "task-1",
          kind: "TASK",
          title: "Practice reflective listening",
          body: "Try it twice before Friday.",
          status: "OPEN",
          owner: { id: "client-1", label: "Riley Client" },
          visibility: "SHARED",
          dueAt: null,
          canEdit: true,
          createdAt: "2026-08-19T21:00:00.000Z",
          updatedAt: "2026-08-19T21:00:00.000Z",
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "TASK" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Practice reflective listening" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Try it twice before Friday." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save to coaching home" }),
    );

    const heading = await screen.findByRole("heading", {
      name: "Practice reflective listening",
    });
    expect(
      within(heading.closest("article")!)
        .getAllByText("Riley Client")
        .some((node) => node.tagName === "SPAN"),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      kind: "TASK",
      title: "Practice reflective listening",
      ownerUserId: "client-1",
      visibility: "SHARED",
    });
    await waitFor(() =>
      expect(screen.getByText(/Task saved/i)).toBeInTheDocument(),
    );
  });

  it("removes an item without a confirmation ritual and offers immediate undo", async () => {
    const entry = {
      id: "task-1",
      kind: "TASK" as const,
      title: "Practice reflective listening",
      body: "Try it twice before Friday.",
      status: "OPEN",
      owner: { id: "client-1", label: "Riley Client" },
      visibility: "SHARED" as const,
      dueAt: null,
      canEdit: true,
      createdAt: "2026-08-19T21:00:00.000Z",
      updatedAt: "2026-08-19T21:00:00.000Z",
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          undoAvailable: true,
          removal: {
            id: entry.id,
            kind: entry.kind,
            updatedAt: "2026-08-19T21:01:00.000Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          entry: { ...entry, updatedAt: "2026-08-19T21:02:00.000Z" },
        }),
      });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[entry]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: entry.title }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByRole("heading", { name: entry.title }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT" });
  });
});
