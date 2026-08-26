import { render, screen } from "@testing-library/react";

import TermsPage from "./page";

describe("Quipsly Terms", () => {
  it("publishes subscription and recording terms instead of beta placeholder copy", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText("6. Subscriptions and free trials")).toBeInTheDocument();
    expect(screen.getByText("3. Coaching Sessions, invitations, and consent")).toBeInTheDocument();
    expect(screen.getByText("4. Your content")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Privacy Policy" })) {
      expect(link).toHaveAttribute("href", "/privacy");
    }
    expect(screen.queryByText(/closed private beta/i)).not.toBeInTheDocument();
  });
});
