import "server-only";

import type { Prisma } from "@prisma/client";

export async function deleteAccountEmailOperationalData(input: {
  tx: Prisma.TransactionClient;
  userId: string;
  emails: string[];
}) {
  const emails = [...new Set(input.emails.map((email) => email.trim().toLowerCase()))]
    .filter(Boolean);
  if (emails.length === 0) return;

  // Delivery evidence is deliberately detached from User so provider webhooks
  // can still be reconciled after other records change. Account erasure is the
  // exception: remove every address-bound projection and event before the user
  // cascade can detach those facts from their subject.
  await input.tx.emailProviderEvent.deleteMany({
    where: {
      OR: [
        { recipientEmail: { in: emails } },
        { transactionalEmail: { recipientUserId: input.userId } },
      ],
    },
  });
  await input.tx.callRoomInvitationDeliveryReceipt.deleteMany({
    where: { recipientEmail: { in: emails } },
  });
  await input.tx.emailRecipientDeliveryState.deleteMany({
    where: { recipientEmail: { in: emails } },
  });
  await input.tx.callRoomInvitation.deleteMany({
    where: { email: { in: emails } },
  });
}
