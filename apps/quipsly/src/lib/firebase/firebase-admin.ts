import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { resolveFirebaseCustomTokenServiceAccount } from './firebase-custom-token-signer';

type FirebaseAdminCredentialSource =
  | "service-account-json-env"
  | "service-account-pieces-env"
  | "application-default";

type FirebaseServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FirebaseAdminRuntimeInfo = {
  projectId: string | null;
  customTokenServiceAccountId: string | null;
  credentialSource: FirebaseAdminCredentialSource;
  credentialEnvName: string | null;
  explicitProjectId: boolean;
  hasServiceAccountEmail: boolean;
};

function configured(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseInlineCredentialJson(rawValue: string, envName: string): FirebaseServiceAccountJson {
  const trimmed = rawValue.trim();
  const candidates = [trimmed];

  if (!trimmed.startsWith("{")) {
    candidates.push(Buffer.from(trimmed, "base64").toString("utf8"));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as FirebaseServiceAccountJson;
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch {
      // Try the next representation before failing with a sanitized message.
    }
  }

  throw new Error(`${envName} is present but is not valid Firebase service-account JSON.`);
}

function inlineCredentialJsonFromEnv() {
  const envNames = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    "GCP_SERVICE_ACCOUNT_JSON",
  ];

  for (const envName of envNames) {
    const value = process.env[envName];
    if (configured(value)) {
      return {
        envName,
        serviceAccount: parseInlineCredentialJson(value, envName),
      };
    }
  }

  return null;
}

function resolveFirebaseAdminCredential() {
  const inlineJson = inlineCredentialJsonFromEnv();
  const explicitProjectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    null;

  if (inlineJson) {
    const projectId = explicitProjectId || inlineJson.serviceAccount.project_id || null;
    return {
      credential: cert({
        projectId: projectId || undefined,
        clientEmail: inlineJson.serviceAccount.client_email,
        privateKey: inlineJson.serviceAccount.private_key?.replace(/\\n/g, "\n"),
      }),
      runtimeInfo: {
        projectId,
        credentialSource: "service-account-json-env" as const,
        credentialEnvName: inlineJson.envName,
        explicitProjectId: Boolean(explicitProjectId),
        hasServiceAccountEmail: Boolean(inlineJson.serviceAccount.client_email),
      },
    };
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (configured(clientEmail) && configured(privateKey)) {
    const projectId = explicitProjectId;
    return {
      credential: cert({
        projectId: projectId || undefined,
        clientEmail,
        privateKey,
      }),
      runtimeInfo: {
        projectId,
        credentialSource: "service-account-pieces-env" as const,
        credentialEnvName: "FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY",
        explicitProjectId: Boolean(explicitProjectId),
        hasServiceAccountEmail: true,
      },
    };
  }

  return {
    credential: applicationDefault(),
    runtimeInfo: {
      projectId: explicitProjectId,
      credentialSource: "application-default" as const,
      credentialEnvName: configured(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        ? "GOOGLE_APPLICATION_CREDENTIALS"
        : null,
      explicitProjectId: Boolean(explicitProjectId),
      hasServiceAccountEmail: false,
    },
  };
}

const resolvedAdminCredential = resolveFirebaseAdminCredential();
const customTokenServiceAccountId =
  resolveFirebaseCustomTokenServiceAccount();

const initAdmin = () => {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    projectId: resolvedAdminCredential.runtimeInfo.projectId || undefined,
    credential: resolvedAdminCredential.credential,
    serviceAccountId: customTokenServiceAccountId || undefined,
  });
};

const app = initAdmin();
export const firebaseAdminRuntimeInfo: FirebaseAdminRuntimeInfo = {
  ...resolvedAdminCredential.runtimeInfo,
  customTokenServiceAccountId,
};
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
