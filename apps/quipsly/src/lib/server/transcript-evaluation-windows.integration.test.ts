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
import {
  claimTranscriptEvaluationRun,
  completeTranscriptEvaluationRun,
  failTranscriptEvaluationRun,
  heartbeatTranscriptEvaluationRun,
  queueTranscriptTerminologyEvaluationRun,
  readTranscriptEvaluationRuns,
  retryTranscriptEvaluationRun,
} from "./transcript-evaluation-runs";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for evaluation-window proof.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("transcript evaluation window local database proof", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const sourceSha256 = "e".repeat(64);
  const providerText = "Quipsly helps Homer preserve an exact playback reviewed reference.";
  let userId = "";
  let outsiderUserId = "";
  let roomId = "";
  let assetId = "";
  let jobId = "";
  let segmentId = "";
  let evaluationWindowId = "";
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    const reviewer = await prisma.user.create({ data: { primaryEmail: `evaluation-reviewer-${nonce}@example.test`, name: "Evaluation reviewer" } });
    const outsider = await prisma.user.create({ data: { primaryEmail: `evaluation-outsider-${nonce}@example.test`, name: "Evaluation outsider" } });
    userId = reviewer.id;
    outsiderUserId = outsider.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `evaluation-${nonce}`, name: "Evaluation fixture workspace" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `evaluation-${nonce}`, name: "Evaluation fixture project" } });
    projectId = project.id;
    await prisma.studioTranscriptTerminologyTerm.createMany({ data: [
      { projectId, canonicalText: "Quipsly", normalizedText: "quipsly", aliasesJson: ["Quips Lee"], category: "brand", priority: 100 },
      { projectId, canonicalText: "Homer", normalizedText: "homer", aliasesJson: [], category: "person", priority: 90 },
      { projectId, canonicalText: "High Ground Odyssey", normalizedText: "high ground odyssey", aliasesJson: ["HGO"], category: "title", priority: 80 },
    ] });
    const room = await prisma.callRoom.create({ data: { title: "Evaluation approval proof", purpose: "PODCAST", createdByUserId: userId, projectId } });
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
    segmentId = segment.id;
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
        await prisma.transcriptEvaluationRun.deleteMany({ where: { roomId } });
        await prisma.transcriptEvaluationCandidate.deleteMany({ where: { window: { roomId } } });
        await prisma.transcriptEvaluationWindow.deleteMany({ where: { roomId } });
        await prisma.transcriptProviderPolicyReceipt.deleteMany({ where: { capturedByUserId: userId } });
        await prisma.mobileCaptureFinalizationReceipt.deleteMany({ where: { roomId } });
        await prisma.callRoom.deleteMany({ where: { id: roomId } });
      }
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
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
      startSegmentId: segmentId,
      endSegmentId: segmentId,
      sourcePlaybackEvidence: {
        schema: "quipsly-window-playback-v1",
        playbackSourceId: `evaluation-source-${nonce}`,
        startSeconds: 0,
        endSeconds: 60,
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
    })).rejects.toMatchObject({ code: "COMPLETE_WINDOW_PLAYBACK_REQUIRED", status: 409 });
    await expect(prisma.transcriptEvaluationWindow.count({ where: { roomId } })).resolves.toBe(0);
    const first = await approveTranscriptEvaluationWindow(input);
    evaluationWindowId = first.window.id;
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, window: { workload: "podcast", referenceWordCount: 9, criticalTermCount: 2, criticalTermOccurrenceCount: 2, terminologyPromptTermCount: 3, staleAgainstCurrentReview: false } });
    const persisted = await prisma.transcriptEvaluationWindow.findUniqueOrThrow({ where: { id: first.window.id } });
    expect(persisted).toMatchObject({ roomId, transcriptJobId: jobId, recordingAssetId: assetId, sourceSha256, referenceWordsJson: expect.any(Array), sourceReviewReceiptsJson: expect.any(Array), sourcePlaybackEvidenceJson: expect.objectContaining({ schema: "quipsly-window-playback-v1", listenedSecondBins: expect.any(Array) }) });

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
      requestConfig: {
        provider: { model: "controlled-v2", diarization: "word" },
        inputMedia: {
          schema: "quipsly-transcript-evaluation-derivative-v1",
          originalSourceSha256: sourceSha256,
          startSeconds: 0,
          endSeconds: 60,
          durationSeconds: 60,
          sha256: "7".repeat(64),
          byteSize: 1_920_044,
          codec: "pcm_s16le",
          sampleRateHz: 16_000,
          channelCount: 1,
          ffmpegArgumentsVersion: "mono-16khz-pcm-v1",
        },
      },
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
        inputMediaSha256: "7".repeat(64),
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
    await expect(appendTranscriptEvaluationCandidate({
      ...candidateInput,
      clientRequestId: `candidate-derivative-mismatch-${nonce}`,
      runKey: `controlled-run-mismatch-${nonce}`,
      requestConfig: {
        ...candidateInput.requestConfig,
        inputMedia: { ...candidateInput.requestConfig.inputMedia, sha256: "8".repeat(64) },
      },
    })).rejects.toMatchObject({ code: "CANDIDATE_DERIVATIVE_MISMATCH", status: 409 });

    const frozenWindow = await prisma.transcriptEvaluationWindow.findUniqueOrThrow({ where: { id: evaluationWindowId } });
    const criticalTerminology = (frozenWindow.providerSnapshotJson as any).criticalTerminology;
    const experimentConfig = (arm: "baseline" | "project-terminology") => ({
      ...candidateInput.requestConfig,
      provider: {
        ...candidateInput.requestConfig.provider,
        terminology: arm === "baseline"
          ? { mode: "none", snapshotSha256: criticalTerminology.termsSha256, termCount: 0 }
          : { mode: "project-snapshot", snapshotSha256: criticalTerminology.termsSha256, termCount: criticalTerminology.promptTermCount, promptSha256: "9".repeat(64) },
      },
      terminologyExperiment: {
        schema: "quipsly-transcript-terminology-experiment-v1",
        comparisonKey: `controlled-terms-${nonce}`,
        arm,
        termsSha256: criticalTerminology.termsSha256,
      },
    });
    await expect(appendTranscriptEvaluationCandidate({
      ...candidateInput,
      clientRequestId: `candidate-terminology-invalid-${nonce}`,
      runKey: `controlled-terminology-invalid-${nonce}`,
      requestConfig: {
        ...experimentConfig("project-terminology"),
        provider: {
          ...experimentConfig("project-terminology").provider,
          terminology: { ...experimentConfig("project-terminology").provider.terminology, termCount: 1 },
        },
      },
    })).rejects.toMatchObject({ code: "TERMINOLOGY_EXPERIMENT_CONFIG_INVALID", status: 409 });

    const baseline = await appendTranscriptEvaluationCandidate({
      ...candidateInput,
      clientRequestId: `candidate-baseline-${nonce}`,
      runKey: `controlled-baseline-${nonce}`,
      requestConfig: experimentConfig("baseline"),
      rawResponse: { privateTranscript: "Quickly helps Home preserve an exact playback reviewed reference." },
      candidate: {
        ...candidateInput.candidate,
        providerRequestId: `request-baseline-${nonce}`,
        words: "Quickly helps Home preserve an exact playback reviewed reference.".split(" ").map((word, index) => ({ text: word, startSeconds: index, endSeconds: index + 0.5, speakerId: null })),
      },
    });
    const prompted = await appendTranscriptEvaluationCandidate({
      ...candidateInput,
      clientRequestId: `candidate-prompted-${nonce}`,
      runKey: `controlled-prompted-${nonce}`,
      requestConfig: experimentConfig("project-terminology"),
      rawResponse: { privateTranscript: providerText },
      candidate: {
        ...candidateInput.candidate,
        providerRequestId: `request-prompted-${nonce}`,
      },
    });
    expect(baseline.candidate).toMatchObject({
      terminologyExperiment: { arm: "baseline", comparisonKey: `controlled-terms-${nonce}`, appliedTermCount: 0 },
      metrics: { terminology: { conceptRecall: 0, falsePositiveMentionCount: 0 } },
    });
    expect(prompted.candidate).toMatchObject({
      terminologyExperiment: { arm: "project-terminology", comparisonKey: `controlled-terms-${nonce}`, appliedTermCount: 3 },
      metrics: { terminology: { conceptRecall: 1, conceptPrecision: 1, falsePositiveMentionCount: 0 } },
    });

    const publicProjection = await readTranscriptEvaluationCandidates({ prisma, actor, roomId });
    expect(publicProjection.windowCount).toBe(1);
    expect(publicProjection.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.candidate.id, correctionObservationCount: 0 }),
      expect.objectContaining({ id: baseline.candidate.id, terminologyExperiment: expect.objectContaining({ arm: "baseline" }) }),
      expect.objectContaining({ id: prompted.candidate.id, terminologyExperiment: expect.objectContaining({ arm: "project-terminology" }) }),
    ]));
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
      windows: [{
        windowId: evaluationWindowId,
        reference: { approvalStatus: "human-approved" },
        terminologyExperiment: {
          schema: "quipsly-transcript-terminology-experiment-v1",
          promptTermCount: 3,
          referenceTermCount: 2,
          referenceOccurrenceCount: 2,
          requiredArms: ["baseline", "project-terminology"],
        },
      }],
    });
    expect(JSON.stringify(privateExport)).toContain("Quipsly");
    await expect(readTranscriptEvaluationCandidates({
      prisma,
      actor: { id: outsiderUserId, email: `evaluation-outsider-${nonce}@example.test`, isStaff: false },
      roomId,
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
  });

  it("leases, retries, reconciles, and completes one durable matched terminology run", async () => {
    const actor = { id: userId, email: `evaluation-reviewer-${nonce}@example.test`, isStaff: false };
    const queued = await queueTranscriptTerminologyEvaluationRun({
      prisma,
      actor,
      roomId,
      requestId: randomUUID(),
      windowIds: [evaluationWindowId],
    });
    expect(queued).toMatchObject({ ok: true, idempotentReplay: false, run: { status: "QUEUED", attemptCount: 0, windows: [{ windowId: evaluationWindowId, status: "QUEUED" }] } });
    expect(JSON.stringify(queued)).not.toContain(providerText);
    expect(JSON.stringify(queued)).not.toContain("leaseToken");

    const claimed = await claimTranscriptEvaluationRun({ prisma, actor, workerId: `worker-${nonce}`, leaseSeconds: 300 });
    expect(claimed.lease).toMatchObject({
      schema: "quipsly-transcript-evaluation-runner-lease-v1",
      run: { id: queued.run.id, status: "PROCESSING", attemptCount: 1 },
      runnerInput: { windows: [{ windowId: evaluationWindowId, runControl: { comparisonKey: queued.run.comparisonKey } }] },
    });
    const lease = claimed.lease!;
    await expect(heartbeatTranscriptEvaluationRun({ prisma, actor, runId: queued.run.id, leaseToken: lease.token, leaseSeconds: 300 })).resolves.toMatchObject({ ok: true, run: { status: "PROCESSING" } });
    await expect(heartbeatTranscriptEvaluationRun({
      prisma,
      actor: { id: outsiderUserId, email: `evaluation-outsider-${nonce}@example.test`, isStaff: false },
      runId: queued.run.id,
      leaseToken: lease.token,
    })).rejects.toMatchObject({ code: "TRANSCRIPT_EVALUATION_RUN_NOT_FOUND", status: 404 });

    const controlledWindow = lease.runnerInput.windows[0] as any;
    const runControl = controlledWindow.runControl;
    const terms = controlledWindow.terminologyExperiment;
    const derivative = {
      schema: "quipsly-transcript-evaluation-derivative-v1",
      originalSourceSha256: sourceSha256,
      startSeconds: 0,
      endSeconds: 60,
      durationSeconds: 60,
      sha256: "7".repeat(64),
      byteSize: 1_920_044,
      codec: "pcm_s16le",
      sampleRateHz: 16_000,
      channelCount: 1,
      ffmpegArgumentsVersion: "mono-16khz-pcm-v1",
    };
    const appendArm = async (arm: "baseline" | "project-terminology") => {
      const prompt = "Quipsly, Homer, High Ground Odyssey";
      const requestConfig = {
        provider: {
          executable: "openai-whisper-cli",
          model: "large-v3-turbo",
          language: "en",
          device: "cpu",
          word_timestamps: true,
          condition_on_previous_text: false,
          terminology: arm === "baseline"
            ? { mode: "none", snapshotSha256: terms.termsSha256, termCount: 0, nativeKeyterms: [], prompt: null }
            : { mode: "project-snapshot", snapshotSha256: terms.termsSha256, termCount: terms.promptTermCount, nativeKeyterms: terms.terms.map((term: any) => term.canonicalText), prompt, promptSha256: createHash("sha256").update(prompt).digest("hex") },
        },
        inputMedia: derivative,
        terminologyExperiment: {
          schema: "quipsly-transcript-terminology-experiment-v1",
          comparisonKey: queued.run.comparisonKey,
          arm,
          termsSha256: terms.termsSha256,
        },
      };
      return appendTranscriptEvaluationCandidate({
        prisma,
        actor,
        windowId: evaluationWindowId,
        clientRequestId: `run-${arm}-${nonce}`,
        runKey: arm === "baseline" ? runControl.baselineRunKey : runControl.terminologyRunKey,
        requestConfig,
        rawResponse: { controlled: true, arm },
        policy: {
          capturedAt: new Date().toISOString(),
          sourceUrl: "https://github.com/openai/whisper",
          trainingUsage: "not-applicable",
          retentionMode: "on-device",
        },
        candidate: {
          providerKey: "openai-whisper-local",
          providerName: "OpenAI Whisper local",
          model: "large-v3-turbo",
          adapterVersion: "quipsly-local-whisper-evaluation-adapter-v1",
          speakerAttribution: "unavailable",
          timingGranularity: "word",
          completedAt: new Date().toISOString(),
          elapsedMilliseconds: 900,
          estimatedCostUsd: 0,
          outcome: "succeeded",
          providerRequestId: null,
          words: providerText.split(" ").map((word, index) => ({ text: word, startSeconds: index, endSeconds: index + 0.5, speakerId: null })),
          correction: null,
        },
      });
    };
    const baseline = await appendArm("baseline");
    await expect(completeTranscriptEvaluationRun({ prisma, actor, runId: queued.run.id, leaseToken: lease.token })).rejects.toMatchObject({ code: "TRANSCRIPT_EVALUATION_RUN_INCOMPLETE", status: 409 });
    const terminology = await appendArm("project-terminology");
    const completed = await completeTranscriptEvaluationRun({ prisma, actor, runId: queued.run.id, leaseToken: lease.token });
    expect(completed).toMatchObject({
      ok: true,
      run: {
        status: "COMPLETED",
        windows: [{
          status: "COMPLETED",
          baselineCandidateId: baseline.candidate.id,
          terminologyCandidateId: terminology.candidate.id,
          derivativeSha256: derivative.sha256,
        }],
      },
    });
    await expect(heartbeatTranscriptEvaluationRun({ prisma, actor, runId: queued.run.id, leaseToken: lease.token })).rejects.toMatchObject({ code: "TRANSCRIPT_EVALUATION_RUN_LEASE_LOST", status: 409 });
    await expect(readTranscriptEvaluationRuns({ prisma, actor, roomId })).resolves.toMatchObject({ runs: [expect.objectContaining({ id: queued.run.id, status: "COMPLETED" })] });

    const retryQueued = await queueTranscriptTerminologyEvaluationRun({ prisma, actor, roomId, requestId: randomUUID(), windowIds: [evaluationWindowId] });
    const retryClaim = await claimTranscriptEvaluationRun({ prisma, actor, workerId: `worker-retry-${nonce}`, leaseSeconds: 300 });
    expect(retryClaim.lease?.run.id).toBe(retryQueued.run.id);
    const released = await failTranscriptEvaluationRun({
      prisma,
      actor,
      runId: retryQueued.run.id,
      leaseToken: retryClaim.lease!.token,
      errorCode: "controlled-retry",
      errorMessage: "Controlled retry proof.",
      retryable: true,
    });
    expect(released).toMatchObject({ retryQueued: true, run: { status: "QUEUED", attemptCount: 1 } });
    const secondClaim = await claimTranscriptEvaluationRun({ prisma, actor, workerId: `worker-retry-${nonce}`, leaseSeconds: 300 });
    const failed = await failTranscriptEvaluationRun({
      prisma,
      actor,
      runId: retryQueued.run.id,
      leaseToken: secondClaim.lease!.token,
      errorCode: "controlled-terminal",
      errorMessage: "Controlled terminal proof.",
      retryable: false,
    });
    expect(failed).toMatchObject({ retryQueued: false, run: { status: "FAILED", attemptCount: 2 } });
    await expect(retryTranscriptEvaluationRun({ prisma, actor, runId: retryQueued.run.id })).resolves.toMatchObject({ run: { status: "QUEUED", attemptCount: 2 } });
    const exhaustedClaim = await claimTranscriptEvaluationRun({ prisma, actor, workerId: `worker-exhausted-${nonce}`, leaseSeconds: 300 });
    expect(exhaustedClaim.lease).toMatchObject({ run: { id: retryQueued.run.id, status: "PROCESSING", attemptCount: 3 } });
    await prisma.transcriptEvaluationRun.update({
      where: { id: retryQueued.run.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(claimTranscriptEvaluationRun({ prisma, actor, workerId: `worker-after-exhaustion-${nonce}`, leaseSeconds: 300 }))
      .resolves.toMatchObject({ ok: true, lease: null });
    await expect(readTranscriptEvaluationRuns({ prisma, actor, roomId })).resolves.toMatchObject({
      runs: expect.arrayContaining([expect.objectContaining({
        id: retryQueued.run.id,
        status: "FAILED",
        attemptCount: 3,
        errorCode: "evaluation-lease-retry-exhausted",
        windows: [expect.objectContaining({ status: "FAILED", errorCode: "evaluation-lease-retry-exhausted" })],
      })]),
    });
  });
});
