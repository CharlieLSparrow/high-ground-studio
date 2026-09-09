import { render, screen } from "@testing-library/react";
import CoachingLayout from "./layout";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";

jest.mock("@/lib/prisma", () => ({getPrismaClient: jest.fn()}));
jest.mock("@/lib/server/quipsly-session", () => ({getQuipslySession: jest.fn()}));
jest.mock("next/navigation", () => ({usePathname: () => "/coaching"}));
const prisma = {coachProfile: {findFirst: jest.fn()}, coachingEngagementMember: {findMany: jest.fn()}};

describe("coaching entry navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySession).mockResolvedValue({user: {id: "new-person"}} as never);
    prisma.coachProfile.findFirst.mockResolvedValue(null);
    prisma.coachingEngagementMember.findMany.mockResolvedValue([]);
  });
  it("makes Clients reachable before the first profile, relationship, or booking exists", async () => {
    render(await CoachingLayout({children: "Start here"}));
    expect(screen.getByRole("link", {name: "Clients"})).toHaveAttribute("href", "/coaching/engagements");
    expect(screen.getByRole("link", {name: "New session"})).toBeInTheDocument();
    expect(prisma.coachingEngagementMember.findMany).toHaveBeenCalledWith({
      where: {userId: "new-person", status: "ACTIVE"}, select: {role: true}, distinct: ["role"],
    });
    expect(prisma.coachProfile.findFirst).toHaveBeenCalledWith({
      where: {userId: "new-person", isActive: true}, select: {id: true},
    });
  });
  it("keeps an invited client's shared spaces reachable without a coach-only session action", async () => {
    prisma.coachingEngagementMember.findMany.mockResolvedValue([{role: "CLIENT"}]);
    render(await CoachingLayout({children: "My work"}));
    expect(screen.getByRole("link", {name: "My spaces"})).toHaveAttribute("href", "/coaching/engagements");
    expect(screen.queryByRole("link", {name: "New session"})).not.toBeInTheDocument();
  });
  it("recognizes a coach who started with a space rather than a scheduled session", async () => {
    prisma.coachingEngagementMember.findMany.mockResolvedValue([{role: "CLIENT"}, {role: "COACH"}]);
    render(await CoachingLayout({children: "My practice"}));
    expect(screen.getByRole("link", {name: "Clients"})).toBeInTheDocument();
  });
  it("recognizes an existing coach profile even when the person also attends sessions as a client", async () => {
    prisma.coachProfile.findFirst.mockResolvedValue({id: "profile"});
    prisma.coachingEngagementMember.findMany.mockResolvedValue([{role: "CLIENT"}]);
    render(await CoachingLayout({children: "My practice"}));
    expect(screen.getByRole("link", {name: "New session"})).toBeInTheDocument();
  });
  it("does not mistake an unavailable membership read for a first-time coach", async () => {
    prisma.coachingEngagementMember.findMany.mockRejectedValue(new Error("Database unavailable"));
    render(await CoachingLayout({children: "Existing shared work"}));
    expect(screen.queryByRole("link", {name: "New session"})).not.toBeInTheDocument();
    expect(screen.getByText("Existing shared work")).toBeVisible();
    expect(screen.getByRole("link", {name: "My spaces"})).toBeInTheDocument();
  });
  it("does not query an unscoped membership list for a signed-out visitor", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null);
    render(await CoachingLayout({children: "Sign in"}));
    expect(prisma.coachingEngagementMember.findMany).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", {name: "New session"})).not.toBeInTheDocument();
  });
});
