import "server-only";

import { Prisma } from "@prisma/client";

// Research readback and portable export use the same SQL aliases. Keeping this
// predicate shared prevents one surface from disclosing a private draft link
// that the other correctly withholds.
export function researchWritingUseVisibilitySql(actorUserId: string | null | undefined) {
  return actorUserId
    ? Prisma.sql`(document."isPrivate" = false OR annotation_use."createdByUserId" = ${actorUserId})`
    : Prisma.sql`document."isPrivate" = false`;
}
