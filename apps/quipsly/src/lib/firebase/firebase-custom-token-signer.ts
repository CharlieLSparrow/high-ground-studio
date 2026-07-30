const SERVICE_ACCOUNT_SUFFIX = ".iam.gserviceaccount.com";

function configured(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveFirebaseCustomTokenServiceAccount(
  env: Record<string, string | undefined> = process.env,
) {
  const configuredSigner = env.FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT;
  if (!configured(configuredSigner)) return null;

  const signer = configuredSigner.trim().toLowerCase();
  const firebaseProjectId = (
    env.FIREBASE_PROJECT_ID
    || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || ""
  ).trim().toLowerCase();

  if (!firebaseProjectId) {
    throw new Error(
      "FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT requires FIREBASE_PROJECT_ID.",
    );
  }

  const expectedSuffix = `@${firebaseProjectId}${SERVICE_ACCOUNT_SUFFIX}`;
  if (!signer.endsWith(expectedSuffix)) {
    throw new Error(
      "FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT must belong to FIREBASE_PROJECT_ID.",
    );
  }

  return signer;
}
