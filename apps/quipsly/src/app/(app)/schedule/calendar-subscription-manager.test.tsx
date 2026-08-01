import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { CalendarSubscriptionManager } from "./calendar-subscription-manager";

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("CalendarSubscriptionManager", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("keeps the one-time link and confirmation visible after status refresh", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          ok: true,
          feed: {
            id: "feed-1",
            purpose: "PERSONAL_COMMITMENTS",
            displayName: "My Quipsly commitments",
            subscriptionUrl:
              "https://nest.quipsly.com/api/calendar/feeds/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            webcalUrl:
              "webcal://nest.quipsly.com/api/calendar/feeds/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            shownOnce: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          ok: true,
          feeds: [
            {
              id: "feed-1",
              purpose: "PERSONAL_COMMITMENTS",
              displayName: "My Quipsly commitments",
              projectId: null,
              status: "ACTIVE",
              createdAt: "2026-08-01T12:00:00.000Z",
              lastGeneratedAt: null,
            },
          ],
        }),
      );
    global.fetch = fetchMock;

    render(<CalendarSubscriptionManager projects={[]} initialFeeds={[]} />);
    const commitments = within(
      screen
        .getByRole("heading", { name: "My commitments" })
        .closest("article")!,
    );
    fireEvent.click(
      commitments.getByRole("button", { name: "Create private link" }),
    );

    await screen.findByText(/Shown once · My Quipsly commitments/i);
    expect(
      screen.getByText(/Private link created\. Add or copy it now/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Other calendars → From URL/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Add calendar → Subscribe from web/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        commitments.getByText("Active", { exact: true }),
      ).toBeInTheDocument(),
    );
  });

  it("keeps revocation confirmation visible after status refresh", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ ok: true, revoked: 1 }))
      .mockResolvedValueOnce(response({ ok: true, feeds: [] }));
    global.fetch = fetchMock;

    render(
      <CalendarSubscriptionManager
        projects={[]}
        initialFeeds={[
          {
            id: "feed-1",
            purpose: "PERSONAL_COMMITMENTS",
            displayName: "My Quipsly commitments",
            projectId: null,
            status: "ACTIVE",
            createdAt: "2026-08-01T12:00:00.000Z",
            lastGeneratedAt: null,
          },
        ]}
      />,
    );
    const commitments = within(
      screen
        .getByRole("heading", { name: "My commitments" })
        .closest("article")!,
    );
    fireEvent.click(commitments.getByRole("button", { name: "Revoke" }));

    await screen.findByText(
      /Subscription revoked\. The old private link now returns not found/i,
    );
    await waitFor(() =>
      expect(
        commitments.getByText("Not shared", { exact: true }),
      ).toBeInTheDocument(),
    );
  });
});
