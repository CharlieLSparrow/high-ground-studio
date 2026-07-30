/** @jest-environment node */

import { resolveFirebaseCustomTokenServiceAccount } from "./firebase-custom-token-signer";

describe("Firebase custom-token signer selection", () => {
  it("keeps normal Admin operations keyless when no dedicated signer is configured", () => {
    expect(resolveFirebaseCustomTokenServiceAccount({
      FIREBASE_PROJECT_ID: "quipsly-reef",
    })).toBeNull();
  });

  it("accepts an explicit signer owned by the Firebase project", () => {
    expect(resolveFirebaseCustomTokenServiceAccount({
      FIREBASE_PROJECT_ID: "quipsly-reef",
      FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT:
        "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com",
    })).toBe(
      "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com",
    );
  });

  it("refuses a signer from the Cloud Run host project", () => {
    expect(() => resolveFirebaseCustomTokenServiceAccount({
      FIREBASE_PROJECT_ID: "quipsly-reef",
      FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT:
        "studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com",
    })).toThrow(
      "FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT must belong to FIREBASE_PROJECT_ID.",
    );
  });

  it("requires an explicit Firebase project when a signer is configured", () => {
    expect(() => resolveFirebaseCustomTokenServiceAccount({
      FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT:
        "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com",
    })).toThrow(
      "FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT requires FIREBASE_PROJECT_ID.",
    );
  });
});
