/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  isSupportedMobileCaptureConsentPresentationSurface,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

describe("capture consent readback", () => {
  const findFirst = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.mockResolvedValue({
      user: { id: "user-1", name: "Charlie", primaryEmail: "charlie@example.test", isStaff: false },
    } as never);
    mockedPrisma.mockReturnValue({ callRoom: { findFirst } } as never);
  });

  test("accepts only the explicit native and Session workspace consent surfaces", () => {
    expect(isSupportedMobileCaptureConsentPresentationSurface("quipsly-capture-consent-v2")).toBe(true);
    expect(isSupportedMobileCaptureConsentPresentationSurface("quipsly-session-workspace-consent-v1")).toBe(true);
    expect(isSupportedMobileCaptureConsentPresentationSurface("quipsly-admin-consent")).toBe(false);
    expect(isSupportedMobileCaptureConsentPresentationSurface("")).toBe(false);
  });

  test("returns policy without touching a private room", async () => {
    const response = await GET(new Request("http://localhost/api/mobile/capture/consent"));
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet.currentPolicy).toMatchObject({
      version: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      sha256: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
      surface: "quipsly-capture-consent-v2",
      supportedSurfaces: [
        "quipsly-capture-consent-v2",
        "quipsly-session-workspace-consent-v1",
      ],
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  test("returns all-party source and transcription readiness from current receipts", async () => {
    const participant = { id: "participant-1", userId: "user-1", role: "HOST" };
    const now = new Date("2026-08-04T12:00:00.000Z");
    findFirst.mockResolvedValue({
      id: "room-1",
      status: "OPEN",
      participants: [participant],
      recordingConsents: [{
        id: "consent-1",
        roomId: "room-1",
        participantId: participant.id,
        userId: "user-1",
        status: "GRANTED",
        policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
        canRecordAudio: true,
        canRecordVideo: true,
        canTranscribe: true,
        consentedAt: now,
        revokedAt: null,
        updatedAt: now,
        metadataJson: {
          consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
          consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
          recordingChoiceExplicit: true,
          transcriptionChoiceExplicit: true,
          allAudibleParticipantsNotifiedAndAgreed: true,
          presentationEvidence: { surface: "quipsly-capture-consent-v2", version: 1 },
        },
      }],
    });

    const response = await GET(new Request("http://localhost/api/mobile/capture/consent?callRoomId=room-1"));
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet.session).toMatchObject({
      participantId: "participant-1",
      recordingConsentId: "consent-1",
      recordingConsentCanRecordAudio: true,
      recordingConsentCanRecordVideo: true,
      recordingConsentCanTranscribe: true,
      allRegisteredParticipantConsentGranted: true,
      allRegisteredParticipantVideoConsentGranted: true,
      allRegisteredParticipantTranscriptionConsentGranted: true,
      transcriptionConsentGrantedParticipantCount: 1,
      consentRequiredParticipantCount: 1,
    });
  });

  test("fails closed when a room is not accessible", async () => {
    findFirst.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/mobile/capture/consent?callRoomId=private-room"));
    expect(response.status).toBe(404);
  });
});
