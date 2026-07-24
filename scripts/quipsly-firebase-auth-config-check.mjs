#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const firebaseProject = process.env.FIREBASE_PROJECT_ID || "quipsly-reef";
const quotaProject = process.env.GOOGLE_CLOUD_QUOTA_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "high-ground-odyssey";
const googleAuthPlatformProject =
  process.env.QUIPSLY_GOOGLE_AUTH_PLATFORM_PROJECT || quotaProject;
const requiredAuthorizedDomains = (process.env.QUIPSLY_FIREBASE_REQUIRED_DOMAINS || "nest.quipsly.com")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);
const requiredGoogleRedirectUri =
  process.env.QUIPSLY_FIREBASE_GOOGLE_REDIRECT_URI
  || `https://${firebaseProject}.firebaseapp.com/__/auth/handler`;

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function accessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function identityToolkitGet(path, token) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-goog-user-project": quotaProject,
    },
  });
  const body = await response.json();
  return { response, body };
}

try {
  const token = accessToken();
  const projectConfig = await identityToolkitGet(`projects/${firebaseProject}/config`, token);
  if (!projectConfig.response.ok) {
    printJson({
      ok: false,
      phase: "project-config",
      firebaseProject,
      quotaProject,
      status: projectConfig.response.status,
      error: projectConfig.body?.error?.message || "unknown",
    });
    process.exit(1);
  }

  const authorizedDomains = Array.isArray(projectConfig.body.authorizedDomains)
    ? projectConfig.body.authorizedDomains
    : [];
  const missingAuthorizedDomains = requiredAuthorizedDomains.filter(
    (domain) => !authorizedDomains.includes(domain),
  );

  const googleProvider = await identityToolkitGet(
    `projects/${firebaseProject}/defaultSupportedIdpConfigs/google.com`,
    token,
  );
  const googleProviderExists = googleProvider.response.ok;
  const googleProviderEnabled = googleProviderExists && googleProvider.body.enabled === true;
  const googleProviderClientIdSet = googleProviderExists && Boolean(googleProvider.body.clientId);
  const googleProviderClientSecretSet = googleProviderExists && Boolean(googleProvider.body.clientSecret);

  printJson({
    ok:
      missingAuthorizedDomains.length === 0
      && googleProviderExists
      && googleProviderEnabled
      && googleProviderClientIdSet
      && googleProviderClientSecretSet,
    firebaseProject,
    quotaProject,
    authorizedDomains: {
      required: requiredAuthorizedDomains,
      count: authorizedDomains.length,
      missing: missingAuthorizedDomains,
    },
    googleProvider: {
      exists: googleProviderExists,
      enabled: googleProviderEnabled,
      clientIdSet: googleProviderClientIdSet,
      clientSecretSet: googleProviderClientSecretSet,
      status: googleProvider.response.status,
      error: googleProviderExists ? undefined : googleProvider.body?.error?.message || "unknown",
    },
    googleOAuthClient: {
      requiredRedirectUri: requiredGoogleRedirectUri,
      consoleUrl: `https://console.cloud.google.com/auth/clients?project=${encodeURIComponent(googleAuthPlatformProject)}`,
      manualRedirectListCheckRequired: true,
      note: "This script cannot read classic Google OAuth client redirect URI lists. If browser Google sign-in still reports redirect_uri_mismatch, edit the web OAuth client behind studio-google-client-id and add requiredRedirectUri.",
    },
  });
} catch (error) {
  printJson({
    ok: false,
    phase: "unexpected",
    firebaseProject,
    quotaProject,
    error: String(error?.message || error).slice(0, 500),
  });
  process.exit(1);
}
