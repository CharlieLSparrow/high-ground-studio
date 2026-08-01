import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import LocalDateTime from "./LocalDateTime";

describe("LocalDateTime", () => {
  const instant = "2026-07-27T22:15:00.000Z";

  it("renders a deterministic UTC server snapshot for hydration", () => {
    const html = renderToString(<LocalDateTime value={instant} />);

    expect(html).toContain('dateTime="2026-07-27T22:15:00.000Z"');
    expect(html).toContain("UTC");
  });

  it("renders a deterministic date-only UTC server snapshot for hydration", () => {
    const html = renderToString(<LocalDateTime value={instant} mode="date" />);

    expect(html).toContain('dateTime="2026-07-27T22:15:00.000Z"');
    expect(html).toContain("Jul 27, 2026, UTC");
  });

  it("preserves the exact instant while presenting a local clock", () => {
    render(<LocalDateTime value={instant} mode="time" />);

    expect(screen.getByText(
      new Date(instant).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    )).toHaveAttribute("datetime", instant);
  });

  it("preserves the exact instant while presenting a local date", () => {
    render(<LocalDateTime value={instant} mode="date" />);

    expect(screen.getByText(
      new Date(instant).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }),
    )).toHaveAttribute("datetime", instant);
  });

  it("renders nothing for an invalid instant", () => {
    const { container } = render(<LocalDateTime value="not-a-date" />);
    expect(container).toBeEmptyDOMElement();
  });
});
