import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

import { LoginClient } from "./LoginClient";

jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    setCustomParameters: jest.fn(),
  })),
  getRedirectResult: jest.fn().mockResolvedValue(null),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signOut: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signInWithRedirect: jest.fn(),
}));

jest.mock("@/lib/firebase/firebase", () => ({
  auth: { name: "local-auth-test" },
}));

describe("Quipsly direct login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (signInWithEmailAndPassword as jest.Mock).mockImplementation(() => new Promise(() => undefined));
  });

  it("keeps the native form inert until the Firebase client handler is hydrated", () => {
    const markup = renderToString(<LoginClient callbackUrl="/projects" />);

    expect(markup).toContain("Loading secure sign-in…");
    expect(markup).toMatch(/<button[^>]+type="submit"[^>]+disabled=""/);
  });

  it("submits actual autofilled form values even when React received no change events", async () => {
    render(<LoginClient callbackUrl="/projects" />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Sign in with email" });

    email.value = "  QUIPSLY.QA@LOCAL.TEST ";
    password.value = "LocalOnly-Quipsly-2026!";

    expect(email.form).toHaveAttribute("method", "post");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        { name: "local-auth-test" },
        "quipsly.qa@local.test",
        "LocalOnly-Quipsly-2026!",
      );
    });
  });

  it("explains how an existing password user can connect Google", async () => {
    (signInWithPopup as jest.Mock).mockRejectedValue({
      code: "auth/account-exists-with-different-credential",
    });

    render(<LoginClient callbackUrl="/projects" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(GoogleAuthProvider).toHaveBeenCalled();
    expect(
      await screen.findByText(/add Google from Account settings/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("quipsly-login-status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("makes Google the primary path without front-loading account administration", () => {
    render(<LoginClient callbackUrl="/coaching" />);

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Firebase/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Start scheduling Sessions/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create account" })).toHaveLength(2);
  });

  it("turns a failed One Tap handoff into a recoverable standard login", () => {
    render(
      <LoginClient
        callbackUrl="/work"
        initialError="google-one-tap-failed"
      />,
    );

    expect(screen.getByTestId("quipsly-login-status")).toHaveTextContent(
      /Use the Google button below to choose an account explicitly/,
    );
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("turns a provider rate response into calm recovery guidance", async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(
      new Error("Rate exceeded."),
    );

    render(<LoginClient callbackUrl="/coaching" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-a-real-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));

    expect(
      await screen.findByText(/Sign-in is temporarily busy/),
    ).toHaveTextContent(/Google or password recovery/);
  });

  it("explains the exact coaching destination instead of dropping a new coach into generic Nest copy", () => {
    render(<LoginClient callbackUrl="/coaching" />);

    expect(screen.getByRole("heading", { name: "Continue to coaching" })).toBeInTheDocument();
    expect(screen.getByText(/schedule, Sessions, recordings, notes, goals, and tasks/)).toBeInTheDocument();
  });

  it("keeps a client oriented to the private Session they opened", () => {
    render(<LoginClient callbackUrl="/sessions/join?token=qsinv_safe-token" />);

    expect(screen.getByRole("heading", { name: "Open your Session" })).toBeInTheDocument();
    expect(screen.getByText(/join your private Session/)).toBeInTheDocument();
  });
});
