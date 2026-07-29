import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("submits actual autofilled form values even when React received no change events", async () => {
    render(<LoginClient callbackUrl="/projects" />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Sign in with email/password" });

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

  it("explains how an existing password user can safely connect Google", async () => {
    (signInWithPopup as jest.Mock).mockRejectedValue({
      code: "auth/account-exists-with-different-credential",
    });

    render(<LoginClient callbackUrl="/projects" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );

    expect(GoogleAuthProvider).toHaveBeenCalled();
    expect(
      await screen.findByText(/Account switch → Connect Google/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("quipsly-login-status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
