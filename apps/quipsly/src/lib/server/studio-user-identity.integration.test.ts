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

  it("rotates a recreated Firebase UID onto the same verified-email user", async () => {
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
        select: { firebaseUid: true, primaryEmail: true },
      }),
    ).resolves.toEqual({
      firebaseUid: `firebase-new-${nonce}`,
      primaryEmail: email,
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
});
