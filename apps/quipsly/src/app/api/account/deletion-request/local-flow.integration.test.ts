/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

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

  it("creates, reopens, advances, and confirms one disposable request", async () => {
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

      const completedAt = new Date();
      await prisma.userAccountDeletionRequest.update({
        where: { id: requestId },
        data: { status: "COMPLETED", completedAt },
      });
      const completed = await responseJson(
        await authenticatedRequest("GET"),
        "Deletion completion status",
      );
      expect(completed).toMatchObject({
        request: {
          id: requestId,
          status: "COMPLETED",
          statusLabel: "Deletion completed",
          completedAt: completedAt.toISOString(),
          active: false,
        },
      });
      expect(String(completed.nextAction)).toContain("completion confirmation");
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
          slug: expectedHomeSlug,
          sourceLabel: "nest-kind:home",
        },
        select: { id: true },
      });
      await prisma.$transaction(async (tx) => {
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
});
