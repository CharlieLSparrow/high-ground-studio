/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { ensureStudioUserFromFirebaseIdentity } from "./studio-user-identity";

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the identity reconciliation smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Firebase identity reconciliation local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("binds a recreated Firebase UID without overwriting the legacy compatibility UID", async () => {
    const email = `firebase-recovery-${nonce}@example.test`;
    const original = await prisma.user.create({
      data: {
        primaryEmail: email,
        firebaseUid: `firebase-old-${nonce}`,
        emailVerified: new Date(),
      },
    });
    userIds.push(original.id);

    const identity = await ensureStudioUserFromFirebaseIdentity({
      firebaseUid: `firebase-new-${nonce}`,
      email,
      emailVerified: true,
      name: "Recovered person",
    });

    expect(identity.id).toBe(original.id);
    await expect(
      prisma.user.findUnique({
        where: { id: original.id },
        select: {
          firebaseUid: true,
          primaryEmail: true,
          authIdentities: {
            select: { authority: true, subject: true },
          },
        },
      }),
    ).resolves.toEqual({
      firebaseUid: `firebase-old-${nonce}`,
      primaryEmail: email,
      authIdentities: [
        {
          authority: "firebase:quipsly-reef",
          subject: `firebase-new-${nonce}`,
        },
      ],
    });
  });

  it("binds two verified Firebase subjects to one person through primary and alias emails", async () => {
    const primaryEmail = `firebase-primary-${nonce}@example.test`;
    const aliasEmail = `firebase-alias-${nonce}@example.test`;
    const user = await prisma.user.create({
      data: {
        primaryEmail,
        emailVerified: new Date(),
        aliases: {
          create: {
            email: aliasEmail,
            label: "recovery",
          },
        },
      },
    });
    userIds.push(user.id);

    const primaryIdentity = await ensureStudioUserFromFirebaseIdentity({
      firebaseUid: `firebase-primary-${nonce}`,
      email: primaryEmail,
      emailVerified: true,
      provider: "google.com",
    });
    const aliasIdentity = await ensureStudioUserFromFirebaseIdentity({
      firebaseUid: `firebase-alias-${nonce}`,
      email: aliasEmail,
      emailVerified: true,
      provider: "google.com",
    });
    const nativeHandoffIdentity = await ensureStudioUserFromFirebaseIdentity({
      firebaseUid: `firebase-primary-${nonce}`,
      email: primaryEmail,
      emailVerified: true,
      provider: "custom",
    });

    expect(primaryIdentity.id).toBe(user.id);
    expect(aliasIdentity.id).toBe(user.id);
    expect(nativeHandoffIdentity.id).toBe(user.id);
    await expect(
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          firebaseUid: true,
          authIdentities: {
            orderBy: { subject: "asc" },
            select: {
              authority: true,
              subject: true,
              provider: true,
              emailAtLink: true,
            },
          },
        },
      }),
    ).resolves.toEqual({
      firebaseUid: `firebase-primary-${nonce}`,
      authIdentities: [
        {
          authority: "firebase:quipsly-reef",
          subject: `firebase-alias-${nonce}`,
          provider: "google.com",
          emailAtLink: aliasEmail,
        },
        {
          authority: "firebase:quipsly-reef",
          subject: `firebase-primary-${nonce}`,
          provider: "google.com",
          emailAtLink: primaryEmail,
        },
      ],
    });
  });

  it("rejects a UID already bound to a different verified-email user", async () => {
    const claimedUid = `firebase-collision-${nonce}`;
    const uidOwner = await prisma.user.create({
      data: {
        primaryEmail: `firebase-uid-owner-${nonce}@example.test`,
        firebaseUid: claimedUid,
        emailVerified: new Date(),
      },
    });
    const emailOwner = await prisma.user.create({
      data: {
        primaryEmail: `firebase-email-owner-${nonce}@example.test`,
        firebaseUid: `firebase-email-owner-${nonce}`,
        emailVerified: new Date(),
      },
    });
    userIds.push(uidOwner.id, emailOwner.id);

    await expect(
      ensureStudioUserFromFirebaseIdentity({
        firebaseUid: claimedUid,
        email: emailOwner.primaryEmail,
        emailVerified: true,
      }),
    ).rejects.toThrow(
      "Firebase identity collision: uid and email resolve to different Quipsly users.",
    );

    await expect(
      prisma.user.findUnique({
        where: { id: emailOwner.id },
        select: { firebaseUid: true },
      }),
    ).resolves.toEqual({ firebaseUid: `firebase-email-owner-${nonce}` });
  });

  it("refuses to reconcile an unverified mailbox", async () => {
    await expect(
      ensureStudioUserFromFirebaseIdentity({
        firebaseUid: `firebase-unverified-${nonce}`,
        email: `firebase-unverified-${nonce}@example.test`,
        emailVerified: false,
      }),
    ).rejects.toThrow("Firebase identity requires a verified email.");
  });

  it("does not resurrect an inactive Quipsly account from a valid Firebase identity", async () => {
    const email = `firebase-inactive-${nonce}@example.test`;
    const inactive = await prisma.user.create({
      data: {
        primaryEmail: email,
        firebaseUid: `firebase-inactive-${nonce}`,
        emailVerified: new Date(),
        isActive: false,
      },
    });
    userIds.push(inactive.id);

    await expect(
      ensureStudioUserFromFirebaseIdentity({
        firebaseUid: `firebase-inactive-${nonce}`,
        email,
        emailVerified: true,
      }),
    ).rejects.toThrow("Quipsly account is inactive.");

    await expect(
      prisma.user.findUnique({
        where: { id: inactive.id },
        select: { isActive: true, firebaseUid: true },
      }),
    ).resolves.toEqual({
      isActive: false,
      firebaseUid: `firebase-inactive-${nonce}`,
    });
  });
});
