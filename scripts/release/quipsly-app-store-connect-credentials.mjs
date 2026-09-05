import os from "node:os";
import path from "node:path";

export const DEFAULT_APP_STORE_CONNECT_API_KEY_PATH = path.join(
  os.homedir(),
  ".config/quipsly/credentials/app-store-connect/quipsly-release-automation.json",
);

export function appStoreConnectReadCredentialPath(environment = process.env) {
  const configured = String(
    environment.APP_STORE_CONNECT_API_KEY_PATH || "",
  ).trim();
  return configured || DEFAULT_APP_STORE_CONNECT_API_KEY_PATH;
}
