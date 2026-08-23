import { act, render, screen, waitFor } from "@testing-library/react";

import { CoachingEngagementInvitation } from "./coaching-engagement-invitation";

const replace = jest.fn();
const refresh = jest.fn();
const mockRouter = { replace, refresh };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    invitation: {
      invitedEmail: "client@example.test",
      role: "CLIENT",
      status: "PENDING",
      expiresAt: "2026-09-01T18:00:00.000Z",
    },
    engagement: { id: "engagement-1", title: "Coaching with Homer" },
    signedIn: false,
    isRightAccount: false,
    canAccept: false,
    canOpen: false,
    ...overrides,
  };
}

describe("CoachingEngagementInvitation", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState(
      null,
      "",
      "/coaching/engagements/join#token=coaching-invitation-token-1234567890",
    );
  });

  it("presents a standard one-action sign-in invitation with details collapsed", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: invitation() }),
    }) as typeof fetch;

    await act(async () => {
      render(<CoachingEngagementInvitation />);
    });

    expect(await screen.findByRole("heading", { name: "Join Coaching with Homer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      expect.stringContaining("/login?callbackUrl="),
    );
    expect(screen.getByText("What this opens").closest("details")).not.toHaveAttribute("open");
    expect(window.location.hash).toBe("");
  });

  it("reopens an already accepted invitation directly instead of showing a dead end", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: invitation({
          invitation: {
            invitedEmail: "client@example.test",
            role: "CLIENT",
            status: "ACCEPTED",
            expiresAt: "2026-09-01T18:00:00.000Z",
          },
          signedIn: true,
          isRightAccount: true,
          canOpen: true,
        }),
      }),
    }) as typeof fetch;

    await act(async () => {
      render(<CoachingEngagementInvitation />);
    });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/coaching/engagements/engagement-1");
    });
    expect(refresh).toHaveBeenCalled();
    expect(window.sessionStorage.getItem("quipsly.coaching.invitation.v1")).toBeNull();
  });

  it("offers the standard account switch when the browser has the wrong account", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: invitation({ signedIn: true }),
      }),
    }) as typeof fetch;

    await act(async () => {
      render(<CoachingEngagementInvitation />);
    });

    expect(await screen.findByRole("link", { name: "Switch account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/account/switch?callbackUrl="),
    );
  });
});
