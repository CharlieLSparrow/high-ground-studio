export type StudioCutFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
};

export type StudioCutRuntimeConfig = {
  projectId: string;
  branchId: string;
  createdBy: string;
  allowedEmails: string[];
  isDev: boolean;
  isProduction: boolean;
  firebaseConfig?: StudioCutFirebaseConfig;
};

const DEFAULT_PROJECT_ID = "studio-cut-local-project";
const DEFAULT_BRANCH_ID = "local-main";
const DEFAULT_CREATED_BY = "local-web-editor";

export function getStudioCutRuntimeConfig(): StudioCutRuntimeConfig {
  const firebaseConfig = getFirebaseConfig();

  return {
    projectId: getEnvValue("VITE_STUDIO_CUT_PROJECT_ID") || DEFAULT_PROJECT_ID,
    branchId: getEnvValue("VITE_STUDIO_CUT_BRANCH_ID") || DEFAULT_BRANCH_ID,
    createdBy: getEnvValue("VITE_STUDIO_CUT_CREATED_BY") || DEFAULT_CREATED_BY,
    allowedEmails: getAllowedEmails(),
    isDev: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
    ...(firebaseConfig ? { firebaseConfig } : {}),
  };
}

function getFirebaseConfig(): StudioCutFirebaseConfig | undefined {
  const apiKey = getEnvValue("VITE_FIREBASE_API_KEY");
  const authDomain = getEnvValue("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = getEnvValue("VITE_FIREBASE_PROJECT_ID");
  const appId = getEnvValue("VITE_FIREBASE_APP_ID");

  if (!apiKey || !authDomain || !projectId || !appId) {
    return undefined;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: getEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
  };
}

function getAllowedEmails() {
  return (getEnvValue("VITE_STUDIO_CUT_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getEnvValue(key: string) {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
