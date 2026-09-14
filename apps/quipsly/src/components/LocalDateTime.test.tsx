import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import LocalDateTime from "./LocalDateTime";

describe("LocalDateTime", () => {
  const instant = "2026-07-27T22:15:00.000Z";

  it.each(["America/Denver", "Asia/Tokyo"])("hydrates appointment time for %s without moving its instant", (timeZone) => {
    const Formatter = Intl.DateTimeFormat;
    const spy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation((locale, options) =>
      new Formatter(locale || "en-US", { ...options, timeZone: options?.timeZone || timeZone }));
    try {
      const html = renderToString(<LocalDateTime value={instant} mode="appointment" />);
      expect(html).toContain("UTC");
      expect(html).toContain("10:15 PM");
      const { container } = render(<LocalDateTime value={instant} mode="appointment" />);
      const expected = new Formatter("en-US", { timeZone, weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(instant));
      expect(container.querySelector("time")).toHaveTextContent(expected);
      expect(container.querySelector("time")).toHaveAttribute("datetime", instant);
    } finally { spy.mockRestore(); }
  });

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
