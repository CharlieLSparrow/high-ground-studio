import "server-only";

import type { AccountDeletionExternalServices } from "@/lib/server/account-deletion-external";

export type AccountDeletionConfirmationStatus =
  | "sent"
  | "not-configured"
  | "delivery-failed";

export type AccountDeletionConfirmationResolution = {
  status: AccountDeletionConfirmationStatus;
  resolvedAt: string;
  sentAt?: string;
};

export async function resolveAccountDeletionConfirmation(input: {
  external: AccountDeletionExternalServices;
  email: string;
  requestId: string;
  idempotencyKey: string;
  now?: () => Date;
}): Promise<AccountDeletionConfirmationResolution> {
  const resolvedAt = (input.now?.() ?? new Date()).toISOString();
  if (input.external.completionConfirmationConfigured === false) {
    return { status: "not-configured", resolvedAt };
  }

  try {
    await input.external.sendCompletionConfirmation({
      email: input.email,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
    });
    return { status: "sent", resolvedAt, sentAt: resolvedAt };
  } catch {
    return { status: "delivery-failed", resolvedAt };
  }
}
