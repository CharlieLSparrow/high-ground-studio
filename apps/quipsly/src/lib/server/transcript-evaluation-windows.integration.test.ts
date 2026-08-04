/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/server/mobile-capture-consent-readiness.js";

import {
  approveTranscriptEvaluationWindow,
  readTranscriptEvaluationReadiness,
  TranscriptEvaluationWindowError,
} from "./transcript-evaluation-windows";
import {
  appendTranscriptEvaluationCandidate,
  appendTranscriptEvaluationCorrectionObservation,
  exportTranscriptEvaluationRunnerInput,
  readTranscriptEvaluationCandidates,
} from "./transcript-evaluation-candidates";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for evaluation-window proof.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("transcript evaluation window local database proof", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const sourceSha256 = "e".repeat(64);
  const providerText = "This controlled database fixture proves an exact reviewed reference.";
  let userId = "";
  let outsiderUserId = "";
  let roomId = "";
  let assetId = "";
  let jobId = "";
  let evaluationWindowId = "";

  beforeAll(async () => {
    const reviewer = await prisma.user.create({ data: { primaryEmail: `evaluation-reviewer-${nonce}@example.test`, name: "Evaluation reviewer" } });
    const outsider = await prisma.user.create({ data: { primaryEmail: `evaluation-outsider-${nonce}@example.test`, name: "Evaluation outsider" } });
    userId = reviewer.id;
    outsiderUserId = outsider.id;
    const room = await prisma.callRoom.create({ data: { title: "Evaluation approval proof", purpose: "PODCAST", createdByUserId: userId } });
    roomId = room.id;
    const participant = await prisma.callParticipant.create({ data: { roomId, userId, displayName: "Evaluation reviewer", role: "HOST" } });
    await prisma.recordingConsent.create({ data: {
      roomId,
      participantId: participant.id,
      userId,
      status: "GRANTED",
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      consentedAt: new Date(),
      metadataJson: {
        consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        recordingChoiceExplicit: true,
        transcriptionChoiceExplicit: true,
        allAudibleParticipantsNotifiedAndAgreed: true,
        presentationEvidence: { version: 1, surface: "quipsly-capture-consent-v2" },
      },
    } });
    const asset = await prisma.recordingAsset.create({ data: {
      roomId,
      participantId: participant.id,
      kind: "LOCAL_AUDIO",
      status: "VERIFIED",
      fileName: "evaluation-window.wav",
      contentType: "audio/wav",
      byteSize: 1_920_000n,
      durationSeconds: 60,
      checksum: sourceSha256,
      storageBucket: "private-evaluation-fixture",
      storageObjectPath: `evaluation/${nonce}/source.wav`,
      localManifestJson: { promotion: { sourceId: `evaluation-source-${nonce}`, playbackUrl: `/api/ingest/media/evaluation-source-${nonce}` } },
      verifiedAt: new Date(),
    } });
    assetId = asset.id;
    const uploadSessionId = randomUUID();
    await prisma.mobileCaptureFinalizationReceipt.create({ data: {
      uploadSessionId,
      captureId: randomUUID(),
      roomId,
      actorUserId: userId,
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      recordingAssetId: assetId,
      metadataJson: { immutableUploadBinding: { uploadSessionId, roomId, sha256: sourceSha256, bucketName: asset.storageBucket, objectName: asset.storageObjectPath, sizeBytes: 1_920_000 } },
    } });
    const job = await prisma.transcriptJob.create({ data: {
      roomId,
      assetId,
      status: "COMPLETED",
      provider: "controlled-test-provider",
      requestedBy: userId,
      sourceGeneration: "1",
      sourceSha256,
      providerRequestId: `provider-${nonce}`,
      workerBuildId: "evaluation-integration-test",
      resultJson: { model: "controlled-v1" },
      completedAt: new Date(),
    } });
    jobId = job.id;
    const segment = await prisma.transcriptSegment.create({ data: {
      transcriptJobId: jobId,
      speakerLabel: "speaker_0",
      startSeconds: 0,
      endSeconds: 60,
      text: providerText,
      confidence: 0.9,
    } });
    await prisma.transcriptWord.createMany({ data: providerText.split(" ").map((word, providerWordIndex) => ({
      transcriptJobId: jobId,
      segmentId: segment.id,
      providerWordIndex,
      startSeconds: providerWordIndex,
      endSeconds: providerWordIndex + 0.5,
      word: word.replace(/[.,!?]+$/u, ""),
      punctuatedWord: word,
      confidence: 0.9,
      speakerLabel: "speaker_0",
      channel: 0,
    })) });
    await prisma.transcriptSegmentVerification.create({ data: {
      roomId,
      transcriptJobId: jobId,
      segmentId: segment.id,
      recordingAssetId: assetId,
      reviewerUserId: userId,
      reviewerEmailSnapshot: reviewer.primaryEmail,
      clientRequestId: `review-${nonce}`,
      providerTextSha256: createHash("sha256").update(providerText).digest("hex"),
      providerSpeakerLabel: "speaker_0",
      startSecondsSnapshot: 0,
      endSecondsSnapshot: 60,
      playbackSourceId: `evaluation-source-${nonce}`,
      playbackPositionSeconds: 0,
      reviewNote: "Controlled integration evidence; not a real human corpus sample.",
    } });
  });

  afterAll(async () => {
    try {
      if (roomId) {
        await prisma.transcriptEvaluationCorrectionObservation.deleteMany({ where: { candidate: { window: { roomId } } } });
        await prisma.transcriptEvaluationCandidate.deleteMany({ where: { window: { roomId } } });
        await prisma.transcriptEvaluationWindow.deleteMany({ where: { roomId } });
        await prisma.transcriptProviderPolicyReceipt.deleteMany({ where: { providerKey: "controlled-evaluation" } });
        await prisma.mobileCaptureFinalizationReceipt.deleteMany({ where: { roomId } });
        await prisma.callRoom.deleteMany({ where: { id: roomId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("freezes exact evidence, replays idempotently, and rejects a separate account", async () => {
    const actor = { id: userId, email: `evaluation-reviewer-${nonce}@example.test`, isStaff: false };
    const input = {
      prisma,
      actor,
      roomId,
      clientRequestId: `approve-${nonce}`,
      workload: "podcast",
      conditions: ["normal-exchange"],
      sourcePlaybackEvidence: {
        schema: "quipsly-complete-source-playback-v1",
        playbackSourceId: `evaluation-source-${nonce}`,
        durationSeconds: 60,
        listenedSecondBins: Array.from({ length: 60 }, (_, index) => index),
        completedAt: new Date().toISOString(),
      },
    };
    await expect(approveTranscriptEvaluationWindow({
      ...input,
      clientRequestId: `incomplete-playback-${nonce}`,
      sourcePlaybackEvidence: {
        ...input.sourcePlaybackEvidence,
        listenedSecondBins: Array.from({ length: 59 }, (_, index) => index),
      },
    })).rejects.toMatchObject({ code: "COMPLETE_SOURCE_PLAYBACK_REQUIRED", status: 409 });
    await expect(prisma.transcriptEvaluationWindow.count({ where: { roomId } })).resolves.toBe(0);
    const first = await approveTranscriptEvaluationWindow(input);
    evaluationWindowId = first.window.id;
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, window: { workload: "podcast", referenceWordCount: 9, staleAgainstCurrentReview: false } });
    const persisted = await prisma.transcriptEvaluationWindow.findUniqueOrThrow({ where: { id: first.window.id } });
    expect(persisted).toMatchObject({ roomId, transcriptJobId: jobId, recordingAssetId: assetId, sourceSha256, referenceWordsJson: expect.any(Array), sourceReviewReceiptsJson: expect.any(Array), sourcePlaybackEvidenceJson: expect.objectContaining({ schema: "quipsly-complete-source-playback-v1", listenedSecondBins: expect.any(Array) }) });

    await expect(approveTranscriptEvaluationWindow(input)).resolves.toMatchObject({ ok: true, idempotentReplay: true, window: { id: first.window.id } });
    await expect(approveTranscriptEvaluationWindow({ ...input, conditions: ["overlap-or-interruption"] })).rejects.toMatchObject({ code: "OPERATION_ID_CONFLICT", status: 409 });
    await expect(readTranscriptEvaluationReadiness({ prisma, roomId, actor: { id: outsiderUserId, email: `evaluation-outsider-${nonce}@example.test`, isStaff: false } })).rejects.toBeInstanceOf(TranscriptEvaluationWindowError);
  });

  it("persists private provider evidence once and exposes only aggregate metrics", async () => {
    const actor = { id: userId, email: `evaluation-reviewer-${nonce}@example.test`, isStaff: false };
    const completedAt = new Date().toISOString();
    const candidateInput = {
      prisma,
      actor,
      windowId: evaluationWindowId,
      clientRequestId: `candidate-${nonce}`,
      runKey: `controlled-run-${nonce}`,
      requestConfig: { model: "controlled-v2", diarization: "word" },
      rawResponse: { privateTranscript: providerText, providerRequestId: `raw-${nonce}` },
      policy: {
        capturedAt: completedAt,
        sourceUrl: "https://example.test/provider-policy",
        trainingUsage: "opted-out",
        retentionMode: "zero-data-retention",
        retentionDays: null,
        processingRegion: "local-test",
      },
      candidate: {
        providerKey: "controlled-evaluation",
        providerName: "Controlled evaluation provider",
        model: "controlled-v2",
        adapterVersion: "adapter-v1",
        speakerAttribution: "word",
        timingGranularity: "word",
        completedAt,
        elapsedMilliseconds: 1200,
        estimatedCostUsd: 0.001,
        outcome: "succeeded",
        providerRequestId: `request-${nonce}`,
        words: providerText.split(" ").map((word, index) => ({
          text: word,
          startSeconds: index,
          endSeconds: index + 0.5,
          speakerId: null,
        })),
        correction: null,
      },
    };

    const first = await appendTranscriptEvaluationCandidate(candidateInput);
    expect(first).toMatchObject({
      ok: true,
      idempotentReplay: false,
      candidate: {
        providerKey: "controlled-evaluation",
        outcome: "succeeded",
        metrics: { words: { wordErrorRate: 0 } },
      },
    });
    await expect(appendTranscriptEvaluationCandidate(candidateInput)).resolves.toMatchObject({
      idempotentReplay: true,
      candidate: { id: first.candidate.id },
    });
    await expect(appendTranscriptEvaluationCandidate({
      ...candidateInput,
      rawResponse: { privateTranscript: "changed evidence" },
    })).rejects.toMatchObject({ code: "CANDIDATE_OPERATION_CONFLICT", status: 409 });

    const publicProjection = await readTranscriptEvaluationCandidates({ prisma, actor, roomId });
    expect(publicProjection).toMatchObject({ windowCount: 1, candidates: [{ id: first.candidate.id, correctionObservationCount: 0 }] });
    expect(JSON.stringify(publicProjection)).not.toContain(providerText);

    const correction = await appendTranscriptEvaluationCorrectionObservation({
      prisma,
      actor,
      candidateId: first.candidate.id,
      clientRequestId: `correction-observation-${nonce}`,
      elapsedMilliseconds: 3400,
      operationCount: 2,
      observedAt: completedAt,
      observation: { surface: "controlled-integration", privateNote: "reviewed against playback" },
    });
    expect(correction).toMatchObject({ ok: true, idempotentReplay: false });
    await expect(appendTranscriptEvaluationCorrectionObservation({
      prisma,
      actor,
      candidateId: first.candidate.id,
      clientRequestId: `correction-observation-${nonce}`,
      elapsedMilliseconds: 3400,
      operationCount: 2,
      observedAt: completedAt,
      observation: { surface: "controlled-integration", privateNote: "reviewed against playback" },
    })).resolves.toMatchObject({ idempotentReplay: true, observationId: correction.observationId });

    const privateExport = await exportTranscriptEvaluationRunnerInput({ prisma, actor, roomId });
    expect(privateExport).toMatchObject({
      kind: "quipsly-private-transcript-evaluation-runner-input-v1",
      windows: [{ windowId: evaluationWindowId, reference: { approvalStatus: "human-approved" } }],
    });
    expect(JSON.stringify(privateExport)).toContain("This");
    await expect(readTranscriptEvaluationCandidates({
      prisma,
      actor: { id: outsiderUserId, email: `evaluation-outsider-${nonce}@example.test`, isStaff: false },
      roomId,
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
  });
});
