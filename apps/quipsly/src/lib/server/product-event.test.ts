import { recordQuipslyProductOutcome } from "./product-event";

describe("recordQuipslyProductOutcome", () => {
  it("persists only the bounded product taxonomy", async () => {
    const prisma = {
      userEvent: { create: jest.fn().mockResolvedValue({ id: "event-1" }) },
    };

    await recordQuipslyProductOutcome({
      prisma: prisma as never,
      userId: "user-1",
      organizationId: "org-1",
      eventName: "invitation_accepted",
      parameters: {
        workflow: "coaching",
        participant_role: "client",
        result: "success",
        // Prove an accidental unbounded field cannot enter the event ledger.
        email: "client@example.com",
      } as never,
    });

    expect(prisma.userEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        organizationId: "org-1",
        eventName: "Product: invitation_accepted",
        payloadJson: {
          schema: "quipsly-product-event-v1",
          parameters: {
            workflow: "coaching",
            participant_role: "client",
            result: "success",
          },
          source: "server-outcome",
        },
      },
    });
  });

  it("works before a new user belongs to an organization", async () => {
    const prisma = {
      userEvent: { create: jest.fn().mockResolvedValue({ id: "event-2" }) },
    };

    await recordQuipslyProductOutcome({
      prisma: prisma as never,
      userId: "user-2",
      eventName: "sign_up",
      parameters: { method: "google", result: "success" },
    });

    expect(prisma.userEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: null }),
      }),
    );
  });
});
