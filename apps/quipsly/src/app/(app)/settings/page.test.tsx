import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import SettingsPage from "./page";
import {
  getOrgEventsAction,
  getOrgFeedbackTicketsAction,
  getOrgMembersAction,
} from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));
jest.mock("./actions", () => ({
  getOrgMembersAction: jest.fn(),
  getOrgEventsAction: jest.fn(),
  getOrgFeedbackTicketsAction: jest.fn(),
  updateOrgDetailsAction: jest.fn(),
  removeTeamMemberAction: jest.fn(),
  updateMemberRoleAction: jest.fn(),
}));
jest.mock("@/app/(marketing)/help/actions", () => ({
  createCategoryAction: jest.fn(),
  deleteCategoryAction: jest.fn(),
  upsertArticleAction: jest.fn(),
  deleteArticleAction: jest.fn(),
}));
jest.mock("./feedback-card", () => ({ FeedbackPortal: () => <div>Feedback portal</div> }));

const mockedAuth = jest.mocked(auth);
const mockedPrisma = jest.mocked(getPrismaClient);

describe("Settings page read boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps signed-out users on the settings path with a return-safe sign-in gate", async () => {
    mockedAuth.mockResolvedValue(null as never);
    render(await SettingsPage());
    expect(screen.getByText("signed-out:/settings")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("does not bootstrap an organization, plan, subscription, or event on page view", async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue(null) },
      subscriptionPlan: { findMany: jest.fn() },
      knowledgeCategory: { findMany: jest.fn() },
    };
    mockedPrisma.mockReturnValue(prisma as never);

    render(await SettingsPage());

    expect(screen.getByRole("status", { name: "Settings workspace required" })).toBeInTheDocument();
    expect(screen.getByText(/does not silently create an organization, pricing plans, a trial subscription, or activity events/i)).toBeInTheDocument();
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.subscriptionPlan.findMany).not.toHaveBeenCalled();
    expect(getOrgMembersAction).not.toHaveBeenCalled();
    expect(getOrgEventsAction).not.toHaveBeenCalled();
    expect(getOrgFeedbackTicketsAction).not.toHaveBeenCalled();
  });

  it("shows an honest outage without substituting sample records", async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockRejectedValue(new Error("ECONNREFUSED /private/schema.prisma")) },
      subscriptionPlan: { findMany: jest.fn() },
      knowledgeCategory: { findMany: jest.fn() },
    };
    mockedPrisma.mockReturnValue(prisma as never);

    const { container } = render(await SettingsPage());

    expect(screen.getByRole("status", { name: "Settings unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/No sample organization, member, plan, or activity record/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("/private/schema.prisma");
  });
});
