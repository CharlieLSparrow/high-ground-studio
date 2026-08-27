import { deleteAccountEmailOperationalData } from "./account-deletion-email-operational-data";

jest.mock("server-only", () => ({}));

describe("account deletion email operational data", () => {
  it("removes detached provider evidence, delivery state, and invitations for every account address", async () => {
    const emailProviderEvent = { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const callRoomInvitationDeliveryReceipt = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const emailRecipientDeliveryState = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const callRoomInvitation = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    await deleteAccountEmailOperationalData({
      tx: {
        emailProviderEvent,
        callRoomInvitationDeliveryReceipt,
        emailRecipientDeliveryState,
        callRoomInvitation,
      } as never,
      userId: "user-1",
      emails: [" Charlie@Example.com ", "alias@example.com", "charlie@example.com"],
    });

    const emails = ["charlie@example.com", "alias@example.com"];
    expect(emailProviderEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { recipientEmail: { in: emails } },
          { transactionalEmail: { recipientUserId: "user-1" } },
        ],
      },
    });
    expect(callRoomInvitationDeliveryReceipt.deleteMany).toHaveBeenCalledWith({
      where: { recipientEmail: { in: emails } },
    });
    expect(emailRecipientDeliveryState.deleteMany).toHaveBeenCalledWith({
      where: { recipientEmail: { in: emails } },
    });
    expect(callRoomInvitation.deleteMany).toHaveBeenCalledWith({
      where: { email: { in: emails } },
    });
  });

  it("does not issue broad deletes when the stored address set is empty", async () => {
    const deleteMany = jest.fn();
    await deleteAccountEmailOperationalData({
      tx: {
        emailProviderEvent: { deleteMany },
        callRoomInvitationDeliveryReceipt: { deleteMany },
        emailRecipientDeliveryState: { deleteMany },
        callRoomInvitation: { deleteMany },
      } as never,
      userId: "user-1",
      emails: ["  "],
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
