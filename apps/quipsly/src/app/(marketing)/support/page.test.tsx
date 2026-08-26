import { render, screen } from "@testing-library/react";

import SupportPage from "./page";

describe("Quipsly support page", () => {
  it("provides direct support contact and safe troubleshooting guidance", () => {
    render(<SupportPage />);

    expect(
      screen.getByRole("heading", { name: "Tell us what got in your way." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Email Quipsly support" }),
    ).toHaveAttribute(
      "href",
      "mailto:charlie@highgroundodyssey.com?subject=Quipsly%20support",
    );
    expect(
      screen.getByText(/Never email a password, authentication code/),
    ).toBeInTheDocument();
  });

  it("keeps privacy, deletion, and subscription help reachable", () => {
    render(<SupportPage />);

    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: "Delete your account" }),
    ).toHaveAttribute("href", "/privacy/account-deletion");
    expect(screen.getByRole("link", { name: "Review pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(
      screen.getByRole("link", { name: "Manage Apple subscriptions" }),
    ).toHaveAttribute("href", "https://apps.apple.com/account/subscriptions");
  });
});
