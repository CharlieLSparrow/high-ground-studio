import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  mobileCaptureConsentHasCurrentPolicyEvidence,
} from "./mobile-capture-consent-readiness.js";

function currentConsent(surface: string) {
  return {
    policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
    consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
    evidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
    recordingChoiceExplicit: true,
    allAudibleParticipantsNotifiedAndAgreed: true,
    presentationSurface: surface,
    presentationVersion: 1,
  };
}

describe("mobile capture consent presentation evidence", () => {
  test.each([
    "quipsly-capture-consent-v2",
    "quipsly-session-workspace-consent-v1",
  ])("accepts current explicit consent from %s", (surface) => {
    expect(
      mobileCaptureConsentHasCurrentPolicyEvidence(currentConsent(surface)),
    ).toBe(true);
  });

  test("rejects an untrusted presentation surface", () => {
    expect(
      mobileCaptureConsentHasCurrentPolicyEvidence(
        currentConsent("quipsly-admin-consent"),
      ),
    ).toBe(false);
  });
});
