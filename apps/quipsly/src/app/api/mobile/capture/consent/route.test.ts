/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
  isSupportedMobileCaptureConsentPresentationSurface,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { GET, POST } from "./route";

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
      supportedSurfaces: MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES,
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
      canControlRoom: true,
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

  test("uses the canonical Session control boundary for a project owner or editor", async () => {
    const participant = { id: "participant-1", userId: "user-1", role: "CLIENT" };
    findFirst
      .mockResolvedValueOnce({
        id: "room-1",
        status: "OPEN",
        createdByUserId: "another-user",
        booking: null,
        participants: [participant],
        recordingConsents: [],
      })
      .mockResolvedValueOnce({ id: "room-1" });

    const response = await GET(
      new Request("http://localhost/api/mobile/capture/consent?callRoomId=room-1"),
    );
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet.session.canControlRoom).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst.mock.calls[1]?.[0]).toMatchObject({
      select: { id: true },
    });
  });

  test("fails closed when a room is not accessible", async () => {
    findFirst.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/mobile/capture/consent?callRoomId=private-room"));
    expect(response.status).toBe(404);
  });

  test("saves a fresh invited client's one-tap recording choices and reports everyone ready", async () => {
    const consentCreatedAt = new Date();
    const hostParticipant = {
      id: "participant-host",
      userId: "user-host",
      role: "COACH",
      accessStatus: "ACTIVE",
    };
    const clientParticipant = {
      id: "participant-1",
      userId: "user-1",
      role: "CLIENT",
      accessStatus: "ACTIVE",
    };
    const hostConsent = {
      id: "consent-host",
      roomId: "room-1",
      participantId: hostParticipant.id,
      userId: hostParticipant.userId,
      status: "GRANTED",
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      consentedAt: consentCreatedAt,
      declinedAt: null,
      revokedAt: null,
      updatedAt: consentCreatedAt,
      metadataJson: {
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
        recordingChoiceExplicit: true,
        transcriptionChoiceExplicit: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        presentationEvidence: {
          surface: "quipsly-capture-consent-v2",
          version: 1,
        },
      },
    };
    const room = {
      id: "room-1",
      title: "First client Session",
      purpose: "COACHING",
      status: "OPEN",
      provider: "livekit",
      providerRoomId: "room-1",
      createdByUserId: "user-host",
      booking: null,
      participants: [hostParticipant, clientParticipant],
      recordingConsents: [hostConsent],
    };
    const consentCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "consent-client",
      updatedAt: consentCreatedAt,
      ...data,
    }));
    const transaction = jest.fn(async (operation: (tx: unknown) => unknown) => operation({
      recordingConsent: { create: consentCreate },
    }));
    findFirst
      .mockResolvedValueOnce(room)
      .mockResolvedValueOnce(null);
    mockedPrisma.mockReturnValue({
      callRoom: { findFirst },
      recordingConsent: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as never);

    const response = await POST(new Request(
      "http://localhost/api/mobile/capture/consent",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId: "room-1",
          consentAction: "GRANT",
          canRecordAudio: true,
          canRecordVideo: false,
          canTranscribe: true,
          allAudibleParticipantsNotifiedAndAgreed: true,
          consentPolicyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          consentText: MOBILE_CAPTURE_CONSENT_TEXT,
          consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
          clientKind: "web",
          deviceLabel: "Quipsly Web · MacIntel",
          presentationEvidence: {
            version: 1,
            surface: "quipsly-capture-consent-v2",
            presentedAt: new Date().toISOString(),
            recordingChoicePresented: true,
            transcriptionChoicePresented: true,
            audibleParticipantAttestationPresented: true,
          },
        }),
      },
    ));
    const packet = await response.json();

    expect(response.status).toBe(200);
    expect(packet).toMatchObject({
      ok: true,
      session: {
        participantId: clientParticipant.id,
        recordingConsentId: "consent-client",
        recordingConsentCanRecordAudio: true,
        recordingConsentCanRecordVideo: false,
        recordingConsentCanTranscribe: true,
        consentRequiredParticipantCount: 2,
        consentGrantedParticipantCount: 2,
        allRegisteredParticipantConsentGranted: true,
        transcriptionConsentGrantedParticipantCount: 2,
        allRegisteredParticipantTranscriptionConsentGranted: true,
        canControlRoom: false,
      },
      effects: {
        appOwnedConsentMutated: true,
        recordingStarted: false,
        providerJoined: false,
        externalMutated: false,
      },
    });
    expect(consentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        participantId: clientParticipant.id,
        userId: "user-1",
        status: "GRANTED",
        canRecordAudio: true,
        canRecordVideo: false,
        canTranscribe: true,
        metadataJson: expect.objectContaining({
          recordingChoiceExplicit: true,
          transcriptionChoiceExplicit: true,
          allAudibleParticipantsNotifiedAndAgreed: true,
        }),
      }),
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });
});
