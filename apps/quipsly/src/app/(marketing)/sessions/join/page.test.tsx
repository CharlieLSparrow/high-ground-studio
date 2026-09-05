import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { inspectSessionInvitation } from "@/lib/server/session-invitation";
import JoinSessionPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
jest.mock("@/lib/server/session-invitation", () => {
  const actual = jest.requireActual("@/lib/server/session-invitation");
  return {
    ...actual,
    inspectSessionInvitation: jest.fn(),
  };
});

const TOKEN = `qsinv_${"a".repeat(32)}`;

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    recipientEmail: "client@example.com",
    recipientEmailHint: "c•••••@example.com",
    displayName: "Client Person",
    role: "CLIENT",
    status: "PENDING",
    expiresAt: "2026-09-01T18:00:00.000Z",
    available: true,
    reentryAvailable: false,
    acceptedByUserId: null,
    participant: null,
    room: {
      id: "room-coaching-1",
      title: "Coaching with Homer",
      purpose: "COACHING",
      status: "PLANNED",
      scheduledStart: "2026-08-26T18:00:00.000Z",
      scheduledEnd: "2026-08-26T19:00:00.000Z",
      hostName: "Homer Sparrow",
    },
    ...overrides,
  };
}

describe("JoinSessionPage identity return", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (inspectSessionInvitation as jest.Mock).mockResolvedValue(invitation());
    (auth as jest.Mock).mockResolvedValue(null);
  });

  it("returns a signed-out invitee to the exact opaque invitation", async () => {
    render(await JoinSessionPage({
      searchParams: Promise.resolve({ token: TOKEN }),
    }));

    const continueLink = screen.getByRole("link", { name: "Continue" });
    const expectedCallback = `/sessions/join?token=${encodeURIComponent(TOKEN)}`;
    expect(continueLink).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encodeURIComponent(expectedCallback)}&sessionInviteToken=${encodeURIComponent(TOKEN)}`,
    );
    expect(screen.getByText("Coaching with Homer")).toBeInTheDocument();
  });

  it("preserves the exact invitation while switching away from the wrong account", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "wrong-user",
        email: "wrong@example.com",
        primaryEmail: "wrong@example.com",
      },
    });

    render(await JoinSessionPage({
      searchParams: Promise.resolve({ token: TOKEN }),
    }));

    const callbackUrl = `/sessions/join?token=${encodeURIComponent(TOKEN)}`;
    expect(screen.getByRole("link", { name: "Switch account" })).toHaveAttribute(
      "href",
      `/account/switch?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("wrong@example.com");
  });

  it("shows one deliberate continuation for the invited account", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "client-user",
        email: "fallback@example.com",
        primaryEmail: "client@example.com",
      },
    });

    render(await JoinSessionPage({
      searchParams: Promise.resolve({ token: TOKEN }),
    }));

    expect(screen.getByText("client@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Session" }).closest("form"))
      .toHaveAttribute("action");
    expect(screen.getByDisplayValue(TOKEN)).toHaveAttribute("name", "token");
  });

  it("reopens an accepted active invitation directly in its exact Session", async () => {
    (inspectSessionInvitation as jest.Mock).mockResolvedValue(invitation({
      status: "ACCEPTED",
      available: false,
      reentryAvailable: true,
      acceptedByUserId: "client-user",
      participant: {
        id: "participant-1",
        userId: "client-user",
        accessStatus: "ACTIVE",
      },
    }));
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "client-user",
        email: "client@example.com",
        primaryEmail: "client@example.com",
      },
    });

    await expect(JoinSessionPage({
      searchParams: Promise.resolve({ token: TOKEN }),
    })).rejects.toThrow("REDIRECT:/sessions/room-coaching-1?mode=live");

    expect(redirect).toHaveBeenCalledWith("/sessions/room-coaching-1?mode=live");
  });
});
