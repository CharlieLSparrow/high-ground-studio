import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createScopedToken,
  parseArguments,
  summarizeReadback,
} from "./quipsly-app-store-connect-readback.mjs";

const options = {
  appId: "6780995957",
  appName: "Quipsly Capture",
  bundleId: "com.highgroundodyssey.HighGroundCapture",
  marketingVersion: "1.0",
  buildNumber: "6",
  groupName: "Quipsly Capture Internal",
  testerEmail: "tester@example.com",
  expectedTesterStates: ["INVITED", "ACCEPTED"],
};

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
    "--tester-email",
    "tester@example.com",
    "--expect-tester-state",
    "accepted,installed",
  ]);

  assert.equal(parsed.apiKeyPath, "/private/key.json");
  assert.equal(parsed.marketingVersion, "1.0");
  assert.equal(parsed.buildNumber, "6");
  assert.equal(parsed.testerEmail, "tester@example.com");
  assert.deepEqual(parsed.expectedTesterStates, ["ACCEPTED", "INSTALLED"]);
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
  assert.equal(receipt.testers.expectedTester.email, undefined);
  assert.match(receipt.testers.expectedTester.emailSha256, /^[a-f0-9]{64}$/);
});
