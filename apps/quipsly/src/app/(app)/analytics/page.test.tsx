import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import AnalyticsPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));

const mockedAuth = jest.mocked(auth);
const mockedPrisma = jest.mocked(getPrismaClient);

function prismaHarness(options: { membership?: any; membershipError?: Error } = {}) {
  const organizationMember = {
    findFirst: options.membershipError
      ? jest.fn().mockRejectedValue(options.membershipError)
      : jest.fn().mockResolvedValue(options.membership ?? null),
  };
  const landingPage = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { views: 40, conversions: 10 } }),
  };
  const marketingLead = { count: jest.fn().mockResolvedValue(7) };
  const userEvent = {
    count: jest.fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(12),
    findMany: jest.fn().mockResolvedValue([
      {
        id: "event-1",
        eventName: "Session packet reviewed",
        payloadJson: { packetId: "packet-1", externalSideEffects: false },
        createdAt: new Date("2026-07-18T15:00:00.000Z"),
        user: { name: "Charlie", primaryEmail: "charlie@example.com" },
      },
    ]),
    groupBy: jest.fn().mockResolvedValue([
      { eventName: "Session packet reviewed", _count: { id: 6 } },
    ]),
  };
  return { organizationMember, landingPage, marketingLead, userEvent };
}

describe("analytics truth boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedAuth.mockResolvedValue({ user: { id: "user-1", isStaff: false } } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("requires sign-in before opening persistence", async () => {
    mockedAuth.mockResolvedValue(null);

    render(await AnalyticsPage());

    expect(screen.getByRole("heading", { name: "Sign in to Studio" })).toBeInTheDocument();
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("does not bootstrap an organization, subscription, or metrics on page view", async () => {
    const prisma = prismaHarness();
    mockedPrisma.mockReturnValue(prisma as never);

    render(await AnalyticsPage());

    expect(screen.getByRole("status", { name: "Analytics workspace required" })).toBeInTheDocument();
    expect(screen.getByText(/does not silently create an organization, subscription, pricing plan, or event history/i)).toBeInTheDocument();
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.landingPage.aggregate).not.toHaveBeenCalled();
    expect(prisma.marketingLead.count).not.toHaveBeenCalled();
    expect(prisma.userEvent.count).not.toHaveBeenCalled();
  });

  it("shows a calm outage instead of fake zeroes or raw diagnostics", async () => {
    const prisma = prismaHarness({
      membershipError: new Error("Prisma failed at /Users/wall-e/Dev/high-ground-studio/prisma/schema.prisma: ECONNREFUSED"),
    });
    mockedPrisma.mockReturnValue(prisma as never);

    const { container } = render(await AnalyticsPage());

    expect(screen.getByRole("status", { name: "Analytics unavailable" })).toBeInTheDocument();
    expect(screen.getByText("The workspace database connection is unavailable.")).toBeInTheDocument();
    expect(screen.getByText(/No zeroes, sample charts, or generated retention points/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("/Users/wall-e/Dev");
    expect(container).not.toHaveTextContent("AI-Revolution-01");
  });

  it("renders only persisted workspace counts and labels retention ownership honestly", async () => {
    const prisma = prismaHarness({
      membership: {
        role: "OWNER",
        organization: { id: "org-1", name: "High Ground", slug: "high-ground" },
      },
    });
    mockedPrisma.mockReturnValue(prisma as never);

    render(await AnalyticsPage());

    expect(screen.getByRole("heading", { name: "High Ground analytics" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getAllByText("25.0%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("Session packet reviewed")).toHaveLength(2);
    expect(screen.getByText(/Real records only/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sharp Viewers Drop Detected/i)).not.toBeInTheDocument();
  });
});
