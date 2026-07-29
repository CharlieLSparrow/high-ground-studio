import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

export type AccountDeletionDatabase = PrismaClient | Prisma.TransactionClient;

export type AccountDeletionStorageObject = {
  assetId: string;
  kind: "asset" | "variant";
  provider: string;
  url: string;
};

export type AccountDeletionBlockingCount = {
  category: string;
  count: number;
  reason: string;
};

export type AccountDeletionHomeNest = {
  id: string;
  slug: string;
  activeGrantCount: number;
  otherActiveGrantCount: number;
  exclusiveStorageObjects: AccountDeletionStorageObject[];
  sharedAssetCount: number;
};

export type AccountDeletionInventory = {
  schemaVersion: 1;
  capturedAt: string;
  subject: {
    userId: string;
    primaryEmail: string;
    firebaseUid: string | null;
    // Additive schema-v1 field. Older in-flight receipts contain only
    // firebaseUid; executors treat that value as the fallback singleton.
    firebaseUids?: string[];
    isActive: boolean;
    allEmails: string[];
  };
  homeNests: AccountDeletionHomeNest[];
  blockers: AccountDeletionBlockingCount[];
  eligibleForAutomatedExecution: boolean;
};

type CountDefinition = {
  category: string;
  reason: string;
  read: () => Promise<number>;
};

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export async function buildAccountDeletionInventory(input: {
  userId: string;
  prisma?: AccountDeletionDatabase;
  capturedAt?: Date;
}): Promise<AccountDeletionInventory> {
  const prisma = input.prisma ?? getPrismaClient();
  const subject = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      primaryEmail: true,
      firebaseUid: true,
      isActive: true,
      aliases: { select: { email: true } },
      authIdentities: {
        where: { authority: "firebase:quipsly-reef" },
        select: { subject: true },
      },
    },
  });

  if (!subject) {
    throw new Error("Account deletion subject was not found.");
  }

  const allEmails = unique(
    [subject.primaryEmail, ...subject.aliases.map((alias) => alias.email)]
      .map(normalizedEmail)
      .filter(Boolean),
  );
  const homeNests = await prisma.studioProject.findMany({
    where: {
      sourceLabel: sourceLabelForNestKind("home"),
      accessGrants: {
        some: {
          email: { in: allEmails },
          status: "ACTIVE",
          role: "OWNER",
        },
      },
    },
    select: {
      id: true,
      slug: true,
      accessGrants: {
        where: { status: "ACTIVE" },
        select: { email: true },
      },
      mediaAssets: {
        select: {
          id: true,
          cloudProvider: true,
          url: true,
          variants: { select: { url: true } },
          projects: { select: { id: true } },
        },
      },
    },
  });
  const homeProjectIds = homeNests.map((project) => project.id);

  const countDefinitions: CountDefinition[] = [
    {
      category: "appointments",
      reason:
        "Appointments can be shared operational records and require a reviewed retention or reassignment decision.",
      read: () =>
        prisma.appointment.count({
          where: {
            OR: [
              { clientUserId: subject.id },
              { coachUserId: subject.id },
              { createdByUserId: subject.id },
              { updatedByUserId: subject.id },
            ],
          },
        }),
    },
    {
      category: "coaching-requests",
      reason:
        "Coaching intake can contain contact details and shared scheduling history that must be explicitly deleted or retained.",
      read: () =>
        prisma.coachingRequest.count({
          where: {
            OR: [
              { clientUserId: subject.id },
              { assignedCoachUserId: subject.id },
            ],
          },
        }),
    },
    {
      category: "coaching-bookings",
      reason:
        "Bookings can connect payment, calendar, consent, and session records and cannot be blindly cascaded.",
      read: () =>
        prisma.coachingBooking.count({
          where: {
            OR: [{ clientUserId: subject.id }, { coachUserId: subject.id }],
          },
        }),
    },
    {
      category: "financial-records",
      reason:
        "Payment and Stripe records require an explicit provider-erasure and legally approved retention decision.",
      read: async () =>
        (await prisma.paymentRecord.count({ where: { userId: subject.id } })) +
        (await prisma.stripeCustomerLink.count({
          where: { userId: subject.id },
        })),
    },
    {
      category: "session-participation",
      reason:
        "Shared rooms, participant identity, consent, and recording assets require per-session deletion or retention review.",
      read: async () =>
        (await prisma.callRoom.count({
          where: { createdByUserId: subject.id },
        })) +
        (await prisma.callParticipant.count({
          where: { userId: subject.id },
        })) +
        (await prisma.recordingConsent.count({
          where: { userId: subject.id },
        })) +
        (await prisma.recordingAsset.count({
          where: { participant: { userId: subject.id } },
        })),
    },
    {
      category: "shared-authored-content",
      reason:
        "Transcript corrections, coaching notes, story drafts, and source annotations are user-generated content in shared records.",
      read: async () =>
        (await prisma.transcriptCorrection.count({
          where: {
            OR: [
              { createdByUserId: subject.id },
              { reviewedByUserId: subject.id },
            ],
          },
        })) +
        (await prisma.coachingNote.count({
          where: { authorUserId: subject.id },
        })) +
        (await prisma.storyDraft.count({
          where: {
            OR: [
              { createdByUserId: subject.id },
              { updatedByUserId: subject.id },
              { reviewedByUserId: subject.id },
            ],
          },
        })) +
        (await prisma.studioSourceAnnotation.count({
          where: { createdByUserId: subject.id },
        })) +
        (await prisma.studioSourceAnnotationUse.count({
          where: { createdByUserId: subject.id },
        })) +
        (await prisma.studioPersonalSourceFiling.count({
          where: { createdByUserId: subject.id },
        })),
    },
    {
      category: "shared-work-assignments",
      reason:
        "Assigned tasks and sole ownership of a shared project must be removed or reassigned without deleting other people's work.",
      read: async () =>
        (await prisma.actionItem.count({
          where: {
            assignedUserId: subject.id,
            OR: [
              {
                projectId:
                  homeProjectIds.length > 0
                    ? { notIn: homeProjectIds }
                    : { not: null },
              },
              {
                projectId: null,
                OR: [
                  { roomId: { not: null } },
                  { bookingId: { not: null } },
                  { noteId: { not: null } },
                ],
              },
            ],
          },
        })) +
        (
          await prisma.studioProjectAccessGrant.findMany({
            where: {
              email: { in: allEmails },
              status: "ACTIVE",
              role: "OWNER",
              projectId:
                homeProjectIds.length > 0
                  ? { notIn: homeProjectIds }
                  : undefined,
            },
            select: {
              projectId: true,
              project: {
                select: {
                  accessGrants: {
                    where: {
                      status: "ACTIVE",
                      role: "OWNER",
                    },
                    select: { email: true },
                  },
                },
              },
            },
          })
        ).filter(
          (grant, index, grants) =>
            grants.findIndex(
              (candidate) => candidate.projectId === grant.projectId,
            ) === index &&
            grant.project.accessGrants.every((owner) =>
              allEmails.includes(normalizedEmail(owner.email)),
            ),
        ).length,
    },
    {
      category: "capture-receipts",
      reason:
        "Capture and media-vault receipts can point at immutable recordings and must be reconciled before account removal.",
      read: async () =>
        (await prisma.captureRoomStateReceipt.count({
          where: {
            OR: [
              { actorUserId: subject.id },
              { captureOwnerUserId: subject.id },
            ],
          },
        })) +
        (await prisma.mobileCaptureFinalizationReceipt.count({
          where: {
            OR: [
              { actorUserId: subject.id },
              { releasedByUserId: subject.id },
              { transcriptReleasedByUserId: subject.id },
            ],
          },
        })) +
        (await prisma.mediaVaultUploadReservation.count({
          where: {
            OR: [
              { actorUserId: subject.id },
              { actorEmail: { in: allEmails } },
            ],
          },
        })),
    },
    {
      category: "legacy-owner-email-records",
      reason:
        "Legacy manuscript, content-project, HGO projection, and edit records use email ownership and need explicit export/deletion handling.",
      read: async () =>
        (await prisma.studioManuscript.count({
          where: { ownerEmail: { in: allEmails } },
        })) +
        (await prisma.studioContentWorkspaceSnapshot.count({
          where: { ownerEmail: { in: allEmails } },
        })) +
        (await prisma.studioContentProject.count({
          where: { ownerEmail: { in: allEmails } },
        })) +
        (await prisma.hgoStagedProjectionArtifact.count({
          where: {
            OR: [
              { ownerUserId: subject.id },
              { ownerEmail: { in: allEmails } },
            ],
          },
        })) +
        (await prisma.hgoEpisodePublishCandidate.count({
          where: {
            OR: [
              { ownerUserId: subject.id },
              { ownerEmail: { in: allEmails } },
            ],
          },
        })),
    },
    {
      category: "commerce-and-support-records",
      reason:
        "Commerce, organization, support, and feedback records need an explicit retention decision instead of a silent cascade.",
      read: async () =>
        (await prisma.worldHubCart.count({
          where: {
            OR: [{ ownerUserId: subject.id }, { email: { in: allEmails } }],
          },
        })) +
        (await prisma.organizationMember.count({
          where: { userId: subject.id },
        })) +
        (await prisma.companySupportRequest.count({
          where: { userId: subject.id },
        })) +
        (await prisma.feedbackTicket.count({
          where: { userId: subject.id },
        })),
    },
  ];

  const counts = await Promise.all(
    countDefinitions.map(async (definition) => ({
      category: definition.category,
      reason: definition.reason,
      count: await definition.read(),
    })),
  );
  const blockers = counts.filter((entry) => entry.count > 0);
  const projectedHomeNests = homeNests.map((project) => {
    const otherActiveGrantCount = project.accessGrants.filter(
      (grant) => !allEmails.includes(normalizedEmail(grant.email)),
    ).length;
    const exclusiveAssets = project.mediaAssets.filter(
      (asset) =>
        asset.projects.length === 1 && asset.projects[0]?.id === project.id,
    );
    const exclusiveStorageObjects = exclusiveAssets.flatMap((asset) => [
      {
        assetId: asset.id,
        kind: "asset" as const,
        provider: asset.cloudProvider,
        url: asset.url,
      },
      ...asset.variants.map((variant) => ({
        assetId: asset.id,
        kind: "variant" as const,
        provider: asset.cloudProvider,
        url: variant.url,
      })),
    ]);

    return {
      id: project.id,
      slug: project.slug,
      activeGrantCount: project.accessGrants.length,
      otherActiveGrantCount,
      exclusiveStorageObjects,
      sharedAssetCount: project.mediaAssets.length - exclusiveAssets.length,
    };
  });

  for (const project of projectedHomeNests) {
    if (project.otherActiveGrantCount > 0) {
      blockers.push({
        category: "home-nest-collaborators",
        count: project.otherActiveGrantCount,
        reason:
          "A Home Nest has another active grant, so deleting the project could remove another person's accessible work.",
      });
    }
    if (project.sharedAssetCount > 0) {
      blockers.push({
        category: "shared-home-assets",
        count: project.sharedAssetCount,
        reason:
          "A Home Nest references media also used by another project; those bytes require explicit ownership review.",
      });
    }
    const unsupportedStorageCount = project.exclusiveStorageObjects.filter(
      (object) => object.provider.trim().toLowerCase() !== "gcs",
    ).length;
    if (unsupportedStorageCount > 0) {
      blockers.push({
        category: "unsupported-home-storage",
        count: unsupportedStorageCount,
        reason:
          "A Home Nest has stored media outside the executor's verified GCS deletion adapter.",
      });
    }
  }

  return {
    schemaVersion: 1,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    subject: {
      userId: subject.id,
      primaryEmail: normalizedEmail(subject.primaryEmail),
      firebaseUid: subject.firebaseUid,
      firebaseUids: unique(
        [
          subject.firebaseUid,
          ...subject.authIdentities.map((identity) => identity.subject),
        ].filter((value): value is string => Boolean(value)),
      ),
      isActive: subject.isActive,
      allEmails,
    },
    homeNests: projectedHomeNests,
    blockers,
    eligibleForAutomatedExecution: blockers.length === 0,
  };
}

export function explainAccountDeletionBlockers(
  inventory: AccountDeletionInventory,
) {
  return inventory.blockers.map(
    (blocker) =>
      `${blocker.category}: ${blocker.count} record${
        blocker.count === 1 ? "" : "s"
      }. ${blocker.reason}`,
  );
}
