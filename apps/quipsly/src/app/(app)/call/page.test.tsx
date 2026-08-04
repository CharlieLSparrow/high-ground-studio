import React from "react";
import { render, screen } from "@testing-library/react";

import CallRoomPage from "./page";

const redirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (value: string) => redirect(value) }));

describe("canonical live Session entry", () => {
  beforeEach(() => redirect.mockClear());

  it("explains that browser and iPhone calls belong to a saved Session", async () => {
    render(await CallRoomPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: /Browser calls now live inside the work they belong to/i })).toBeInTheDocument();
    expect(screen.getByText(/Use external studio devices/i)).toBeInTheDocument();
    expect(screen.getByText(/Join from browser and iPhone/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose a Session/i })).toHaveAttribute("href", "/coaching/sessions");
    expect(screen.queryByText(/prototype call room is retired/i)).not.toBeInTheDocument();
  });

  it("preserves old room links by sending them to the canonical live workspace", async () => {
    await CallRoomPage({ searchParams: Promise.resolve({ room: "call-room-1" }) });
    expect(redirect).toHaveBeenCalledWith("/sessions/call-room-1?mode=live");
  });
});
