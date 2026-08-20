/** @jest-environment node */

import {
  projectClientInvitationDelivery,
  projectClientInvitationDeliveryForViewer,
} from "./coaching-invitation-delivery-projection";

describe("projectClientInvitationDelivery", () => {
  it("projects only the exact client's latest delivery", () => {
    const exact = {
      id: "delivery-client",
      channel: "EMAIL",
      status: "SENT",
      requestedAt: new Date("2026-08-19T20:00:00.000Z"),
      completedAt: new Date("2026-08-19T20:00:01.000Z"),
      errorCode: null,
      errorMessage: null,
    };
    expect(
      projectClientInvitationDelivery({
        clientEmail: " Client@Example.com ",
        invitations: [
          { email: "observer@example.com", deliveries: [{ ...exact, id: "wrong" }] },
          { email: "client@example.com", deliveries: [exact] },
        ],
      }),
    ).toEqual(exact);
  });

  it("does not imply delivery when the client has no durable receipt", () => {
    expect(
      projectClientInvitationDelivery({
        clientEmail: "client@example.com",
        invitations: [{ email: "client@example.com", deliveries: [] }],
      }),
    ).toBeNull();
  });

  it("does not expose delivery-provider detail to the invited client", () => {
    expect(
      projectClientInvitationDeliveryForViewer({
        canManageInvitation: false,
        clientEmail: "client@example.com",
        invitations: [
          {
            email: "client@example.com",
            deliveries: [
              {
                id: "delivery-failed",
                channel: "EMAIL",
                status: "FAILED",
                requestedAt: new Date("2026-08-19T20:00:00.000Z"),
                errorCode: "PROVIDER_CONFIGURATION_REQUIRED",
                errorMessage: "Provider credentials are not configured.",
              },
            ],
          },
        ],
      }),
    ).toBeNull();
  });
});
