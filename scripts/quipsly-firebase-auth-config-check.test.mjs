#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "scripts/quipsly-firebase-auth-config-check.mjs"),
  "utf8",
);

assert.match(
  source,
  /QUIPSLY_GOOGLE_AUTH_PLATFORM_PROJECT \|\| firebaseProject/,
  "the OAuth console must default to the Firebase project, not the deploy project",
);
assert.match(
  source,
  /providerClientOwnedByFirebaseProject/,
  "the readiness gate must prove web OAuth client ownership",
);
assert.match(
  source,
  /requiredIosBundleId/,
  "the readiness gate must identify the Quipsly Capture bundle",
);
assert.match(
  source,
  /plistString\(iosPlist, "CLIENT_ID"\)/,
  "the readiness gate must require an iOS OAuth client",
);
assert.match(
  source,
  /plistString\(iosPlist, "REVERSED_CLIENT_ID"\)/,
  "the readiness gate must require the iOS callback scheme",
);
assert.match(
  source,
  /localIosClientId === iosClientId/,
  "the readiness gate must match the local iOS client to the Firebase Apple config",
);
assert.match(
  source,
  /localServerClientId === googleProvider\.body\?\.clientId/,
  "the readiness gate must match the local server audience to the Firebase provider",
);
assert(
  source.includes(
    "localIosInfoPlist.includes(`<string>${reversedIosClientId}</string>`)",
  ),
  "the readiness gate must match the local callback scheme to Firebase",
);
assert.match(
  source,
  /providerClientOwnedByFirebaseProject\s*&& iosOAuthReady/,
  "overall readiness must require both project-owned web and fully wired local iOS clients",
);
assert.doesNotMatch(
  source,
  /clientSecret:\s*googleProvider\.body\.clientSecret/,
  "the readiness receipt must not print the provider client secret",
);
assert.doesNotMatch(
  source,
  /iosClientId,\s*$/m,
  "the readiness receipt must not print the iOS client identifier",
);

console.log(
  "PASS: Firebase auth readiness proves same-project web/iOS OAuth ownership without printing credential material.",
);
