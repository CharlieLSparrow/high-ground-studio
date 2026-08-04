import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionEpisodeBindingRepair } from "./session-episode-binding-repair";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const requestId = "dd7d786f-f3d7-4f74-b486-c41bd88dbd0e";

const baseState = {
  canRepair: true,
  roomUpdatedAt: "2026-08-04T20:00:00.000Z",
  currentEpisodeProductionId: null,
  currentRelationshipInvalid: false,
  candidates: [
    {
      id: "episode-4-id",
      slug: "episode-4",
      title: "The Swear Jar",
      status: "recording",
      updatedAt: "2026-08-04T19:00:00.000Z",
    },
    {
      id: "episode-5-id",
      slug: "episode-5",
      title: "Be Curious",
      status: "draft",
      updatedAt: "2026-08-04T18:00:00.000Z",
    },
  ],
};

describe("Session Episode relationship repair", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn(() => requestId) },
    });
  });

  it("explains the authority boundary without exposing mutation controls to a viewer", () => {
    render(<SessionEpisodeBindingRepair
      roomId="room-1"
      state={{ ...baseState, canRepair: false, candidates: [] }}
    />);
    expect(screen.getByText(/Session host, producer, or Nest owner\/editor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bind exact Episode Room" })).not.toBeInTheDocument();
  });

  it("binds one explicitly selected Episode with a stable request and refreshes canonical readback", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as typeof fetch;
    render(<SessionEpisodeBindingRepair roomId="room-1" state={baseState} />);

    fireEvent.change(screen.getByLabelText("Episode Room"), { target: { value: "episode-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Bind exact Episode Room" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/room-1/episode-binding");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(String(options.body))).toEqual({
      episodeSlug: "episode-5",
      requestId,
      expectedRoomUpdatedAt: baseState.roomUpdatedAt,
      confirmRebind: false,
      reason: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/relationship repaired/i);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation and an audit reason before replacing an invalid relation", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as typeof fetch;
    render(<SessionEpisodeBindingRepair
      roomId="room-1"
      state={{
        ...baseState,
        currentEpisodeProductionId: "episode-other-id",
        currentRelationshipInvalid: true,
      }}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Bind exact Episode Room" }));
    expect(screen.getByRole("status")).toHaveTextContent(/confirm the rebind/i);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Replace the invalid existing relationship" }));
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Imported Session pointed at another Nest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bind exact Episode Room" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      confirmRebind: true,
      reason: "Imported Session pointed at another Nest",
      requestId,
    });
  });
});
