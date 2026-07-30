import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

type PersonalWritingDocumentClient =
  | PrismaClient
  | Prisma.TransactionClient;

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().slice(0, 320);
}

export async function resolvePersonalWritingActorUserId(
  prisma: PersonalWritingDocumentClient,
  actorEmail: string | null | undefined,
) {
  const email = normalizeEmail(actorEmail);
  if (!email) return null;
  const actor = await prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: email },
        { aliases: { some: { email } } },
      ],
    },
    select: { id: true },
  });
  return actor?.id ?? null;
}

export function personalWritingDocumentVisibilityWhere(
  actorUserId: string | null | undefined,
): Prisma.StudioDocumentWhereInput {
  return actorUserId
    ? {
        OR: [
          { personalOwnerUserId: null },
          { personalOwnerUserId: actorUserId },
        ],
      }
    : { personalOwnerUserId: null };
}

export function canReadPersonalWritingDocument(
  personalOwnerUserId: string | null | undefined,
  actorUserId: string | null | undefined,
) {
  return !personalOwnerUserId || personalOwnerUserId === actorUserId;
}

export function assertPersonalWritingDocumentAccess(
  personalOwnerUserId: string | null | undefined,
  actorUserId: string | null | undefined,
) {
  if (!canReadPersonalWritingDocument(personalOwnerUserId, actorUserId)) {
    // Deliberately indistinguishable from an absent document.
    throw new Error("Document not found.");
  }
}
