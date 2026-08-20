import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { SessionInvitations } from "./session-invitations";

describe("SessionInvitations", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates a Session-only link without claiming delivery", async () => {
    globalThis.fetch = jest
      .fn()
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
          invitePath:
            "/sessions/join?token=qsinv_test-token________________________________",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          invitations: [
            {
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
          ],
          collaboration: {
            activity: [
              {
                id: "invitation-created:invite-1",
                kind: "INVITATION_CREATED",
                tone: "neutral",
                title: "Private Session link created",
                detail: "Guest was invited to this Session.",
                participantLabel: "Guest",
                actorLabel: "Host",
                occurredAt: "2026-08-04T12:00:00.000Z",
                providerStatus: null,
              },
            ],
            joinKeyLeases: [],
          },
        }),
      }) as typeof fetch;

    await act(async () => {
      render(<SessionInvitations roomId="room-1" purpose="PODCAST" />);
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Expiring, email-bound invitation/i),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Name, optional"), {
      target: { value: "Guest" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Create private link/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Quipsly has not emailed or messaged anyone/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/sessions\/join\?token=qsinv_/i),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-1/invitations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses explicit email delivery as the primary action and reports provider truth", async () => {
    const randomUUID = jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
    globalThis.fetch = jest
      .fn()
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
            id: "invite-email",
            email: "client@example.test",
            displayName: "Client",
            role: "CLIENT",
            status: "PENDING",
            expiresAt: "2026-09-19T12:00:00.000Z",
            acceptedAt: null,
            createdAt: "2026-08-19T12:00:00.000Z",
            canRevokeLink: true,
          },
          invitePath:
            "/sessions/join?token=qsinv_test-token________________________________",
          delivery: {
            id: "delivery-1",
            channel: "EMAIL",
            status: "SENT",
            requestedAt: "2026-08-19T12:00:00.000Z",
            completedAt: "2026-08-19T12:00:01.000Z",
            errorCode: null,
            errorMessage: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, invitations: [] }),
      }) as typeof fetch;

    await act(async () => {
      render(<SessionInvitations roomId="room-email" purpose="COACHING" />);
    });
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "client@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Name, optional"), {
      target: { value: "Client" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send email invitation" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Invitation email sent to client@example.test/i),
      ).toBeInTheDocument(),
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-email/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "client@example.test",
          displayName: "Client",
          role: "CLIENT",
          expiresInHours: 168,
          delivery: "EMAIL",
          requestId: "123e4567-e89b-42d3-a456-426614174000",
        }),
      }),
    );
    randomUUID.mockRestore();
  });

  it("stays absent for an actor without invitation authority", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, code: "NOT_FOUND" }),
    }) as typeof fetch;
    await act(async () => {
      render(<SessionInvitations roomId="room-private" purpose="COACHING" />);
    });
    await waitFor(() =>
      expect(
        screen.queryByText(/Invite someone to this Session/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("requires a second confirmation before removing accepted participant access", async () => {
    const activeParticipant = {
      id: "participant-1",
      accessStatus: "ACTIVE",
      accessRevision: 0,
      providerAccessStatus: "NOT_REQUIRED",
      providerAccessErrorCode: null,
    };
    const randomUUID = jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          invitations: [
            {
              id: "invite-accepted",
              email: "accepted@example.test",
              displayName: "Accepted Guest",
              role: "CLIENT",
              status: "ACCEPTED",
              expiresAt: "2026-08-11T12:00:00.000Z",
              acceptedAt: "2026-08-04T12:00:00.000Z",
              createdAt: "2026-08-04T11:00:00.000Z",
              canRevokeLink: false,
              canRemoveParticipant: true,
              participant: activeParticipant,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          participant: {
            ...activeParticipant,
            accessStatus: "REMOVED",
            accessRevision: 1,
            providerAccessStatus: "CONVERGED",
          },
          provider: {
            status: "CONVERGED",
            nextAction: "Provider devices are disconnected.",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          invitations: [
            {
              id: "invite-accepted",
              email: "accepted@example.test",
              displayName: "Accepted Guest",
              role: "CLIENT",
              status: "ACCEPTED",
              expiresAt: "2026-08-11T12:00:00.000Z",
              acceptedAt: "2026-08-04T12:00:00.000Z",
              createdAt: "2026-08-04T11:00:00.000Z",
              canRevokeLink: false,
              canRemoveParticipant: false,
              canRestoreParticipant: true,
              participant: {
                ...activeParticipant,
                accessStatus: "REMOVED",
                accessRevision: 1,
                providerAccessStatus: "CONVERGED",
              },
            },
          ],
          collaboration: {
            activity: [
              {
                id: "access:remove-1",
                kind: "PARTICIPANT_REMOVED",
                tone: "warning",
                title: "Session access removed",
                detail: "Historical collaboration was preserved.",
                participantLabel: "Accepted Guest",
                actorLabel: "Host",
                occurredAt: "2026-08-04T12:10:00.000Z",
                providerStatus: "CONVERGED",
              },
            ],
            joinKeyLeases: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          presence: {
            status: "EMPTY",
            errorCode: null,
            observedAt: "2026-08-04T12:10:01.000Z",
            provider: "livekit",
            connectedDeviceCount: 0,
            connectedParticipantCount: 0,
            unknownDeviceCount: 0,
            attentionCount: 0,
            devices: [],
            nextAction: "LiveKit reports no connected device.",
          },
        }),
      }) as typeof fetch;

    await act(async () => {
      render(<SessionInvitations roomId="room-1" purpose="COACHING" />);
    });
    const remove = await screen.findByRole("button", {
      name: "Remove Session access",
    });
    fireEvent.click(remove);
    expect(
      screen.getByText(
        /preserves consent history, recordings, transcript evidence, and authored work/i,
      ),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() =>
      expect(
        screen.getByText("Provider devices are disconnected."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Restore Session access" }),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-1/participants/participant-1/access",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "REMOVE",
          requestId: "123e4567-e89b-42d3-a456-426614174000",
          expectedRevision: 0,
          reason: "Removed from the Session participant manager",
        }),
      }),
    );
    randomUUID.mockRestore();
  });

  it("shows access history and prepared device authority without calling it presence", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        invitations: [],
        collaboration: {
          activity: [
            {
              id: "access:provider-1",
              kind: "PROVIDER_RECONCILIATION",
              tone: "positive",
              title: "Provider access reconciled",
              detail: "Provider readback found no matching active device.",
              participantLabel: "Scott Sparrow",
              actorLabel: "Charles Sparrow",
              occurredAt: "2026-08-04T12:10:00.000Z",
              providerStatus: "CONVERGED",
            },
          ],
          joinKeyLeases: [
            {
              id: "lease-1",
              participantId: "participant-1",
              participantLabel: "Scott Sparrow",
              clientKind: "ios",
              deviceLabel: "Quipsly Capture · iPhone 16",
              issuedAt: "2026-08-04T12:00:00.000Z",
              expiresAt: "2026-08-04T12:10:00.000Z",
            },
          ],
        },
      }),
    }) as typeof fetch;

    await act(async () => {
      render(<SessionInvitations roomId="room-1" purpose="PODCAST" />);
    });

    expect(
      await screen.findByText("Provider access reconciled"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Quipsly Capture · iPhone 16/)).toBeInTheDocument();
    expect(
      screen.getByText(/not proof that the device is currently connected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Credentials and provider identities are never displayed/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders separately refreshed provider presence with safe track states", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          invitations: [],
          collaboration: { activity: [], joinKeyLeases: [] },
        }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          presence: {
            status: "LIVE",
            errorCode: null,
            observedAt: "2026-08-04T12:10:01.000Z",
            provider: "livekit",
            connectedDeviceCount: 2,
            connectedParticipantCount: 2,
            unknownDeviceCount: 0,
            attentionCount: 0,
            devices: [
              {
                id: "presence-host",
                participantId: "host-1",
                participantLabel: "Charles Sparrow",
                role: "HOST",
                canonicalAccessStatus: "ACTIVE",
                clientKind: "web",
                deviceLabel: "Quipsly Web · MacIntel",
                joinedAt: "2026-08-04T12:00:00.000Z",
                audio: { published: true, muted: false },
                video: { published: false, muted: null },
                matchedToCanonicalParticipant: true,
              },
              {
                id: "presence-guest",
                participantId: "guest-1",
                participantLabel: "Scott Sparrow",
                role: "GUEST",
                canonicalAccessStatus: "ACTIVE",
                clientKind: "ios",
                deviceLabel: "Quipsly Capture · iPhone 16",
                joinedAt: "2026-08-04T12:00:00.000Z",
                audio: { published: true, muted: true },
                video: { published: true, muted: false },
                matchedToCanonicalParticipant: true,
              },
            ],
            nextAction: "LiveKit reports these devices in the room.",
          },
        }),
      }) as typeof fetch;

    await act(async () => {
      render(<SessionInvitations roomId="room-1" purpose="PODCAST" />);
    });
    await screen.findByText("Access activity");
    const details = screen
      .getByText("Invite someone to this Session", { exact: true })
      .closest("details");
    expect(details).not.toBeNull();
    if (!details) return;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(
      await screen.findByText("LiveKit reports these devices in the room."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Quipsly Capture · iPhone 16/)).toBeInTheDocument();
    expect(screen.getByText(/Audio muted/i)).toBeInTheDocument();
    expect(screen.getByText(/Video published/i)).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-1/presence",
      expect.objectContaining({ cache: "no-store", signal: expect.anything() }),
    );
  });
});
