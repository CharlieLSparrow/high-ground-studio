import { createSHA256 } from "hash-wasm";
import {
  MAX_LONG_VIDEO_SOURCE_BYTES,
  SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES,
} from "@high-ground/quipsly-capture-verification";

const HASH_CHUNK_BYTES = 8 * 1024 * 1024;
const AUDIO_TYPES_BY_EXTENSION: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
};
const VIDEO_TYPES_BY_EXTENSION: Record<string, string> = {
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mp4: "video/mp4",
  webm: "video/webm",
};

export type SessionRecordingFile = {
  contentType: string;
  sourceType: "audio" | "video";
};

export type SessionRecordingImportResult = {
  uploadSessionId: string;
  captureId: string;
  recordingAssetId: string | null;
  sha256: string;
  verifiedSizeBytes: number;
  processingDisposition: string;
  transcriptDisposition: string;
  processingHoldReason: string | null;
  transcriptHoldReason: string | null;
};

export const SESSION_RECORDING_EXTERNAL_SOURCE_PROFILE = Object.freeze({
  kind: "quipsly-nest-external-recording-import-v1",
  clientKind: "web",
  source: "nest-session-recordings",
  originalPreserved: true,
});

export const SESSION_RECORDING_EXTERNAL_ATTESTATION = true;

type UploadContract = {
  ok?: boolean;
  error?: string;
  uploadSessionId?: string;
  captureId?: string;
  uploadStage?: string;
  upload?: {
    method?: string;
    url?: string;
    contentType?: string;
    contentLength?: number;
  } | null;
  finalizeUrl?: string;
  retryAfterSeconds?: number;
  sha256?: string;
  expectedSizeBytes?: number;
  verification?: { verifiedSizeBytes?: number } | null;
  finalization?: { recordingAssetId?: string | null } | null;
  processingDisposition?: string;
  transcriptDisposition?: string;
  processingHold?: { reason?: string | null } | null;
  transcriptHold?: { reason?: string | null } | null;
};

function extension(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() || "";
}

export function sessionRecordingFileType(file: Pick<File, "name" | "type" | "size">): SessionRecordingFile {
  const browserType = file.type.split(";", 1)[0]?.trim().toLowerCase() || "";
  const inferredType = AUDIO_TYPES_BY_EXTENSION[extension(file.name)]
    || VIDEO_TYPES_BY_EXTENSION[extension(file.name)]
    || "";
  const contentType = browserType.startsWith("audio/") || browserType.startsWith("video/")
    ? browserType
    : inferredType;
  if (!contentType) throw new Error("Choose a supported audio or video recording with a recognizable file type.");
  const sourceType = contentType.startsWith("video/") ? "video" : "audio";
  const maximumBytes = sourceType === "video"
    ? MAX_LONG_VIDEO_SOURCE_BYTES
    : SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES;
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("The selected recording is empty or its exact size is unavailable.");
  if (file.size > maximumBytes) {
    throw new Error(sourceType === "video"
      ? "This video is larger than Quipsly’s 128 GiB preserved-source limit. Split it without replacing the original."
      : "This audio recording is larger than Quipsly’s 2 GiB synchronous verification limit. Preserve it locally and import a lossless split.");
  }
  return { contentType, sourceType };
}

export async function hashSessionRecordingFile(
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  if (file.size <= 0) throw new Error("The selected recording is empty.");
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    if (signal?.aborted) throw new DOMException("Recording import cancelled.", "AbortError");
    const end = Math.min(file.size, offset + HASH_CHUNK_BYTES);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    hasher.update(chunk);
    onProgress(end / file.size);
  }
  return hasher.digest("hex");
}

async function responseBody(response: Response): Promise<UploadContract> {
  try {
    return await response.json() as UploadContract;
  } catch {
    return { ok: false, error: `Quipsly returned an unreadable ${response.status} response.` };
  }
}

function uploadOriginal(
  contract: NonNullable<UploadContract["upload"]>,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    if (!contract.url) {
      reject(new Error("The server did not return a resumable upload capability."));
      return;
    }
    const target = new URL(contract.url, window.location.href);
    const localCapability = target.searchParams.get("token");
    if (localCapability && (target.hostname === "127.0.0.1" || target.hostname === "localhost")) {
      target.searchParams.delete("token");
    }
    const request = new XMLHttpRequest();
    request.open(contract.method || "PUT", target.toString());
    request.setRequestHeader("Content-Type", contract.contentType || file.type || "application/octet-stream");
    request.setRequestHeader("Content-Range", `bytes 0-${file.size - 1}/${file.size}`);
    if (localCapability) request.setRequestHeader("X-Quipsly-Local-Capture-Capability", localCapability);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("The original recording could not reach the private media vault. Your source file was not changed."));
    request.onabort = () => reject(new DOMException("Recording import cancelled.", "AbortError"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`The private media vault rejected the upload (${request.status}). Your source file was not changed.`));
      }
    };
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal?.removeEventListener("abort", abort);
    request.send(file);
  });
}

async function finalizeUpload(finalizeUrl: string, uploadSessionId: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const response = await fetch(finalizeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadSessionId }),
      cache: "no-store",
      signal,
    });
    const body = await responseBody(response);
    if (response.status !== 202) {
      if (!response.ok || !body.ok || body.uploadStage !== "verified") {
        throw new Error(body.error || "The server could not independently verify the preserved recording.");
      }
      return body;
    }
    const delay = Math.max(1, Math.min(10, body.retryAfterSeconds || 5)) * 1000;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const timer = window.setTimeout(finish, delay);
      const abort = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new DOMException("Recording import cancelled.", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error("Verification is still running. Keep the original and retry this import to recover the same upload session.");
}

export async function importSessionRecording(input: {
  roomId: string;
  participantId: string;
  recordingConsentId: string;
  project: { id: string; slug: string } | null;
  purpose: string;
  file: File;
  startedAt: string;
  stoppedAt: string;
  uploadSessionId: string;
  captureId: string;
  captureGroupId: string;
  onHashProgress: (fraction: number) => void;
  onUploadProgress: (fraction: number) => void;
  onStage: (stage: "hashing" | "reserving" | "uploading" | "verifying") => void;
  signal?: AbortSignal;
}): Promise<SessionRecordingImportResult> {
  const fileType = sessionRecordingFileType(input.file);
  input.onStage("hashing");
  const sha256 = await hashSessionRecordingFile(input.file, input.onHashProgress, input.signal);
  input.onStage("reserving");
  const response = await fetch("/api/ingest/mobile/resumable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      uploadSessionId: input.uploadSessionId,
      captureId: input.captureId,
      captureGroupId: input.captureGroupId,
      projectId: input.project?.id ?? null,
      projectSlug: input.project?.slug ?? null,
      fileName: input.file.name,
      contentType: fileType.contentType,
      sourceType: fileType.sourceType,
      expectedSizeBytes: input.file.size,
      sha256,
      callRoomId: input.roomId,
      participantId: input.participantId,
      recordingConsentId: input.recordingConsentId,
      capturePurpose: input.purpose,
      trackId: `external-${fileType.sourceType}`,
      startedAt: input.startedAt,
      stoppedAt: input.stoppedAt,
      sourceProfile: {
        ...SESSION_RECORDING_EXTERNAL_SOURCE_PROFILE,
        browserUserAgent: navigator.userAgent,
      },
      externalRecordingAttestation: SESSION_RECORDING_EXTERNAL_ATTESTATION,
    }),
    cache: "no-store",
    signal: input.signal,
  });
  const contract = await responseBody(response);
  if (!response.ok || !contract.ok) throw new Error(contract.error || "Quipsly could not reserve private media storage.");
  if (contract.upload) {
    input.onStage("uploading");
    await uploadOriginal(contract.upload, input.file, input.onUploadProgress, input.signal);
  } else if (contract.uploadStage !== "uploaded-unverified" && contract.uploadStage !== "verified") {
    throw new Error("The upload session is not recoverable. Keep the original and start a new import.");
  }
  input.onStage("verifying");
  const verified = contract.uploadStage === "verified"
    ? contract
    : await finalizeUpload(contract.finalizeUrl || "/api/mobile/capture/uploads/resumable/finalize", input.uploadSessionId, input.signal);
  return {
    uploadSessionId: input.uploadSessionId,
    captureId: input.captureId,
    recordingAssetId: verified.finalization?.recordingAssetId ?? null,
    sha256: verified.sha256 || sha256,
    verifiedSizeBytes: verified.verification?.verifiedSizeBytes ?? verified.expectedSizeBytes ?? input.file.size,
    processingDisposition: verified.processingDisposition || "HELD",
    transcriptDisposition: verified.transcriptDisposition || "HELD",
    processingHoldReason: verified.processingHold?.reason ?? null,
    transcriptHoldReason: verified.transcriptHold?.reason ?? null,
  };
}
