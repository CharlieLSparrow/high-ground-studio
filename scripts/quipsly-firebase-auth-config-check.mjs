#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const firebaseProject = process.env.FIREBASE_PROJECT_ID || "quipsly-reef";
const quotaProject = process.env.GOOGLE_CLOUD_QUOTA_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "high-ground-odyssey";
const googleAuthPlatformProject =
  process.env.QUIPSLY_GOOGLE_AUTH_PLATFORM_PROJECT || firebaseProject;
const requiredIosBundleId =
  process.env.QUIPSLY_FIREBASE_IOS_BUNDLE_ID
  || "com.highgroundodyssey.HighGroundCapture";
const requiredAuthorizedDomains = (process.env.QUIPSLY_FIREBASE_REQUIRED_DOMAINS || "nest.quipsly.com")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);
const requiredGoogleRedirectUri =
  process.env.QUIPSLY_FIREBASE_GOOGLE_REDIRECT_URI
  || `https://${firebaseProject}.firebaseapp.com/__/auth/handler`;
const localIosInfoPlistPath = path.resolve(
  process.env.QUIPSLY_CAPTURE_INFO_PLIST
  || "apps/mobile-capture/HighGroundCapture/HighGroundCapture/Info.plist",
);

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

async function firebaseManagementGet(path, token) {
  const response = await fetch(`https://firebase.googleapis.com/v1beta1/${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-goog-user-project": quotaProject,
    },
  });
  const body = await response.json();
  return { response, body };
}

function gcloudProjectDetails(projectId) {
  return JSON.parse(execFileSync(
    "gcloud",
    [
      "projects",
      "describe",
      projectId,
      "--format=json(projectId,projectNumber)",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ));
}

function oauthClientProjectNumber(clientId) {
  const match = String(clientId || "").match(/^([0-9]+)-/);
  return match?.[1] || null;
}

function plistString(xml, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(
    new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]+)</string>`),
  );
  return match?.[1]?.trim() || null;
}

try {
  const token = accessToken();
  const firebaseProjectDetails = gcloudProjectDetails(firebaseProject);
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
  const providerClientProjectNumber = googleProviderExists
    ? oauthClientProjectNumber(googleProvider.body.clientId)
    : null;
  const providerClientOwnedByFirebaseProject =
    providerClientProjectNumber === String(firebaseProjectDetails.projectNumber);

  const iosApps = await firebaseManagementGet(
    `projects/${firebaseProject}/iosApps`,
    token,
  );
  const matchingIosApps = iosApps.response.ok && Array.isArray(iosApps.body.apps)
    ? iosApps.body.apps.filter((app) => app.bundleId === requiredIosBundleId)
    : [];
  const iosApp = matchingIosApps.length === 1 ? matchingIosApps[0] : null;
  const iosConfig = iosApp
    ? await firebaseManagementGet(`${iosApp.name}/config`, token)
    : null;
  const iosPlist = iosConfig?.response.ok && iosConfig.body.configFileContents
    ? Buffer.from(iosConfig.body.configFileContents, "base64").toString("utf8")
    : "";
  const iosClientId = plistString(iosPlist, "CLIENT_ID");
  const reversedIosClientId = plistString(iosPlist, "REVERSED_CLIENT_ID");
  const iosClientProjectNumber = oauthClientProjectNumber(iosClientId);
  const iosClientOwnedByFirebaseProject =
    iosClientProjectNumber === String(firebaseProjectDetails.projectNumber);
  let localIosInfoPlist = "";
  let localIosInfoPlistReadable = false;
  try {
    localIosInfoPlist = readFileSync(localIosInfoPlistPath, "utf8");
    localIosInfoPlistReadable = true;
  } catch {
    localIosInfoPlist = "";
  }
  const localIosClientId = plistString(localIosInfoPlist, "GIDClientID");
  const localServerClientId = plistString(localIosInfoPlist, "GIDServerClientID");
  const localIosClientMatchesFirebase =
    Boolean(localIosClientId) && localIosClientId === iosClientId;
  const localServerClientMatchesProvider =
    Boolean(localServerClientId)
    && localServerClientId === googleProvider.body?.clientId;
  const localCallbackSchemeMatchesFirebase =
    Boolean(reversedIosClientId)
    && localIosInfoPlist.includes(`<string>${reversedIosClientId}</string>`);
  const localIosOAuthReady =
    localIosInfoPlistReadable
    && localIosClientMatchesFirebase
    && localServerClientMatchesProvider
    && localCallbackSchemeMatchesFirebase;
  const iosOAuthReady =
    Boolean(iosApp)
    && Boolean(iosConfig?.response.ok)
    && Boolean(iosClientId)
    && Boolean(reversedIosClientId)
    && iosClientOwnedByFirebaseProject
    && localIosOAuthReady;

  printJson({
    ok:
      missingAuthorizedDomains.length === 0
      && googleProviderExists
      && googleProviderEnabled
      && googleProviderClientIdSet
      && googleProviderClientSecretSet
      && providerClientOwnedByFirebaseProject
      && iosOAuthReady,
    firebaseProject,
    firebaseProjectNumber: String(firebaseProjectDetails.projectNumber),
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
      clientProjectNumber: providerClientProjectNumber,
      clientOwnedByFirebaseProject: providerClientOwnedByFirebaseProject,
      status: googleProvider.response.status,
      error: googleProviderExists ? undefined : googleProvider.body?.error?.message || "unknown",
    },
    iosApp: {
      bundleId: requiredIosBundleId,
      registrationCount: matchingIosApps.length,
      active: iosApp?.state === "ACTIVE",
      configReadable: Boolean(iosConfig?.response.ok),
      clientIdSet: Boolean(iosClientId),
      reversedClientIdSet: Boolean(reversedIosClientId),
      clientProjectNumber: iosClientProjectNumber,
      clientOwnedByFirebaseProject: iosClientOwnedByFirebaseProject,
      localInfoPlistReadable: localIosInfoPlistReadable,
      localClientMatchesFirebase: localIosClientMatchesFirebase,
      localServerClientMatchesProvider,
      localCallbackSchemeMatchesFirebase,
      ready: iosOAuthReady,
      error:
        !iosApps.response.ok
          ? iosApps.body?.error?.message || "unknown"
          : iosConfig && !iosConfig.response.ok
            ? iosConfig.body?.error?.message || "unknown"
            : undefined,
    },
    googleOAuthClient: {
      requiredRedirectUri: requiredGoogleRedirectUri,
      consoleUrl: `https://console.cloud.google.com/auth/clients?project=${encodeURIComponent(googleAuthPlatformProject)}`,
      manualRedirectListCheckRequired: true,
      action:
        !providerClientOwnedByFirebaseProject
          ? `Replace the Firebase Google provider client with a web OAuth client owned by ${firebaseProject}.`
          : !iosOAuthReady
            ? `Create or repair the iOS OAuth client for ${requiredIosBundleId} in ${firebaseProject}, then download a fresh Apple configuration.`
            : "Manually confirm that the project-owned web client contains requiredRedirectUri.",
      note: "This script intentionally emits ownership and presence checks only. It does not print OAuth client secrets, Firebase API keys, or the iOS client identifiers.",
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
