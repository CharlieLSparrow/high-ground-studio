import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionInvitations } from "./session-invitations";

describe("SessionInvitations", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("creates a Session-only link without claiming delivery", async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, invitations: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          invitation: {
            id: "invite-1",
            email: "guest@example.test",
            displayName: "Guest",
            role: "GUEST",
            status: "PENDING",
            expiresAt: "2026-08-11T12:00:00.000Z",
            acceptedAt: null,
            createdAt: "2026-08-04T12:00:00.000Z",
            canRevokeLink: true,
          },
          invitePath: "/sessions/join?token=qsinv_test-token________________________________",
        }),
      }) as typeof fetch;

    await act(async () => { render(<SessionInvitations roomId="room-1" purpose="PODCAST" />); });
    await waitFor(() => expect(screen.getByText(/Expiring, email-bound invitation/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.test" } });
    fireEvent.change(screen.getByLabelText("Name, optional"), { target: { value: "Guest" } });
    fireEvent.click(screen.getByRole("button", { name: /Create private link/i }));

    await waitFor(() => expect(screen.getByText(/Quipsly has not emailed or messaged anyone/i)).toBeInTheDocument());
    expect(screen.getByText(/sessions\/join\?token=qsinv_/i)).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "/api/sessions/room-1/invitations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stays absent for an actor without invitation authority", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, code: "NOT_FOUND" }),
    }) as typeof fetch;
    await act(async () => { render(<SessionInvitations roomId="room-private" purpose="COACHING" />); });
    await waitFor(() => expect(screen.queryByText(/Invite someone to this Session/i)).not.toBeInTheDocument());
  });
});
