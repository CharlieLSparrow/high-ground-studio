/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/mobile-capture-consent-policy.js";
import type {
  LiveKitEgressEvidence,
  LiveKitEgressProvider,
} from "@/lib/server/livekit-egress-provider";
import {
  applyLiveKitProviderWebhook,
  processProviderRecordingCommand,
  requestProviderRecordingStart,
  requestProviderRecordingStop,
  type ProviderRecordingEnvironment,
} from "@/lib/server/provider-recording-command";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1"
  ? describe
  : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the provider recording command smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

function evidence(input: {
  egressId?: string;
  roomName: string;
  objectPath: string;
  status?: string;
  ended?: boolean;
}): LiveKitEgressEvidence {
  return {
    egressId: input.egressId || `EG_${randomUUID().replaceAll("-", "")}`,
    roomName: input.roomName,
    status: input.status || (input.ended ? "EGRESS_COMPLETE" : "EGRESS_ACTIVE"),
    startedAt: "2026-08-05T20:00:00.000Z",
    endedAt: input.ended ? "2026-08-05T20:30:00.000Z" : null,
    outputPaths: [input.objectPath],
    raw: {
      roomName: input.roomName,
      status: input.status || (input.ended ? "EGRESS_COMPLETE" : "EGRESS_ACTIVE"),
      fileResults: [{ filename: input.objectPath }],
    },
  };
}

function environment(overrides: Partial<ProviderRecordingEnvironment> = {}): ProviderRecordingEnvironment {
  return {
    livekitUrl: "https://provider.example.test",
    apiKey: "test-key",
    apiSecret: "test-secret",
    bucket: "test-media-bucket",
    bucketEnvName: "QUIPSLY_MEDIA_BUCKET",
    credentials: "",
    webhookUrl: "https://nest.example.test/api/providers/livekit/webhook",
    egressRequested: true,
    egressEnabled: true,
    liveKitControlConfigured: true,
    mediaVaultBucketConfigured: true,
    storageCredentialConfigured: true,
    webhookConfigured: true,
    missing: [],
    ...overrides,
  };
}

class FakeProvider implements LiveKitEgressProvider {
  active: LiveKitEgressEvidence[] = [];
  startCalls = 0;
  stopCalls = 0;
  failStartAfterAccept = false;
  failStartWithoutEvidence = false;
  startDelayMilliseconds = 0;

  async startRoomComposite(input: { roomName: string; storageObjectPath: string }) {
    this.startCalls += 1;
    if (this.startDelayMilliseconds) {
      await new Promise((resolve) => setTimeout(resolve, this.startDelayMilliseconds));
    }
    const accepted = evidence({ roomName: input.roomName, objectPath: input.storageObjectPath });
    if (this.failStartAfterAccept) {
      this.active = [accepted];
      throw new Error("connection reset after provider accepted START");
    }
    if (this.failStartWithoutEvidence) {
      throw new Error("connection reset with unknown provider outcome");
    }
    this.active = [accepted];
    return accepted;
  }

  async listActive(roomName: string) {
    return this.active.filter((item) => item.roomName === roomName);
  }

  async stop(egressId: string) {
    this.stopCalls += 1;
    const active = this.active.find((item) => item.egressId === egressId);
    if (!active) throw new Error("provider egress is not active");
    this.active = this.active.filter((item) => item.egressId !== egressId);
    return { ...active, status: "EGRESS_COMPLETE", endedAt: "2026-08-05T20:30:00.000Z" };
  }
}

runLocalDatabaseSmoke("durable optional provider recording commands", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const userId = `provider-command-user-${nonce}`;
  const roomIds: string[] = [];

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        primaryEmail: `provider-command-${nonce}@example.test`,
        name: "Provider command operator",
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.callRoom.deleteMany({ where: { id: { in: roomIds } } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createRoom(options: { consent?: boolean; localMaster?: boolean } = {}) {
    const roomId = `provider-command-room-${nonce}-${roomIds.length}`;
    roomIds.push(roomId);
    return prisma.callRoom.create({
      data: {
        id: roomId,
        createdByUserId: userId,
        purpose: "PODCAST",
        status: "OPEN",
        provider: "livekit",
        providerRoomId: `provider-room-${nonce}-${roomIds.length}`,
        title: "Optional provider witness test",
        participants: {
          create: {
            id: `provider-participant-${nonce}-${roomIds.length}`,
            userId,
            role: "HOST",
            accessStatus: "ACTIVE",
            displayName: "Provider command operator",
          },
        },
        ...(options.localMaster
          ? {
              recordingAssets: {
                create: {
                  kind: "LOCAL_AUDIO",
                  status: "VERIFIED",
                  fileName: "protected-local-master.wav",
                  checksum: "a".repeat(64),
                  localManifestJson: { source: "protected-local-master" },
                },
              },
            }
          : {}),
      },
      include: { participants: true },
    }).then(async (room) => {
      if (options.consent !== false) {
        await prisma.recordingConsent.create({
          data: {
            roomId: room.id,
            participantId: room.participants[0].id,
            userId,
            status: "GRANTED",
            consentText: MOBILE_CAPTURE_CONSENT_TEXT,
            policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
            canRecordAudio: true,
            canRecordVideo: true,
            canTranscribe: true,
            consentedAt: new Date(),
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
          },
        });
      }
      return room;
    });
  }

  it("deduplicates a repeated START request and preserves the provider mix as an optional witness", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    provider.startDelayMilliseconds = 15;
    const requestId = randomUUID();
    const input = {
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    };
    const [first, concurrentReplay] = await Promise.all([
      requestProviderRecordingStart(input),
      requestProviderRecordingStart(input),
    ]);
    const settled = first.status === "started"
      ? first
      : await requestProviderRecordingStart(input);
    expect([first.status, concurrentReplay.status]).toEqual(expect.arrayContaining(["started"]));
    expect(settled).toMatchObject({ status: "started", requestId });
    expect(provider.startCalls).toBe(1);

    const commandCount = await prisma.providerRecordingCommand.count({ where: { requestId } });
    const storedRoom = await prisma.callRoom.findUnique({
      where: { id: room.id },
      include: { recordingAssets: true, providerRecordingCommands: true },
    });
    expect(commandCount).toBe(1);
    expect(storedRoom?.status).toBe("RECORDING");
    expect(storedRoom?.recordingAssets[0]).toMatchObject({ kind: "SERVER_MIX", status: "UPLOADING" });
    expect(storedRoom?.recordingAssets[0].localManifestJson).toMatchObject({
      providerRecordingIsOptionalWitness: true,
      localProtectedMastersRemainAuthoritative: true,
    });
  });

  it("recovers a lost START response from active-provider evidence without sending a second START", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    provider.failStartAfterAccept = true;
    const requestId = randomUUID();
    const first = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    });
    const replay = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    });
    expect(first.status).toBe("started");
    expect(replay).toMatchObject({ status: "started", idempotentReplay: true });
    expect(provider.startCalls).toBe(1);
  });

  it("holds an uncertain START for reconciliation and never retries it blindly", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    provider.failStartWithoutEvidence = true;
    const requestId = randomUUID();
    const first = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    });
    const replay = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    });
    expect(first.status).toBe("reconcile-required");
    expect(replay.status).toBe("reconcile-required");
    expect(provider.startCalls).toBe(1);
    expect(replay.message).toContain("will not risk a duplicate retry");
  });

  it("stops once, replays safely, and keeps storage verification separate", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    const start = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId: randomUUID(),
      prisma,
      provider,
      environment: environment(),
    });
    expect(start.status).toBe("started");
    const stopRequestId = randomUUID();
    const stopInput = {
      callRoomId: room.id,
      operatorUserId: userId,
      requestId: stopRequestId,
      prisma,
      provider,
      environment: environment(),
    };
    const first = await requestProviderRecordingStop(stopInput);
    const replay = await requestProviderRecordingStop(stopInput);
    expect(first.status).toBe("stopped");
    expect(replay).toMatchObject({ status: "stopped", idempotentReplay: true });
    expect(provider.stopCalls).toBe(1);
    const asset = await prisma.recordingAsset.findUnique({ where: { id: start.recordingAssetId } });
    expect(asset).toMatchObject({ status: "UPLOADED", verifiedAt: null });
  });

  it("deduplicates authenticated webhook replay and binds a lost-response command by deterministic path", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    provider.failStartWithoutEvidence = true;
    const requestId = randomUUID();
    const uncertain = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId,
      prisma,
      provider,
      environment: environment(),
    });
    expect(uncertain.status).toBe("reconcile-required");
    const command = await prisma.providerRecordingCommand.findUnique({ where: { requestId } });
    const egress = evidence({
      roomName: room.providerRoomId!,
      objectPath: command!.expectedStorageObjectPath!,
    });
    const webhook = {
      eventId: randomUUID(),
      eventType: "egress_started",
      createdAt: "2026-08-05T20:00:01.000Z",
      egress,
      raw: { id: "signed-event", event: "egress_started", egressInfo: egress.raw },
    };
    const first = await applyLiveKitProviderWebhook({ evidence: webhook, prisma });
    const replay = await applyLiveKitProviderWebhook({ evidence: webhook, prisma });
    expect(first).toMatchObject({ ok: true, applied: true, idempotentReplay: false });
    if (!("receiptId" in first)) throw new Error("Expected an applied provider webhook receipt.");
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, receiptId: first.receiptId });
    expect(await prisma.providerRecordingEventReceipt.count({ where: { providerEventId: webhook.eventId } })).toBe(1);
    expect(await prisma.providerRecordingCommand.findUnique({ where: { requestId } })).toMatchObject({
      status: "APPLIED",
      providerEgressId: egress.egressId,
    });
  });

  it("keeps provider recording off without changing a verified local master", async () => {
    const room = await createRoom({ localMaster: true });
    const localBefore = await prisma.recordingAsset.findFirst({
      where: { roomId: room.id, kind: "LOCAL_AUDIO" },
    });
    const provider = new FakeProvider();
    const result = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId: randomUUID(),
      prisma,
      provider,
      environment: environment({ egressRequested: false, egressEnabled: false }),
    });
    const localAfter = await prisma.recordingAsset.findUnique({ where: { id: localBefore!.id } });
    expect(result).toMatchObject({ status: "held" });
    expect(result.message).toContain("deliberately disabled");
    expect(provider.startCalls).toBe(0);
    expect(localAfter).toMatchObject({
      id: localBefore!.id,
      status: "VERIFIED",
      checksum: localBefore!.checksum,
    });
  });

  it("fails closed before dispatch when all-party provider consent is missing", async () => {
    const room = await createRoom({ consent: false });
    const provider = new FakeProvider();
    const result = await requestProviderRecordingStart({
      callRoomId: room.id,
      operatorUserId: userId,
      requestId: randomUUID(),
      prisma,
      provider,
      environment: environment(),
    });
    expect(result).toMatchObject({ status: "held" });
    expect(result.message).toContain("requires every signed-in");
    expect(provider.startCalls).toBe(0);
  });

  it("rechecks consent after queueing and before the first external START dispatch", async () => {
    const room = await createRoom();
    const provider = new FakeProvider();
    const asset = await prisma.recordingAsset.create({
      data: {
        roomId: room.id,
        kind: "SERVER_MIX",
        status: "HELD",
        fileName: "queued-consent-drift.mp4",
        contentType: "video/mp4",
        storageBucket: "test-media-bucket",
        storageObjectPath: `media-vault/recordings/livekit/${room.id}/commands/queued-consent-drift.mp4`,
        localManifestJson: { source: "provider-recording-command-reservation" },
      },
    });
    const command = await prisma.providerRecordingCommand.create({
      data: {
        requestId: randomUUID(),
        roomId: room.id,
        actorUserId: userId,
        action: "START",
        status: "QUEUED",
        provider: "livekit",
        providerRoomId: room.providerRoomId!,
        captureGroupId: room.captureGroupId,
        recordingAssetId: asset.id,
        expectedStorageBucket: asset.storageBucket,
        expectedStorageObjectPath: asset.storageObjectPath,
        consentVersion: "queued-before-revocation",
        consentSnapshotJson: { allPartiesAudioReady: true, allPartiesVideoReady: true },
        requestJson: { test: "queued-consent-drift" },
      },
    });
    await prisma.recordingConsent.updateMany({
      where: { roomId: room.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const result = await processProviderRecordingCommand({
      commandId: command.id,
      prisma,
      provider,
      environment: environment(),
    });

    expect(result).toMatchObject({ status: "held" });
    expect(result.message).toContain("requires every signed-in");
    expect(provider.startCalls).toBe(0);
    expect(await prisma.providerRecordingCommand.findUnique({ where: { id: command.id } })).toMatchObject({
      status: "HELD",
      dispatchedAt: null,
      errorCode: "PROVIDER_RECORDING_CONSENT_HOLD",
    });
  });
});
