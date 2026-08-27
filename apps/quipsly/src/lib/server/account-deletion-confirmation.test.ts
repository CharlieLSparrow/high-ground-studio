import { resolveAccountDeletionConfirmation } from "@/lib/server/account-deletion-confirmation";
import type { AccountDeletionExternalServices } from "@/lib/server/account-deletion-external";

function external(input: {
  configured?: boolean;
  send?: AccountDeletionExternalServices["sendCompletionConfirmation"];
} = {}): AccountDeletionExternalServices {
  return {
    completionConfirmationConfigured: input.configured,
    disableFirebaseIdentity: async () => {},
    deleteFirebaseIdentity: async () => {},
    deleteStorageObject: async () => {},
    sendCompletionConfirmation: input.send ?? (async () => {}),
  };
}

const fixedNow = () => new Date("2026-08-27T17:00:00.000Z");

describe("account deletion confirmation", () => {
  it("does not make deletion depend on an unconfigured email provider", async () => {
    const send = jest.fn();
    await expect(resolveAccountDeletionConfirmation({
      external: external({ configured: false, send }),
      email: "person@example.test",
      requestId: "request-1",
      idempotencyKey: "deletion:request-1",
      now: fixedNow,
    })).resolves.toEqual({
      status: "not-configured",
      resolvedAt: "2026-08-27T17:00:00.000Z",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("records delivery failure without rejecting completed deletion", async () => {
    await expect(resolveAccountDeletionConfirmation({
      external: external({
        configured: true,
        send: async () => { throw new Error("provider unavailable"); },
      }),
      email: "person@example.test",
      requestId: "request-1",
      idempotencyKey: "deletion:request-1",
      now: fixedNow,
    })).resolves.toEqual({
      status: "delivery-failed",
      resolvedAt: "2026-08-27T17:00:00.000Z",
    });
  });

  it("records successful idempotent delivery", async () => {
    const send = jest.fn(async () => {});
    const result = await resolveAccountDeletionConfirmation({
      external: external({ configured: true, send }),
      email: "person@example.test",
      requestId: "request-1",
      idempotencyKey: "deletion:request-1",
      now: fixedNow,
    });
    expect(result).toEqual({
      status: "sent",
      resolvedAt: "2026-08-27T17:00:00.000Z",
      sentAt: "2026-08-27T17:00:00.000Z",
    });
    expect(send).toHaveBeenCalledWith({
      email: "person@example.test",
      requestId: "request-1",
      idempotencyKey: "deletion:request-1",
    });
  });
});
