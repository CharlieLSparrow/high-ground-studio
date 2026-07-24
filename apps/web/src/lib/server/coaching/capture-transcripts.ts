import { createCoachingStorageClient } from "@/lib/server/coaching/gcs-storage";
import { coachingTranscriptReleaseGate } from "@/lib/server/coaching/transcript-release-gate";

const DEFAULT_MAX_ROUTE_TRANSCRIPT_BYTES = 250 * 1024 * 1024;

type RunTranscriptJobArgs = {
  prisma: any;
  transcriptJobId: string;
  requestedByUserId?: string | null;
};

type TranscriptSegmentDraft = {
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number | null;
  metadataJson: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function maxRouteTranscriptBytes() {
  const parsed = Number(process.env.TRANSCRIPT_ROUTE_MAX_BYTES || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ROUTE_TRANSCRIPT_BYTES;
}

function speakerLabel(value: unknown) {
  if (typeof value === "number" || typeof value === "string") {
    return `Speaker ${value}`;
  }
  return null;
}

function getMediaBucket(bucketName: string) {
  const storage = createCoachingStorageClient(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON,
  );
  return storage.bucket(bucketName);
}

function extractDeepgramSegments(payload: any): TranscriptSegmentDraft[] {
  const utterances = Array.isArray(payload?.results?.utterances) ? payload.results.utterances : [];
  if (utterances.length > 0) {
    return utterances
      .map((utterance: any) => {
        const start = numberOrNull(utterance.start);
        const end = numberOrNull(utterance.end);
        const transcript = text(utterance.transcript);
        if (start === null || end === null || !transcript) return null;

        return {
          speakerLabel: speakerLabel(utterance.speaker),
          startSeconds: start,
          endSeconds: Math.max(end, start),
          text: transcript,
          confidence: numberOrNull(utterance.confidence),
          metadataJson: {
            providerShape: "deepgram-utterance",
            channel: utterance.channel ?? null,
          },
        } satisfies TranscriptSegmentDraft;
      })
      .filter(Boolean) as TranscriptSegmentDraft[];
  }

  const words = payload?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words) || words.length === 0) return [];

  const segments: TranscriptSegmentDraft[] = [];
  let active: TranscriptSegmentDraft | null = null;

  for (const word of words) {
    const start = numberOrNull(word.start);
    const end = numberOrNull(word.end);
    const punctuatedWord = text(word.punctuated_word) || text(word.word);
    const label = speakerLabel(word.speaker);
    if (start === null || end === null || !punctuatedWord) continue;

    const shouldStartNew =
      !active ||
      active.speakerLabel !== label ||
      start - active.endSeconds > 1.25 ||
      active.text.length > 420;

    if (shouldStartNew) {
      if (active) segments.push(active);
      active = {
        speakerLabel: label,
        startSeconds: start,
        endSeconds: end,
        text: punctuatedWord,
        confidence: numberOrNull(word.confidence),
        metadataJson: {
          providerShape: "deepgram-word-group",
        },
      };
    } else if (active) {
      active.endSeconds = Math.max(active.endSeconds, end);
      active.text = `${active.text} ${punctuatedWord}`;
      const confidence = numberOrNull(word.confidence);
      if (confidence !== null && active.confidence !== null) {
        active.confidence = Math.min(active.confidence, confidence);
      }
    }
  }

  if (active) segments.push(active);
  return segments;
}

async function failJob(prisma: any, transcriptJobId: string, status: "FAILED" | "HELD", provider: string, message: string) {
  return prisma.transcriptJob.update({
    where: { id: transcriptJobId },
    data: {
      status,
      provider,
      completedAt: status === "FAILED" ? new Date() : null,
      errorMessage: message,
      resultJson: {
        source: "web-coaching-capture-transcript-runner",
        error: message,
        status,
      },
    },
  });
}

export async function runCoachingCaptureTranscriptJob(args: RunTranscriptJobArgs) {
  const provider = (process.env.CAPTURE_TRANSCRIPT_PROVIDER || "deepgram").toLowerCase();
  const job = await args.prisma.transcriptJob.findUnique({
    where: { id: args.transcriptJobId },
    include: {
      room: true,
      asset: true,
      segments: true,
    },
  });

  if (!job) {
    return { ok: false, error: "Transcript job was not found.", status: 404 };
  }

  if (!job.asset) {
    await failJob(args.prisma, job.id, "FAILED", provider, "Transcript job has no recording asset.");
    return { ok: false, error: "Transcript job has no recording asset.", status: 409 };
  }

  const transcriptGate = await coachingTranscriptReleaseGate({
    prisma: args.prisma,
    recordingAsset: job.asset,
  });
  if (!transcriptGate.allowed) {
    await failJob(args.prisma, job.id, "HELD", "processing-hold", transcriptGate.error);
    return {
      ok: false,
      error: transcriptGate.error,
      errorCode: transcriptGate.errorCode,
      explicitReleaseRequired: true,
      status: 409,
    };
  }

  // A completed transcript is still protected by the current release
  // boundary. Returning success for a subsequently held or revoked capture
  // would let a stale transcript look usable in a new coaching workflow.
  // This path never calls a provider, but it must not bypass consent and
  // immutable-release evidence either.
  if (job.status === "COMPLETED") {
    return {
      ok: true,
      transcriptJobId: job.id,
      status: job.status,
      segmentCount: job.segments.length,
      alreadyCompleted: true,
    };
  }

  if (job.segments.length > 0) {
    const message = "This transcript version already has immutable provider segments that derived work may reference. Create a new transcript job.";
    await failJob(args.prisma, job.id, "HELD", provider, message);
    return {
      ok: false,
      error: message,
      errorCode: "TRANSCRIPT_VERSION_IMMUTABLE",
      createNewVersion: true,
      recordingAssetId: job.assetId || null,
      status: 409,
    };
  }

  if (!["VERIFIED", "UPLOADED"].includes(job.asset.status)) {
    await failJob(args.prisma, job.id, "HELD", provider, "Recording asset is not uploaded or verified yet.");
    return { ok: false, error: "Recording asset is not uploaded or verified yet.", status: 409 };
  }

  if (!job.asset.storageBucket || !job.asset.storageObjectPath) {
    await failJob(args.prisma, job.id, "HELD", provider, "Recording asset does not have a cloud storage object path.");
    return { ok: false, error: "Recording asset does not have a cloud storage object path.", status: 409 };
  }

  const byteSize = typeof job.asset.byteSize === "bigint" ? Number(job.asset.byteSize) : Number(job.asset.byteSize || 0);
  if (byteSize > maxRouteTranscriptBytes()) {
    await failJob(
      args.prisma,
      job.id,
      "HELD",
      provider,
      "Recording asset is too large for the route runner. Use a background worker.",
    );
    return { ok: false, error: "Recording asset is too large for the route runner. Use a background worker.", status: 413 };
  }

  if (provider !== "deepgram") {
    await failJob(args.prisma, job.id, "HELD", provider, `Transcript provider "${provider}" is not implemented yet.`);
    return { ok: false, error: `Transcript provider "${provider}" is not implemented yet.`, status: 501 };
  }

  const deepgramApiKey = text(process.env.DEEPGRAM_API_KEY);
  if (!deepgramApiKey) {
    await failJob(args.prisma, job.id, "HELD", provider, "DEEPGRAM_API_KEY is not configured.");
    return { ok: false, error: "DEEPGRAM_API_KEY is not configured.", status: 503 };
  }

  await args.prisma.transcriptJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      provider,
      requestedBy: args.requestedByUserId || job.requestedBy || null,
      startedAt: new Date(),
      errorMessage: null,
    },
  });

  const [buffer] = await getMediaBucket(job.asset.storageBucket).file(job.asset.storageObjectPath).download();
  const query = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
    paragraphs: "true",
  });
  if (job.language) query.set("language", job.language);

  const response = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${deepgramApiKey}`,
      "Content-Type": job.asset.contentType || "audio/m4a",
    },
    body: buffer,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = text(payload?.err_msg) || text(payload?.message) || `Deepgram request failed with HTTP ${response.status}.`;
    await failJob(args.prisma, job.id, "FAILED", provider, message);
    return { ok: false, error: message, status: response.status };
  }

  const segments = extractDeepgramSegments(payload);
  if (segments.length === 0) {
    await failJob(args.prisma, job.id, "FAILED", provider, "Provider returned no transcript segments.");
    return { ok: false, error: "Provider returned no transcript segments.", status: 502 };
  }

  const completedJob = await args.prisma.$transaction(async (tx: any) => {
    await tx.transcriptSegment.createMany({
      data: segments.map((segment) => ({
        transcriptJobId: job.id,
        speakerLabel: segment.speakerLabel,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        text: segment.text,
        confidence: segment.confidence,
        metadataJson: segment.metadataJson,
      })),
    });
    return tx.transcriptJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        provider,
        completedAt: new Date(),
        errorMessage: null,
        resultJson: {
          source: "web-coaching-capture-transcript-runner",
          provider,
          model: process.env.DEEPGRAM_MODEL || "nova-3",
          providerRequestId: payload?.metadata?.request_id ?? null,
          segmentCount: segments.length,
          durationSeconds: payload?.metadata?.duration ?? null,
          channels: payload?.metadata?.channels ?? null,
        },
      },
    });
  });

  return {
    ok: true,
    transcriptJobId: completedJob.id,
    status: completedJob.status,
    provider,
    segmentCount: segments.length,
  };
}
