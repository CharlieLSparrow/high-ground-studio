import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrganizationRole, SubscriptionStatus } from "@prisma/client";

import { SettingsClientView } from "./settings-client-view";

jest.mock("./actions", () => ({
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

const plan = {
  id: "plan-1",
  name: "Legacy Pro row",
  price: 2900,
  currency: "usd",
  interval: "month",
};

const props = {
  initialOrg: {
    id: "org-1",
    name: "High Ground",
    slug: "high-ground",
    description: "Production workspace",
    subscription: {
      id: "sub-1",
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    },
  },
  initialMembers: [
    {
      id: "member-1",
      userId: "user-1",
      role: OrganizationRole.OWNER,
      user: {
        id: "user-1",
        name: "Charlie",
        primaryEmail: "charlie@example.com",
        image: null,
      },
    },
  ],
  initialEvents: [],
  initialFeedback: [],
  plans: [plan, { ...plan, id: "plan-2", name: "Legacy Agency row", price: 9900 }],
  currentUserRole: OrganizationRole.OWNER,
  currentUserId: "user-1",
  initialEntitlement: {
    entitled: true,
    accessMode: "SUBSCRIBED" as const,
    planName: "Quipsly Coach monthly",
    provider: "APP_STORE",
    status: "ACTIVE",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    trialEnd: null,
    trialDays: 14,
    cancelAtPeriodEnd: false,
    management: {
      appStoreURL: "https://apps.apple.com/account/subscriptions",
      webURL: "/settings#subscription",
    },
  },
  initialKbData: [],
};

describe("SettingsClientView truth UX", () => {
  it("shows existing access without an invitation-shaped privilege grant", () => {
    render(<SettingsClientView {...props} />);

    expect(screen.getByText("Existing access only")).toBeInTheDocument();
    expect(screen.getByText(/will not create an account or grant membership/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite member|send invitation/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/editor@quipsly/i)).not.toBeInTheDocument();
  });

  it("renders the verified account access and free-invitee policy without internal catalog scaffolding", () => {
    render(<SettingsClientView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Billing & Plans" }));

    expect(screen.getByText("Quipsly Coach monthly")).toBeInTheDocument();
    expect(screen.getByText("Active subscription")).toBeInTheDocument();
    expect(screen.getByText("People you invite join free.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage subscription/i })).toHaveAttribute(
      "href",
      "https://apps.apple.com/account/subscriptions",
    );
    expect(screen.queryByText(/internal plan catalog|checkout unavailable|billing changes are not connected/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/card number|expiry|cvc/i)).not.toBeInTheDocument();
  });

  it("offers ordinary monthly and annual web checkout when subscription access is needed", () => {
    render(<SettingsClientView
      {...props}
      initialEntitlement={{
        ...props.initialEntitlement,
        entitled: false,
        accessMode: "FREE",
        provider: null,
        status: "UNPAID",
        planName: "Quipsly Coach",
      }}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Billing & Plans" }));

    expect(screen.getByRole("button", { name: "Annual · $299.99/year" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monthly · $29.99/month" })).toBeInTheDocument();
    expect(screen.getByText(/clients continue to join free/i)).toBeInTheDocument();
  });

  it("manages a web purchase through the web billing portal", () => {
    render(<SettingsClientView
      {...props}
      initialEntitlement={{ ...props.initialEntitlement, provider: "STRIPE" }}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Billing & Plans" }));

    expect(screen.getByRole("button", { name: /manage subscription/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /manage subscription/i })).not.toBeInTheDocument();
  });
});
