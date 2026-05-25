import "server-only";

import type { Prisma } from "@prisma/client";

import { isClientVisibleCoachingFeatureGrant } from "@/lib/coaching/features";
import { WEEKLY_COMMITMENTS_FEATURE_KEY } from "@/lib/coaching/weekly-commitments";
import { prisma } from "@/lib/prisma";

export async function findEnabledWeeklyCommitmentsGrant(clientUserId: string) {
  const grant = await prisma.coachingFeatureGrant.findFirst({
    where: {
      userId: clientUserId,
      feature: {
        featureKey: WEEKLY_COMMITMENTS_FEATURE_KEY,
        status: "active",
      },
    },
    include: {
      feature: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (
    !grant ||
    !isClientVisibleCoachingFeatureGrant({
      status: grant.status,
      visibility: grant.visibility,
      startsAt: grant.startsAt,
      endsAt: grant.endsAt,
    })
  ) {
    return null;
  }

  return grant;
}

export async function requireWeeklyCommitmentsGrant(clientUserId: string) {
  const grant = await findEnabledWeeklyCommitmentsGrant(clientUserId);

  if (!grant) {
    throw new Error("Weekly Commitments is not enabled for this account.");
  }

  return grant;
}

export function buildWeeklyCommitmentWriteData({
  commitmentOne,
  commitmentTwo,
  commitmentThree,
  supportNeeded,
  progressNotes,
}: {
  commitmentOne: string;
  commitmentTwo: string | null;
  commitmentThree: string | null;
  supportNeeded: string | null;
  progressNotes: string | null;
}) {
  return {
    commitmentOne,
    commitmentTwo,
    commitmentThree,
    supportNeeded,
    progressNotes,
    status: "ACTIVE",
    reviewedAt: null,
    reviewedByUserId: null,
  } satisfies Prisma.WeeklyCommitmentUncheckedUpdateInput;
}
