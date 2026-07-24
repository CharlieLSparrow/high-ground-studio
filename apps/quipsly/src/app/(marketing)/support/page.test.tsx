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

  it("keeps privacy and account deletion reachable without Patreon", () => {
    render(<SupportPage />);

    expect(
      screen.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: "Review account deletion" }),
    ).toHaveAttribute("href", "/privacy/account-deletion");
    expect(
      screen.getByText(/optional and is not the support channel/i),
    ).toBeInTheDocument();
  });
});
