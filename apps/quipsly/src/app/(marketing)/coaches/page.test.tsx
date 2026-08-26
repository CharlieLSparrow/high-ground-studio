import { render, screen } from "@testing-library/react";

import CoachesPage from "./page";

describe("Quipsly for Coaches", () => {
  it("presents one complete paid coaching journey without internal operations language", () => {
    render(<CoachesPage />);

    expect(
      screen.getByRole("heading", {
        name: "From booking to breakthrough to follow-through.",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Start 14-day free trial").length).toBeGreaterThan(0);
    expect(screen.getByText("$29.99")).toBeInTheDocument();
    expect(screen.getByText("$299.99")).toBeInTheDocument();
    expect(screen.getByText("Unlimited client invitations")).toBeInTheDocument();
    expect(screen.getByText("Transcript correction and basic editing")).toBeInTheDocument();
    expect(screen.queryByText(/Homer operator/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payment evidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/approval queue/i)).not.toBeInTheDocument();
  });

  it("sends a coach into the ordinary signed-in coaching surface", () => {
    render(<CoachesPage />);

    for (const link of screen.getAllByRole("link", { name: /start .*free trial/i })) {
      expect(link).toHaveAttribute(
        "href",
        "https://nest.quipsly.com/login?callbackUrl=%2Fcoaching",
      );
    }
  });
});
