import { render, screen } from "@testing-library/react";
import Page from "./page";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

const prisma = { coachProfile: { findFirst: jest.fn() }, coachingEngagement: { findMany: jest.fn() } };
describe("fresh client portfolio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "person", primaryEmail: "person@example.test" } } as never);
    prisma.coachingEngagement.findMany.mockResolvedValue([]);
  });
  it("lets a coach add the first client without first scheduling a session", async () => {
    prisma.coachProfile.findFirst.mockResolvedValue({ id: "coach-profile" });
    render(await Page());
    expect(screen.getByRole("heading", { name: "Your clients" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /client email/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create client space" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add client" })).toHaveAttribute("href", "#add-client");
  });
  it("lets a genuinely new user start a practice without a pre-created coach profile", async () => {
    prisma.coachProfile.findFirst.mockResolvedValue(null);
    render(await Page());
    expect(screen.getByRole("heading", { name: "Your clients" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /client email/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create client space" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add client" })).toHaveAttribute("href", "#add-client");
  });
  it("keeps an invited client's existing space without asking them to set up a practice", async () => {
    prisma.coachProfile.findFirst.mockResolvedValue(null);
    prisma.coachingEngagement.findMany.mockResolvedValue([{
      id: "space", title: "Coaching together", status: "ACTIVE", updatedAt: new Date(),
      members: [
        {id: "membership", userId: "person", role: "CLIENT", user: {name: "Person", primaryEmail: "person@example.test"}},
        {id: "coach-membership", userId: "coach", role: "COACH", user: {name: "Morgan Ellis", primaryEmail: "coach@example.test"}},
      ],
      callRooms: [], notes: [], actionItems: [], goals: [],
    }]);
    render(await Page());
    expect(screen.getByRole("heading", { name: "Your coaching spaces" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create client space" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add client" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Morgan Ellis"})).toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "Person"})).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", {name: "Search spaces"})).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", {name: "Search clients"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Open shared space"})).toHaveAttribute("href", "/coaching/engagements/space");
    expect(screen.queryByText(/schedule your next session/i)).not.toBeInTheDocument();
  });
});
