import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import AccountSwitchPage from "./page";

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("./account-switch-client", () => ({
  AccountSwitchClient: ({
    callbackUrl,
    currentUser,
  }: {
    callbackUrl: string;
    currentUser: { email: string } | null;
  }) => (
    <div>
      <span data-testid="callback-url">{callbackUrl}</span>
      <span data-testid="current-email">{currentUser?.email || "signed-out"}</span>
    </div>
  ),
}));

describe("AccountSwitchPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: {
        email: "fallback@example.com",
        primaryEmail: "invited@example.com",
        name: "Invited Person",
        image: null,
        isStaff: false,
      },
    });
  });

  it("preserves the exact safe Session return path and canonical account email", async () => {
    render(await AccountSwitchPage({
      searchParams: Promise.resolve({
        callbackUrl: "/sessions/join?token=qsinv_safe-token",
      }),
    }));

    expect(screen.getByTestId("callback-url")).toHaveTextContent(
      "/sessions/join?token=qsinv_safe-token",
    );
    expect(screen.getByTestId("current-email")).toHaveTextContent(
      "invited@example.com",
    );
  });

  it.each([
    "https://attacker.example/session",
    "//attacker.example/session",
    "/\\attacker.example/session",
    "/sessions/join\nSet-Cookie: nope",
  ])("fails a hostile return path closed to projects: %s", async (callbackUrl) => {
    render(await AccountSwitchPage({
      searchParams: Promise.resolve({ callbackUrl }),
    }));

    expect(screen.getByTestId("callback-url")).toHaveTextContent("/projects");
  });
});
