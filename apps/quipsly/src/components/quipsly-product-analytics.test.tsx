import { fireEvent, render, screen } from "@testing-library/react";

import { QuipslyProductAnalytics } from "./quipsly-product-analytics";

jest.mock("next/navigation", () => ({
  usePathname: () => "/coaching/sessions",
}));

jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ children, id, src }: { children?: string; id?: string; src?: string }) => (
    <script id={id} src={src}>{children}</script>
  ),
}));

describe("Quipsly product analytics consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "quipsly_analytics_consent=; Max-Age=0; Path=/";
  });

  it("loads no Google tag when a person declines", () => {
    const { container } = render(
      <QuipslyProductAnalytics measurementId="G-47PCQGW8ZB" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(window.localStorage.getItem("quipsly.analytics-consent.v1")).toBe("denied");
    expect(document.cookie).toContain("quipsly_analytics_consent=denied");
    expect(container.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
  });

  it("loads the exact stream after a stored shared-domain grant", () => {
    document.cookie = "quipsly_analytics_consent=granted; Path=/";
    const { container } = render(
      <QuipslyProductAnalytics measurementId="G-47PCQGW8ZB" />,
    );

    expect(screen.queryByRole("button", { name: "Allow analytics" })).toBeNull();
    expect(
      container.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-47PCQGW8ZB"]'),
    ).not.toBeNull();
  });
});
