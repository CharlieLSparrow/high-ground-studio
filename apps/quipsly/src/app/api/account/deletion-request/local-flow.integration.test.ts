/** @jest-environment node */

jest.mock("@/lib/server/account-deletion-external", () => ({
  createAccountDeletionExternalServices: jest.fn(),
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { executeAccountDeletion } from "@/lib/server/account-deletion-executor";
import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";

const runLocalFlow =
  process.env.QUIPSLY_LOCAL_ACCOUNT_DELETION_SMOKE === "1"
    ? describe
    : describe.skip;

if (process.env.QUIPSLY_LOCAL_ACCOUNT_DELETION_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the local account deletion smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

type JsonRecord = Record<string, unknown>;

async function responseJson(response: Response, label: string) {
  const text = await response.text();
  let body: JsonRecord;
  try {
    body = JSON.parse(text) as JsonRecord;
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(
      `${label} returned HTTP ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  return body;
}

function stringField(body: JsonRecord, key: string, label: string) {
  const value = body[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} did not return ${key}.`);
  }
  return value;
}

runLocalFlow("local account deletion operating loop", () => {
  jest.setTimeout(60_000);

  afterAll(async () => {
    await getPrismaClient().$disconnect();
  });

  it("creates, reviews, executes, recovers, and receipts one disposable account deletion", async () => {
    const nestOrigin =
      process.env.QUIPSLY_LOCAL_NEST_URL ?? "http://127.0.0.1:3012";
    const authOrigin =
      process.env.QUIPSLY_LOCAL_FIREBASE_AUTH_URL ?? "http://127.0.0.1:9099";
    const firebaseProject =
      process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT ?? "quipsly-reef";
    const firebaseApiKey =
      process.env.QUIPSLY_LOCAL_FIREBASE_API_KEY ?? "local-emulator-key";
    const identityToolkit = `${authOrigin}/identitytoolkit.googleapis.com`;
    const nonce = randomUUID().replaceAll("-", "").slice(0, 16);
    const email = `quipsly-deletion-${nonce}@example.test`;
    const password = `Local-only-${nonce}!`;
    const expectedHomeSlug = `home-${email.replace("@", "-at-").replace(".", "-")}`;
    const prisma = getPrismaClient();
    let idToken = "";
    let firebaseIdentityDeleted = false;
    let deletionRequestId = "";
    let disposableHomeNestId = "";
    let disabledFirebaseUid: string | null = null;
    let confirmationAttempts = 0;

    const firebasePost = async (
      route: string,
      payload: JsonRecord,
      label: string,
    ) =>
      responseJson(
        await fetch(
          `${identityToolkit}/v1/${route}?key=${encodeURIComponent(firebaseApiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        ),
        label,
      );

    const authenticatedRequest = async (
      method: "GET" | "POST",
      body?: JsonRecord,
    ) =>
      fetch(`${nestOrigin}/api/account/deletion-request`, {
        method,
        headers: {
          authorization: `Bearer ${idToken}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    try {
      const signUp = await firebasePost(
        "accounts:signUp",
        { email, password, returnSecureToken: true },
        "Firebase sign-up",
      );
      idToken = stringField(signUp, "idToken", "Firebase sign-up");

      await firebasePost(
        "accounts:sendOobCode",
        { requestType: "VERIFY_EMAIL", idToken },
        "Firebase verification request",
      );
      const oobBody = await responseJson(
        await fetch(
          `${authOrigin}/emulator/v1/projects/${encodeURIComponent(firebaseProject)}/oobCodes`,
        ),
        "Firebase emulator OOB lookup",
      );
      const verification = (
        Array.isArray(oobBody.oobCodes) ? oobBody.oobCodes : []
      ).find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as JsonRecord).email === email &&
          (entry as JsonRecord).requestType === "VERIFY_EMAIL",
      ) as JsonRecord | undefined;
      if (!verification) {
        throw new Error(
          "Firebase emulator did not return the verification code.",
        );
      }
      await firebasePost(
        "accounts:update",
        {
          oobCode: stringField(verification, "oobCode", "Verification lookup"),
        },
        "Firebase email verification",
      );
      const signIn = await firebasePost(
        "accounts:signInWithPassword",
        { email, password, returnSecureToken: true },
        "Firebase verified sign-in",
      );
      idToken = stringField(signIn, "idToken", "Firebase verified sign-in");

      const created = await responseJson(
        await authenticatedRequest("POST", {
          reason: "Disposable local account-deletion proof",
          source: "local-integration-smoke",
          appSurface: "HighGroundCapture",
        }),
        "Deletion request creation",
      );
      expect(created).toMatchObject({
        ok: true,
        request: {
          status: "REQUESTED",
          statusLabel: "Request received",
          active: true,
          reusedExistingRequest: false,
        },
        policy: { targetDays: 30 },
      });
      const requestId = stringField(
        created.request as JsonRecord,
        "id",
        "Deletion request creation",
      );
      deletionRequestId = requestId;

      const reopened = await responseJson(
        await authenticatedRequest("GET"),
        "Deletion request reopen",
      );
      expect(reopened).toMatchObject({
        request: { id: requestId, status: "REQUESTED" },
      });

      const replay = await responseJson(
        await authenticatedRequest("POST", {
          reason: "This retry must converge",
          source: "local-integration-smoke",
        }),
        "Deletion request retry",
      );
      expect(replay).toMatchObject({
        request: { id: requestId, reusedExistingRequest: true },
      });

      await prisma.userAccountDeletionRequest.update({
        where: { id: requestId },
        data: { status: "REVIEWING", reviewedAt: new Date() },
      });
      const reviewing = await responseJson(
        await authenticatedRequest("GET"),
        "Deletion review status",
      );
      expect(reviewing).toMatchObject({
        request: {
          id: requestId,
          status: "REVIEWING",
          statusLabel: "Review in progress",
          active: true,
        },
      });

      await expect(
        prisma.userAccountDeletionRequest.update({
          where: { id: requestId },
          data: { status: "COMPLETED", completedAt: new Date() },
        }),
      ).rejects.toThrow();

      const subject = await prisma.user.findUniqueOrThrow({
        where: { primaryEmail: email },
        select: { id: true, firebaseUid: true },
      });
      const starter = await ensureQuipslyStarterStateForUser({
        userId: subject.id,
        email,
        prisma,
      });
      const homeNest = starter.homeNest;
      disposableHomeNestId = homeNest.id;
      expect(homeNest.slug).toBe(expectedHomeSlug);
      const [personalTask, homeTask] = await Promise.all([
        prisma.actionItem.create({
          data: {
            assignedUserId: subject.id,
            title: "Disposable personal task",
          },
        }),
        prisma.actionItem.create({
          data: {
            assignedUserId: subject.id,
            projectId: homeNest.id,
            title: "Disposable Home Nest task",
          },
        }),
      ]);
      await prisma.userAccountDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: "READY_FOR_DELETION",
          reviewedAt: new Date(),
        },
      });

      const plan = {
        schemaVersion: 1 as const,
        requestId,
        approvedByUserId: subject.id,
        approvedAt: new Date().toISOString(),
        confirmation: `DELETE ${requestId}`,
        exportDisposition: "not-requested" as const,
        scope: "automated-empty-or-private-account" as const,
      };
      const external = {
        async disableFirebaseIdentity(firebaseUid: string | null) {
          disabledFirebaseUid = firebaseUid;
        },
        async deleteFirebaseIdentity() {
          await firebasePost(
            "accounts:delete",
            { idToken },
            "Firebase executor identity deletion",
          );
          firebaseIdentityDeleted = true;
        },
        async deleteStorageObject() {
          throw new Error(
            "Disposable Home Nest unexpectedly referenced a storage object.",
          );
        },
        async sendCompletionConfirmation() {
          confirmationAttempts += 1;
          if (confirmationAttempts === 1) {
            throw new Error("Simulated confirmation-provider interruption.");
          }
        },
      };

      await expect(
        executeAccountDeletion({
          requestId,
          plan,
          prisma,
          external,
          allowExecutionWithoutEnvironmentGate: true,
        }),
      ).rejects.toThrow("Simulated confirmation-provider interruption.");

      await expect(
        prisma.userAccountDeletionRequest.findUnique({
          where: { id: requestId },
          select: { userId: true, status: true, lastFailureJson: true },
        }),
      ).resolves.toMatchObject({
        userId: null,
        status: "FAILED",
        lastFailureJson: {
          code: "ACCOUNT_DELETION_EXECUTION_FAILED",
        },
      });
      await expect(
        prisma.user.count({ where: { id: subject.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.studioProject.count({ where: { id: homeNest.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.actionItem.count({
          where: { id: { in: [personalTask.id, homeTask.id] } },
        }),
      ).resolves.toBe(0);
      expect(disabledFirebaseUid).toBe(subject.firebaseUid);

      const retryPlan = {
        ...plan,
        approvedAt: new Date(
          new Date(plan.approvedAt).getTime() + 1_000,
        ).toISOString(),
      };
      const receipt = await executeAccountDeletion({
        requestId,
        plan: retryPlan,
        prisma,
        external,
        allowExecutionWithoutEnvironmentGate: true,
      });
      expect(receipt).toMatchObject({
        outcome: "completed",
        requestId,
        deletedHomeNestCount: 1,
        retainedCategories: [],
        confirmation: "sent",
      });
      expect(confirmationAttempts).toBe(2);

      const replayReceipt = await executeAccountDeletion({
        requestId,
        plan: retryPlan,
        prisma,
        external,
        allowExecutionWithoutEnvironmentGate: true,
      });
      expect(replayReceipt).toEqual(receipt);
      expect(confirmationAttempts).toBe(2);

      await expect(
        prisma.userAccountDeletionRequest.findUnique({
          where: { id: requestId },
          select: {
            userId: true,
            emailSnapshot: true,
            status: true,
            completedAt: true,
            executionReceiptJson: true,
            executions: {
              select: { status: true, receiptJson: true },
            },
          },
        }),
      ).resolves.toMatchObject({
        userId: null,
        emailSnapshot: null,
        status: "COMPLETED",
        completedAt: expect.any(Date),
        executionReceiptJson: {
          outcome: "completed",
          requestId,
        },
        executions: [
          {
            status: "SUCCEEDED",
            receiptJson: { outcome: "completed", requestId },
          },
        ],
      });

      const signedOutAfterDeletion = await authenticatedRequest("GET");
      expect(signedOutAfterDeletion.status).toBe(401);
    } finally {
      if (idToken && !firebaseIdentityDeleted) {
        await firebasePost(
          "accounts:delete",
          { idToken },
          "Firebase disposable identity cleanup",
        );
        firebaseIdentityDeleted = true;
      }

      const user = await prisma.user.findUnique({
        where: { primaryEmail: email },
        select: { id: true },
      });
      const homeProject = await prisma.studioProject.findFirst({
        where: {
          OR: [
            ...(disposableHomeNestId
              ? [{ id: disposableHomeNestId }]
              : []),
            {
              slug: expectedHomeSlug,
              sourceLabel: "nest-kind:home",
            },
          ],
        },
        select: { id: true },
      });
      await prisma.$transaction(async (tx) => {
        if (deletionRequestId) {
          await tx.userAccountDeletionRequest.deleteMany({
            where: { id: deletionRequestId },
          });
        }
        await tx.studioProjectAccessGrant.deleteMany({ where: { email } });
        if (homeProject) {
          await tx.studioProject.delete({ where: { id: homeProject.id } });
        }
        if (user) {
          await tx.user.delete({ where: { id: user.id } });
        }
      });
      await expect(
        prisma.user.count({ where: { primaryEmail: email } }),
      ).resolves.toBe(0);
    }
  });

  it("refuses to automate deletion when a Home Nest has another collaborator", async () => {
    const prisma = getPrismaClient();
    const email = `quipsly-deletion-blocked-${randomUUID()}@example.test`;
    const collaboratorEmail = `quipsly-collaborator-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        primaryEmail: email,
        firebaseUid: `firebase-blocked-${randomUUID()}`,
        emailVerified: new Date(),
      },
    });
    const starter = await ensureQuipslyStarterStateForUser({
      userId: user.id,
      email,
      prisma,
    });
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId: starter.homeNest.id,
        email: collaboratorEmail,
        role: "VIEWER",
        status: "ACTIVE",
      },
    });
    const deletionRequest = await prisma.userAccountDeletionRequest.create({
      data: {
        userId: user.id,
        emailSnapshot: email,
        status: "READY_FOR_DELETION",
        reviewedAt: new Date(),
        source: "local-blocker-proof",
      },
    });
    const external = {
      disableFirebaseIdentity: jest.fn(),
      deleteFirebaseIdentity: jest.fn(),
      deleteStorageObject: jest.fn(),
      sendCompletionConfirmation: jest.fn(),
    };

    try {
      await expect(
        executeAccountDeletion({
          requestId: deletionRequest.id,
          plan: {
            schemaVersion: 1,
            requestId: deletionRequest.id,
            approvedByUserId: user.id,
            approvedAt: new Date().toISOString(),
            confirmation: `DELETE ${deletionRequest.id}`,
            exportDisposition: "not-requested",
            scope: "automated-empty-or-private-account",
          },
          prisma,
          external,
          allowExecutionWithoutEnvironmentGate: true,
        }),
      ).rejects.toThrow("home-nest-collaborators");

      await expect(
        prisma.user.findUnique({
          where: { id: user.id },
          select: { isActive: true },
        }),
      ).resolves.toEqual({ isActive: true });
      await expect(
        prisma.studioProject.count({
          where: { id: starter.homeNest.id },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.userAccountDeletionExecution.count({
          where: { requestId: deletionRequest.id },
        }),
      ).resolves.toBe(0);
      expect(external.disableFirebaseIdentity).not.toHaveBeenCalled();
    } finally {
      await prisma.userAccountDeletionRequest.deleteMany({
        where: { id: deletionRequest.id },
      });
      await prisma.studioProjectAccessGrant.deleteMany({
        where: { projectId: starter.homeNest.id },
      });
      await prisma.studioProject.deleteMany({
        where: { id: starter.homeNest.id },
      });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
