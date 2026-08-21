import { GoogleAuth } from "google-auth-library";

import type {
  CaptureTranscriptProviderRequest,
} from "@high-ground/quipsly-media-processing";

import {
  TranscriptProviderError,
  type TranscriptProvider,
  type TranscriptProviderResponse,
  type TranscriptProviderSource,
} from "./deepgram.js";

type AuthClient = {
  getRequestHeaders(url?: string): Promise<Headers | Record<string, string>>;
};

type GoogleSpeechProviderOptions = {
  projectId: string;
  location: string;
  authClient?: AuthClient;
  fetchImplementation?: typeof fetch;
  pollIntervalMs?: number;
};

/**
 * Executes Speech-to-Text V2 batch recognition using the Cloud Run workload
 * identity. No provider API key is created, stored, or injected.
 */
export class GoogleSpeechV2TranscriptProvider implements TranscriptProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly authClientPromise: Promise<AuthClient>;
  private readonly fetchImplementation: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(options: GoogleSpeechProviderOptions) {
    this.projectId = requiredId(options.projectId, "Google Cloud project");
    this.location = requiredId(options.location, "Speech location");
    this.authClientPromise = options.authClient
      ? Promise.resolve(options.authClient)
      : new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        }).getClient() as Promise<AuthClient>;
    this.fetchImplementation = options.fetchImplementation || fetch;
    this.pollIntervalMs = boundedPollInterval(options.pollIntervalMs);
  }

  async transcribe(
    source: TranscriptProviderSource,
    request: CaptureTranscriptProviderRequest,
  ): Promise<TranscriptProviderResponse> {
    if (request.name !== "google-speech-v2") {
      throw new TranscriptProviderError({
        code: "provider-request-mismatch",
        message: "Google Speech received a non-Google transcript request.",
        retryable: false,
      });
    }
    const endpoint = speechEndpoint(this.location);
    const recognizer = [
      "projects",
      encodeURIComponent(this.projectId),
      "locations",
      encodeURIComponent(this.location),
      "recognizers",
      "_",
    ].join("/");
    const requestUrl = `${endpoint}/v2/${recognizer}:batchRecognize`;
    const features: Record<string, unknown> = {
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      enableAutomaticPunctuation: true,
    };
    if (request.diarize) features.diarizationConfig = {};
    if (request.multichannel) {
      features.multiChannelMode = "SEPARATE_RECOGNITION_PER_CHANNEL";
    }
    const operation = await this.requestJson(requestUrl, {
      method: "POST",
      body: JSON.stringify({
        config: {
          autoDecodingConfig: {},
          model: request.model,
          languageCodes: [request.language || "en-US"],
          features,
        },
        files: [{ uri: source.gcsUri }],
        recognitionOutputConfig: { inlineResponseConfig: {} },
      }),
    });
    const operationName = text(record(operation).name);
    if (!operationName) {
      throw new TranscriptProviderError({
        code: "provider-receipt-missing",
        message: "Google Speech did not return an operation name.",
        retryable: false,
      });
    }

    let completed = operation;
    while (record(completed).done !== true) {
      await delay(this.pollIntervalMs);
      completed = await this.requestJson(
        `${endpoint}/v2/${operationName.split("/").map(encodeURIComponent).join("/")}`,
        { method: "GET" },
      );
    }
    const operationRow = record(completed);
    if (operationRow.error) {
      const providerError = record(operationRow.error);
      throw new TranscriptProviderError({
        code: `provider-operation-${number(providerError.code) ?? "failed"}`,
        message: text(providerError.message)
          || "Google Speech batch recognition failed.",
        retryable: retryableGoogleCode(number(providerError.code)),
      });
    }
    const response = record(operationRow.response);
    return {
      payload: {
        operationName,
        response,
      },
      requestId: operationName,
    };
  }

  private async requestJson(
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;
    try {
      const client = await this.authClientPromise;
      const authHeaders = await client.getRequestHeaders(url);
      response = await this.fetchImplementation(url, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(authHeaders).entries()),
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(6 * 60 * 60 * 1_000),
      });
    } catch (error) {
      if (error instanceof TranscriptProviderError) throw error;
      throw new TranscriptProviderError({
        code: "provider-unreachable",
        message: error instanceof Error
          ? `Google Speech could not be reached: ${error.message}`
          : "Google Speech could not be reached.",
        retryable: true,
      });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = record(record(payload).error);
      const message = text(error.message)
        || `Google Speech request failed with HTTP ${response.status}.`;
      throw new TranscriptProviderError({
        code: `provider-http-${response.status}`,
        message,
        retryable: response.status === 408
          || response.status === 409
          || response.status === 425
          || response.status === 429
          || response.status >= 500,
        httpStatus: response.status,
      });
    }
    return payload;
  }
}

function speechEndpoint(location: string) {
  return location === "global"
    ? "https://speech.googleapis.com"
    : `https://${location}-speech.googleapis.com`;
}

function requiredId(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function boundedPollInterval(value: number | undefined) {
  const resolved = value ?? 5_000;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 60_000) {
    throw new Error("Google Speech poll interval is invalid.");
  }
  return resolved;
}

function retryableGoogleCode(value: number | null) {
  return value === 4 || value === 8 || value === 10 || value === 13 || value === 14;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
