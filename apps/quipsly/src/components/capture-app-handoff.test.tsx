import { render, screen } from "@testing-library/react";

import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  it("hands off only canonical Session identity and promises no implicit authority", () => {
    render(<CaptureAppHandoff roomId="room-safe_42" joinedFromInvitation />);
    expect(screen.getByRole("heading", { name: "Choose where you want to join" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Capture" })).toHaveAttribute(
      "href",
      "quipsly://session/room-safe_42?mode=live",
    );
    expect(screen.getByText(/cannot grant access, join media, or start recording/i)).toBeInTheDocument();
  });
});
