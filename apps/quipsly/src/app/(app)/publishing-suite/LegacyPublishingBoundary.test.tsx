import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import LegacyPublishingAnalyticsPage from "./analytics/page";
import LegacyPublishingCalendarPage from "./calendar/page";
import { connectTwitterAction, connectYouTubeAction } from "./connections/actions";
import LegacyPublishingConnectionsPage from "./connections/page";
import PublishingSuiteLayout from "./layout";
import {
  LegacyPublishingBoundary,
  legacyPublishingSurfaceCopy,
  type LegacyPublishingSurface,
} from "./LegacyPublishingBoundary";
import LegacyPublishingPackageBuilderPage from "./package-builder/page";
import PublishingSuiteDashboard from "./page";
import LegacyPublishingYouTubePage from "./youtube/page";

describe("retired publishing-suite boundary", () => {
  const routes: Array<{
    Component: () => React.JSX.Element;
    primaryHref: "/publishing" | "/schedule" | "/analytics";
    surface: LegacyPublishingSurface;
  }> = [
    { Component: PublishingSuiteDashboard, primaryHref: "/publishing", surface: "overview" },
    { Component: LegacyPublishingPackageBuilderPage, primaryHref: "/publishing", surface: "package-builder" },
    { Component: LegacyPublishingCalendarPage, primaryHref: "/schedule", surface: "calendar" },
    { Component: LegacyPublishingAnalyticsPage, primaryHref: "/analytics", surface: "analytics" },
    { Component: LegacyPublishingConnectionsPage, primaryHref: "/publishing", surface: "connections" },
    { Component: LegacyPublishingYouTubePage, primaryHref: "/publishing", surface: "youtube" },
  ];

  afterEach(() => cleanup());

  it.each(routes)("renders $surface as a read-only archived route", ({ Component, primaryHref, surface }) => {
    render(<Component />);

    expect(screen.getByRole("heading", { name: legacyPublishingSurfaceCopy[surface].title })).toBeInTheDocument();
    expect(screen.getByText("Archived prototype")).toBeInTheDocument();
    expect(screen.getByText(/This archived boundary is read-only/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", primaryHref);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Package approved and published live!", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("Mock upload to YouTube Data API complete!", { exact: false })).not.toBeInTheDocument();
  });

  it("keeps the suite layout free of invented provider health", () => {
    render(
      <PublishingSuiteLayout>
        <LegacyPublishingBoundary surface="overview" />
      </PublishingSuiteLayout>,
    );

    expect(screen.queryByText("System Status")).not.toBeInTheDocument();
    expect(screen.queryByText("RSS Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("YouTube API")).not.toBeInTheDocument();
    expect(screen.queryByText("Patreon API")).not.toBeInTheDocument();
  });

  it("fails closed if an obsolete connection action is invoked directly", async () => {
    await expect(connectTwitterAction()).resolves.toEqual({
      ok: false,
      errorCode: "LEGACY_PUBLISHING_SUITE_RETIRED",
      error: "Legacy channel connections are disabled. No provider authorization was started.",
    });
    await expect(connectYouTubeAction()).resolves.toEqual({
      ok: false,
      errorCode: "LEGACY_PUBLISHING_SUITE_RETIRED",
      error: "Legacy channel connections are disabled. No provider authorization was started.",
    });
  });
});
