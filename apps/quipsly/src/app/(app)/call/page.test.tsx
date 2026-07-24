import React from "react";
import { render, screen } from "@testing-library/react";

import CallRoomPage from "./page";

describe("retired prototype call room", () => {
  it("does not present mic, signaling, recording, or guest-link controls", () => {
    render(<CallRoomPage />);

    expect(screen.getByRole("heading", { name: "This prototype call room is retired." })).toBeInTheDocument();
    expect(screen.getByText(/did not join a room, request microphone access, create a guest link, start recording, or send signaling/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Sessions" })).toHaveAttribute("href", "/coaching/sessions");
    expect(screen.queryByRole("button", { name: /Start live call/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Share guest link/i)).not.toBeInTheDocument();
  });
});
