import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createScopedToken,
  parseArguments,
  summarizeReadback,
} from "./quipsly-app-store-connect-readback.mjs";
import {
  appStoreConnectReadCredentialPath,
  DEFAULT_APP_STORE_CONNECT_API_KEY_PATH,
} from "./quipsly-app-store-connect-credentials.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const options = {
  appId: "6780995957",
  appName: "Quipsly Capture",
  bundleId: "com.highgroundodyssey.HighGroundCapture",
  marketingVersion: "1.0",
  buildNumber: "6",
  groupName: "Quipsly Capture Internal",
  groupKind: "internal",
  testerEmail: "tester@example.com",
  expectedTesterStates: ["INVITED", "ACCEPTED"],
  expectedPublicLinkStates: [],
};

test("read-only Apple audits use the installed private credential by default", () => {
  assert.equal(
    appStoreConnectReadCredentialPath({}),
    DEFAULT_APP_STORE_CONNECT_API_KEY_PATH,
  );
  assert.equal(
    appStoreConnectReadCredentialPath({
      APP_STORE_CONNECT_API_KEY_PATH: "/private/override.json",
    }),
    "/private/override.json",
  );
});

test("creates a five-minute ES256 token with explicit read scopes", () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const token = createScopedToken({
    keyId: "ABCDE12345",
    issuerId: "issuer-id",
    privateKey,
    scopes: ["GET /v1/apps/6780995957"],
    now: 1_000,
  });
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString());
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString());

  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "ABCDE12345");
  assert.equal(payload.iss, "issuer-id");
  assert.equal(payload.iat, 1_000);
  assert.equal(payload.exp, 1_300);
  assert.deepEqual(payload.scope, ["GET /v1/apps/6780995957"]);
  assert.equal(Buffer.from(signaturePart, "base64url").length, 64);
});

test("omits the optional scope claim for an authorized write token", () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const token = createScopedToken({
    keyId: "ABCDE12345",
    issuerId: "issuer-id",
    privateKey,
    now: 1_000,
  });
  const [, payloadPart] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString());

  assert.equal(Object.hasOwn(payload, "scope"), false);
  assert.equal(payload.exp, 1_300);
});

test("parses an explicit TestFlight acceptance contract", () => {
  const parsed = parseArguments([
    "--api-key-path",
    "/private/key.json",
    "--version",
    "1.0",
    "--build",
    "6",
    "--group-kind",
    "external",
    "--tester-email",
    "tester@example.com",
    "--expect-tester-state",
    "accepted,installed",
    "--expect-public-link-state",
    "accepted,installed",
  ]);

  assert.equal(parsed.apiKeyPath, "/private/key.json");
  assert.equal(parsed.marketingVersion, "1.0");
  assert.equal(parsed.buildNumber, "6");
  assert.equal(parsed.groupKind, "external");
  assert.equal(parsed.testerEmail, "tester@example.com");
  assert.deepEqual(parsed.expectedTesterStates, ["ACCEPTED", "INSTALLED"]);
  assert.deepEqual(parsed.expectedPublicLinkStates, ["ACCEPTED", "INSTALLED"]);
});

test("defaults to the canonical current TestFlight release", () => {
  const parsed = parseArguments([]);

  assert.equal(parsed.appId, QUIPSLY_CAPTURE_RELEASE_TARGET.appId);
  assert.equal(parsed.appName, QUIPSLY_CAPTURE_RELEASE_TARGET.appName);
  assert.equal(parsed.bundleId, QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId);
  assert.equal(
    parsed.marketingVersion,
    QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
  );
  assert.equal(parsed.buildNumber, QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber);
  assert.equal(
    parsed.groupName,
    QUIPSLY_CAPTURE_RELEASE_TARGET.externalGroupName,
  );
  assert.equal(parsed.groupKind, "external");
});

test("redacts the tester email and proves the exact internal build contract", () => {
  const receipt = summarizeReadback({
    options,
    auditedAt: "2026-07-28T23:30:00.000Z",
    appDocument: {
      data: {
        type: "apps",
        id: options.appId,
        attributes: {
          name: options.appName,
          bundleId: options.bundleId,
        },
      },
    },
    buildDocument: {
      data: [
        {
          type: "builds",
          id: "build-6",
          attributes: {
            version: "6",
            processingState: "VALID",
            expired: false,
            usesNonExemptEncryption: false,
          },
          relationships: {
            preReleaseVersion: {
              data: { type: "preReleaseVersions", id: "version-1" },
            },
            buildBetaDetail: {
              data: { type: "buildBetaDetails", id: "build-6" },
            },
          },
        },
      ],
      included: [
        {
          type: "preReleaseVersions",
          id: "version-1",
          attributes: { version: "1.0", platform: "IOS" },
        },
        {
          type: "buildBetaDetails",
          id: "build-6",
          attributes: {
            internalBuildState: "IN_BETA_TESTING",
            externalBuildState: "READY_FOR_BETA_SUBMISSION",
          },
        },
      ],
    },
    groupDocument: {
      data: [
        {
          type: "betaGroups",
          id: "internal-group",
          attributes: {
            name: options.groupName,
            isInternalGroup: true,
            feedbackEnabled: true,
          },
          relationships: {
            builds: { data: [{ type: "builds", id: "build-6" }] },
            betaTesters: {
              data: [{ type: "betaTesters", id: "tester-1" }],
            },
          },
        },
      ],
    },
    testerDocument: {
      data: [
        {
          type: "betaTesters",
          id: "tester-1",
          attributes: {
            email: options.testerEmail,
            state: "ACCEPTED",
            inviteType: "EMAIL",
          },
          relationships: {
            betaGroups: {
              data: [{ type: "betaGroups", id: "internal-group" }],
            },
          },
        },
      ],
    },
  });

  assert.equal(receipt.passed, true);
  assert.equal(receipt.build.internalBuildState, "IN_BETA_TESTING");
  assert.equal(receipt.group.includesBuild, true);
  assert.equal(receipt.testers.expectedTester.state, "ACCEPTED");
  assert.equal(receipt.testers.expectedTester.inviteType, "EMAIL");
  assert.equal(receipt.testers.expectedTester.email, undefined);
  assert.match(receipt.testers.expectedTester.emailSha256, /^[a-f0-9]{64}$/);
});

test("proves an external public-link group without exposing anonymous tester identity", () => {
  const externalOptions = {
    ...options,
    groupName: "Quipsly Capture Rehearsal",
    groupKind: "external",
    testerEmail: "",
    expectedTesterStates: [],
    expectedPublicLinkStates: ["ACCEPTED", "INSTALLED"],
  };
  const receipt = summarizeReadback({
    options: externalOptions,
    auditedAt: "2026-07-30T13:40:00.000Z",
    appDocument: {
      data: {
        type: "apps",
        id: externalOptions.appId,
        attributes: {
          name: externalOptions.appName,
          bundleId: externalOptions.bundleId,
        },
      },
    },
    buildDocument: {
      data: [
        {
          type: "builds",
          id: "build-6",
          attributes: {
            version: "6",
            processingState: "VALID",
            expired: false,
            usesNonExemptEncryption: false,
          },
          relationships: {
            preReleaseVersion: {
              data: { type: "preReleaseVersions", id: "version-1" },
            },
            buildBetaDetail: {
              data: { type: "buildBetaDetails", id: "build-6" },
            },
          },
        },
      ],
      included: [
        {
          type: "preReleaseVersions",
          id: "version-1",
          attributes: { version: "1.0", platform: "IOS" },
        },
        {
          type: "buildBetaDetails",
          id: "build-6",
          attributes: {
            internalBuildState: "IN_BETA_TESTING",
            externalBuildState: "IN_BETA_TESTING",
          },
        },
      ],
    },
    groupDocument: {
      data: [
        {
          type: "betaGroups",
          id: "external-group",
          attributes: {
            name: externalOptions.groupName,
            isInternalGroup: false,
            feedbackEnabled: true,
            publicLinkEnabled: true,
            publicLinkLimitEnabled: true,
            publicLinkLimit: 100,
          },
          relationships: {
            builds: { data: [{ type: "builds", id: "build-6" }] },
            betaTesters: {
              data: [{ type: "betaTesters", id: "anonymous-tester" }],
            },
          },
        },
      ],
    },
    testerDocument: {
      data: [
        {
          type: "betaTesters",
          id: "anonymous-tester",
          attributes: {
            state: "INSTALLED",
            inviteType: "PUBLIC_LINK",
          },
          relationships: {
            betaGroups: {
              data: [{ type: "betaGroups", id: "external-group" }],
            },
          },
        },
      ],
    },
  });

  assert.equal(receipt.passed, true);
  assert.equal(receipt.schema, "quipsly-app-store-connect-readback-v2");
  assert.equal(receipt.group.isInternalGroup, false);
  assert.equal(receipt.group.publicLinkEnabled, true);
  assert.equal(receipt.testers.publicLinkInviteCount, 1);
  assert.deepEqual(receipt.testers.publicLinkStates, ["INSTALLED"]);
  assert.equal(receipt.testers.expectedTester.emailSha256, null);
});

test("fails a public-link acceptance contract until a public-link tester appears", () => {
  const pendingExternalOptions = {
    ...options,
    groupName: "Quipsly Capture Rehearsal",
    groupKind: "external",
    testerEmail: "",
    expectedTesterStates: [],
    expectedPublicLinkStates: ["ACCEPTED", "INSTALLED"],
  };
  const receipt = summarizeReadback({
    options: pendingExternalOptions,
    appDocument: {
      data: {
        type: "apps",
        id: pendingExternalOptions.appId,
        attributes: {
          name: pendingExternalOptions.appName,
          bundleId: pendingExternalOptions.bundleId,
        },
      },
    },
    buildDocument: {
      data: [
        {
          type: "builds",
          id: "build-6",
          attributes: {
            version: "6",
            processingState: "VALID",
            expired: false,
          },
          relationships: {
            preReleaseVersion: {
              data: { type: "preReleaseVersions", id: "version-1" },
            },
            buildBetaDetail: {
              data: { type: "buildBetaDetails", id: "build-6" },
            },
          },
        },
      ],
      included: [
        {
          type: "preReleaseVersions",
          id: "version-1",
          attributes: { version: "1.0" },
        },
        {
          type: "buildBetaDetails",
          id: "build-6",
          attributes: {
            internalBuildState: "IN_BETA_TESTING",
            externalBuildState: "IN_BETA_TESTING",
          },
        },
      ],
    },
    groupDocument: {
      data: [
        {
          type: "betaGroups",
          id: "external-group",
          attributes: {
            name: pendingExternalOptions.groupName,
            isInternalGroup: false,
            publicLinkEnabled: true,
          },
          relationships: {
            builds: { data: [{ type: "builds", id: "build-6" }] },
            betaTesters: { data: [] },
          },
        },
      ],
    },
    testerDocument: { data: [] },
  });

  assert.equal(receipt.testers.publicLinkInviteCount, 0);
  assert.equal(receipt.checks.publicLinkTesterState, false);
  assert.equal(receipt.passed, false);
});
