import React from "react";
import { render, screen } from "@testing-library/react";

import RenderQueuePage from "./page";

describe("render readiness page", () => {
  it("shows the native production lane without a sample job or local socket claim", () => {
    render(<RenderQueuePage />);

    expect(screen.getByRole("status", { name: "Render worker unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /No web render worker/i })).toBeInTheDocument();
    expect(screen.getByText(/old queue was an in-memory demo with a sample job/i)).toBeInTheDocument();
    expect(screen.getByText(/use Quipsly Studio on the production Mac/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start render/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Revolution \(Final Cut\)/i)).not.toBeInTheDocument();
  });
});
