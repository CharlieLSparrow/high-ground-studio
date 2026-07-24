import "server-only";

import { Storage } from "@google-cloud/storage";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import type { AccountDeletionStorageObject } from "@/lib/server/account-deletion-inventory";

export type AccountDeletionExternalServices = {
  disableFirebaseIdentity(firebaseUid: string | null): Promise<void>;
  deleteFirebaseIdentity(firebaseUid: string | null): Promise<void>;
  deleteStorageObject(object: AccountDeletionStorageObject): Promise<void>;
  sendCompletionConfirmation(input: {
    email: string;
    requestId: string;
    idempotencyKey: string;
  }): Promise<void>;
};

type FirebaseAdminError = {
  code?: string;
};

function firebaseUserMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as FirebaseAdminError).code === "auth/user-not-found"
  );
}

export type GcsObjectLocation = {
  bucket: string;
  objectPath: string;
};

export function parseGcsObjectLocation(
  reference: AccountDeletionStorageObject,
): GcsObjectLocation {
  if (reference.provider.trim().toLowerCase() !== "gcs") {
    throw new Error(
      `Unsupported account-deletion storage provider: ${reference.provider}.`,
    );
  }

  if (reference.url.startsWith("gs://")) {
    const withoutScheme = reference.url.slice("gs://".length);
    const separator = withoutScheme.indexOf("/");
    if (separator <= 0 || separator === withoutScheme.length - 1) {
      throw new Error(
        "GCS deletion reference is missing a bucket or object path.",
      );
    }
    return {
      bucket: withoutScheme.slice(0, separator),
      objectPath: withoutScheme.slice(separator + 1),
    };
  }

  const parsed = new URL(reference.url);
  if (parsed.protocol !== "https:") {
    throw new Error("GCS deletion reference must use gs:// or https://.");
  }

  if (parsed.hostname === "storage.googleapis.com") {
    const [bucket, ...path] = parsed.pathname.split("/").filter(Boolean);
    if (!bucket || path.length === 0) {
      throw new Error("GCS deletion URL is missing a bucket or object path.");
    }
    return {
      bucket,
      objectPath: decodeURIComponent(path.join("/")),
    };
  }

  const suffix = ".storage.googleapis.com";
  if (parsed.hostname.endsWith(suffix)) {
    const bucket = parsed.hostname.slice(0, -suffix.length);
    const objectPath = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).join("/"),
    );
    if (!bucket || !objectPath) {
      throw new Error("GCS deletion URL is missing a bucket or object path.");
    }
    return { bucket, objectPath };
  }

  throw new Error(
    "GCS deletion URL does not use a recognized Google Storage host.",
  );
}

async function sendCompletionConfirmation(input: {
  email: string;
  requestId: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.HGO_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error(
      "Account deletion confirmation email is not configured. RESEND_API_KEY and HGO_EMAIL_FROM are required.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your Quipsly account deletion is complete",
      text: [
        "Your Quipsly account access and eligible account data have been deleted.",
        "",
        `Request ID: ${input.requestId}`,
        "",
        "If Quipsly was legally required to retain an anonymized record, that exception was reviewed before execution and is not an active account.",
        "",
        "Questions: charlie@highgroundodyssey.com",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Account deletion confirmation provider returned HTTP ${response.status}.`,
    );
  }
}

export function createAccountDeletionExternalServices(): AccountDeletionExternalServices {
  const storage = new Storage();

  return {
    async disableFirebaseIdentity(firebaseUid) {
      if (!firebaseUid) return;
      try {
        await adminAuth.updateUser(firebaseUid, { disabled: true });
        await adminAuth.revokeRefreshTokens(firebaseUid);
      } catch (error) {
        if (!firebaseUserMissing(error)) throw error;
      }
    },
    async deleteFirebaseIdentity(firebaseUid) {
      if (!firebaseUid) return;
      try {
        await adminAuth.deleteUser(firebaseUid);
      } catch (error) {
        if (!firebaseUserMissing(error)) throw error;
      }
    },
    async deleteStorageObject(object) {
      const location = parseGcsObjectLocation(object);
      await storage
        .bucket(location.bucket)
        .file(location.objectPath)
        .delete({ ignoreNotFound: true });
    },
    sendCompletionConfirmation,
  };
}
