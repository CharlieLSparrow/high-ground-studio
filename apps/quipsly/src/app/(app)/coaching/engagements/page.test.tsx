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
  it("does not ask a client to become a coach or create another client", async () => {
    prisma.coachProfile.findFirst.mockResolvedValue(null);
    render(await Page());
    expect(screen.getByRole("heading", { name: "Your coaching spaces" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create client space" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add client" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Your shared spaces will appear here/ })).toBeInTheDocument();
  });
});
