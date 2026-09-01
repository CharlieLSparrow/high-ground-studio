import { render, screen } from "@testing-library/react";

import { loadPublicCoachingOfferings } from "@/lib/server/public-coaching-offerings";
import PublicCoachingPage from "./page";

jest.mock("@/lib/server/public-coaching-offerings", () => ({
  loadPublicCoachingOfferings: jest.fn(),
}));

const mockedLoadOfferings = jest.mocked(loadPublicCoachingOfferings);

describe("PublicCoachingPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders published coaches and sends clients to the exact booking page", async () => {
    mockedLoadOfferings.mockResolvedValue({
      source: "quipsly-database",
      unavailable: false,
      items: [
        {
          id: "offering-homer",
          slug: "coaching-with-homer",
          title: "Coaching with Homer",
          description: "A calm, practical coaching Session.",
          kind: "COACHING_ONE_TO_ONE",
          paymentPolicy: "FREE",
          durationMinutes: 60,
          priceLabel: null,
          coachName: "Scott Sparrow",
          nextAction: "Choose a time and sign in to request it.",
          bookingPath: "/coaching/book/coaching-with-homer",
          bookableSlots: [
            {
              instant: "2026-09-01T16:00:00.000Z",
              timezone: "America/Denver",
              label: "Tuesday, September 1 at 10:00 AM",
            },
          ],
        },
      ],
    });

    render(await PublicCoachingPage());

    expect(
      screen.getByRole("heading", { name: "Coaching with Homer" }),
    ).toBeVisible();
    expect(screen.getByText("Scott Sparrow")).toBeVisible();
    expect(screen.getByText("1 times available")).toBeVisible();
    expect(screen.getByRole("link", { name: /Choose a time/ })).toHaveAttribute(
      "href",
      "/coaching/book/coaching-with-homer",
    );
  });

  it("distinguishes no published availability from a temporary loading failure", async () => {
    mockedLoadOfferings.mockResolvedValue({
      source: "unavailable",
      unavailable: true,
      error: "database unavailable",
      items: [],
    });

    render(await PublicCoachingPage());

    expect(
      screen.getByRole("heading", {
        name: "No coaching times are published right now.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Quipsly could not load current availability. Please try again in a moment.",
      ),
    ).toBeVisible();
  });
});
