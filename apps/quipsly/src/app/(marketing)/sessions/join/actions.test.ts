import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  acceptSessionInvitation,
  SessionInvitationError,
} from "@/lib/server/session-invitation";
import { acceptSessionInvitationAction } from "./actions";

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
    acceptSessionInvitation: jest.fn(),
  };
});

const TOKEN = `qsinv_${"b".repeat(32)}`;

function formData(token = TOKEN) {
  const value = new FormData();
  value.set("token", token);
  return value;
}

describe("acceptSessionInvitationAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends a signed-out person through login with the exact invitation return", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const joinPath = `/sessions/join?token=${encodeURIComponent(TOKEN)}`;
    await expect(acceptSessionInvitationAction(formData())).rejects.toThrow(
      `REDIRECT:/login?callbackUrl=${encodeURIComponent(joinPath)}`,
    );
    expect(acceptSessionInvitation).not.toHaveBeenCalled();
  });

  it("accepts with the canonical identity and opens the exact Session", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "client-user",
        email: "fallback@example.com",
        primaryEmail: "client@example.com",
        name: "Client Person",
      },
    });
    (acceptSessionInvitation as jest.Mock).mockResolvedValue({
      roomId: "room-coaching-1",
    });

    await expect(acceptSessionInvitationAction(formData())).rejects.toThrow(
      "REDIRECT:/sessions/room-coaching-1?mode=live&joined=1",
    );
    expect(acceptSessionInvitation).toHaveBeenCalledWith({
      token: TOKEN,
      actor: {
        id: "client-user",
        email: "fallback@example.com",
        primaryEmail: "client@example.com",
        name: "Client Person",
      },
    });
  });

  it("returns a typed invitation failure without granting access", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "wrong-user",
        email: "wrong@example.com",
        primaryEmail: "wrong@example.com",
        name: "Wrong Person",
      },
    });
    (acceptSessionInvitation as jest.Mock).mockRejectedValue(
      new SessionInvitationError(
        "INVITATION_EMAIL_MISMATCH",
        "Wrong account",
        403,
      ),
    );

    await expect(acceptSessionInvitationAction(formData())).rejects.toThrow(
      `REDIRECT:/sessions/join?token=${encodeURIComponent(TOKEN)}&error=INVITATION_EMAIL_MISMATCH`,
    );
    expect(acceptSessionInvitation).toHaveBeenCalledTimes(1);
  });
});
