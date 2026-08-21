import type {
  CaptureTranscriptProviderRequest,
} from "@high-ground/quipsly-media-processing";

export type TranscriptProviderResponse = {
  payload: unknown;
  requestId: string | null;
};

export type TranscriptProviderSource = {
  signedUrl: string;
  gcsUri: string;
  generation: string;
};

export interface TranscriptProvider {
  transcribe(
    source: TranscriptProviderSource,
    request: CaptureTranscriptProviderRequest,
  ): Promise<TranscriptProviderResponse>;
}

export class TranscriptProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    httpStatus?: number | null;
  }) {
    super(input.message);
    this.name = "TranscriptProviderError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.httpStatus = input.httpStatus ?? null;
  }
}

export class DeepgramTranscriptProvider implements TranscriptProvider {
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    apiKey: string,
    fetchImplementation: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("DEEPGRAM_API_KEY is required.");
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
  }

  async transcribe(
    source: TranscriptProviderSource,
    request: CaptureTranscriptProviderRequest,
  ): Promise<TranscriptProviderResponse> {
    const query = new URLSearchParams({
      model: request.model,
      smart_format: String(request.smartFormat),
      punctuate: String(request.punctuate),
      utterances: String(request.utterances),
      paragraphs: String(request.paragraphs),
    });
    if (request.version) query.set("version", request.version);
    if (request.diarize && request.diarizeModel) {
      query.set("diarize_model", request.diarizeModel);
    } else if (request.diarize) {
      // Immutable v1 manifests created before diarizer versioning continue to
      // replay with their original request instead of changing provider truth.
      query.set("diarize", String(request.diarize));
    }
    if (request.multichannel) query.set("multichannel", "true");
    if (request.language) query.set("language", request.language);
    for (const keyterm of request.terminology?.keyterms || []) {
      // Deepgram requires one repeated parameter per term. URLSearchParams
      // preserves that structure and encodes punctuation as data rather than
      // joining a comma-delimited pseudo-list.
      query.append("keyterm", keyterm);
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://api.deepgram.com/v1/listen?${query.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: source.signedUrl }),
          signal: AbortSignal.timeout(6 * 60 * 60 * 1_000),
        },
      );
    } catch (error) {
      throw new TranscriptProviderError({
        code: "provider-unreachable",
        message: error instanceof Error
          ? `Deepgram could not be reached: ${error.message}`
          : "Deepgram could not be reached.",
        retryable: true,
      });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = providerMessage(payload)
        || `Deepgram request failed with HTTP ${response.status}.`;
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
    return {
      payload,
      requestId: text(
        object(object(payload).metadata).request_id,
      ) || response.headers.get("dg-request-id"),
    };
  }
}

function providerMessage(value: unknown) {
  const row = object(value);
  return text(row.err_msg) || text(row.message) || text(row.error);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
