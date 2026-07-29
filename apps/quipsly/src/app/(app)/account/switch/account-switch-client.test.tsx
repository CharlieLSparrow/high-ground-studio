import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  linkWithPopup,
  onAuthStateChanged,
  unlink,
} from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import { AccountSwitchClient } from "./account-switch-client";

const refresh = jest.fn();
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    setCustomParameters: jest.fn(),
  })),
  linkWithPopup: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock("@/lib/firebase/firebase", () => ({
  auth: { currentUser: null },
}));

const currentUser = {
  email: "person@example.com",
  name: "Quipsly Person",
  image: null,
  isStaff: false,
};

function firebaseUser(input: {
  email?: string;
  providers: Array<{ providerId: string; email?: string }>;
}) {
  return {
    email: input.email ?? "person@example.com",
    providerData: input.providers,
    getIdToken: jest.fn().mockResolvedValue("redacted-test-id-token"),
  };
}

describe("AccountSwitchClient provider continuity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    push.mockReset();
    refresh.mockReset();
    (auth as any).currentUser = null;
    (global.fetch as jest.Mock | undefined) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });
    (onAuthStateChanged as jest.Mock).mockImplementation(
      (firebaseAuth, callback) => {
        callback(firebaseAuth.currentUser);
        return jest.fn();
      },
    );
  });

  it("shows an already-connected Google credential without a duplicate link action", async () => {
    (auth as any).currentUser = firebaseUser({
      providers: [{ providerId: "google.com", email: "person@example.com" }],
    });

    render(
      <AccountSwitchClient callbackUrl="/projects" currentUser={currentUser} />,
    );

    expect(
      await screen.findByText(/Google is connected/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Google" }),
    ).not.toBeInTheDocument();
  });

  it("links the same Google email, refreshes the server ledger, and keeps one user", async () => {
    const beforeLink = firebaseUser({
      providers: [{ providerId: "password", email: "person@example.com" }],
    });
    const afterLink = firebaseUser({
      providers: [
        { providerId: "password", email: "person@example.com" },
        { providerId: "google.com", email: "person@example.com" },
      ],
    });
    (auth as any).currentUser = beforeLink;
    (linkWithPopup as jest.Mock).mockResolvedValue({ user: afterLink });

    render(
      <AccountSwitchClient callbackUrl="/projects" currentUser={currentUser} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Google" }),
    );

    await waitFor(() => {
      expect(linkWithPopup).toHaveBeenCalledWith(
        beforeLink,
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "redacted-test-id-token" }),
      });
    });
    expect(
      await screen.findByText(/Password and Google now open the same Quipsly person and Nest/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it("immediately removes a link when Google returns a different email", async () => {
    const beforeLink = firebaseUser({
      providers: [{ providerId: "password", email: "person@example.com" }],
    });
    const wrongLink = firebaseUser({
      providers: [
        { providerId: "password", email: "person@example.com" },
        { providerId: "google.com", email: "someone-else@example.com" },
      ],
    });
    (auth as any).currentUser = beforeLink;
    (linkWithPopup as jest.Mock).mockResolvedValue({ user: wrongLink });
    (unlink as jest.Mock).mockResolvedValue(beforeLink);

    render(
      <AccountSwitchClient callbackUrl="/projects" currentUser={currentUser} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Google" }),
    );

    await waitFor(() => {
      expect(unlink).toHaveBeenCalledWith(wrongLink, "google.com");
    });
    expect(
      await screen.findByText(/Quipsly removed that link/),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
