import { constants } from "node:fs";
import { open } from "node:fs/promises";

export class QuipslyApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** Read each time so replacing an expired session does not require a restart. */
export async function readSessionToken(path: string): Promise<string> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size > 16_384 ||
      stat.mode & 0o077 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error();
    const token = (await file.readFile("utf8")).trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token))
      throw new Error();
    return token;
  } catch {
    throw new QuipslyApiError(
      "SESSION_REQUIRED",
      "Provide a current Quipsly Firebase ID token in an owner-only (0600), non-symlink session file. Never paste the token into a chat.",
    );
  } finally {
    await file?.close();
  }
}

export type ApiRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};

export class QuipslyApi {
  private readonly origin: string;
  constructor(
    private readonly options: {
      baseUrl: string;
      token: () => Promise<string>;
      fetch?: typeof fetch;
      timeoutMs?: number;
      maxResponseBytes?: number;
    },
  ) {
    const url = new URL(options.baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new QuipslyApiError(
        "INVALID_ORIGIN",
        "Use an HTTPS Quipsly origin, or HTTP loopback for local development.",
      );
    }
    this.origin = url.origin;
  }

  async request(input: ApiRequest): Promise<Record<string, unknown>> {
    const url = new URL(input.path, this.origin);
    if (
      !input.path.startsWith("/api/") ||
      input.path.includes("\\") ||
      url.origin !== this.origin ||
      !url.pathname.startsWith("/api/")
    ) {
      throw new QuipslyApiError(
        "INVALID_PATH",
        "Only canonical Quipsly application routes are available.",
      );
    }
    for (const [key, value] of Object.entries(input.query || {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const token = await this.options.token();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 30_000,
    );
    try {
      const response = await (this.options.fetch || fetch)(url, {
        method: input.method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(input.body ? { "content-type": "application/json" } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        const status = response.status;
        if (status === 401)
          throw new QuipslyApiError(
            "SESSION_EXPIRED",
            "Sign in again and refresh the session file.",
            status,
          );
        if (status === 403 || status === 404)
          throw new QuipslyApiError(
            "WORK_UNAVAILABLE",
            "This work is not available to the signed-in account.",
            status,
          );
        if (status === 409)
          throw new QuipslyApiError(
            "WORK_CHANGED",
            "Read the current item before changing it again. Do not overwrite a newer edit or change an existing retry identity.",
            status,
          );
        if (status === 429 || status >= 500)
          throw new QuipslyApiError(
            "SERVICE_UNAVAILABLE",
            "Quipsly is temporarily unavailable. A write may have completed; read back or reuse the same request identity when retrying.",
            status,
            true,
          );
        throw new QuipslyApiError(
          "REQUEST_REJECTED",
          "Quipsly rejected this request. Check the tool fields and current work state.",
          status,
        );
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new QuipslyApiError(
          "INVALID_RESPONSE",
          "Quipsly did not return application data.",
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new QuipslyApiError(
          "INVALID_RESPONSE",
          "Quipsly returned no application data.",
        );
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > (this.options.maxResponseBytes ?? 2_000_000)) {
            await reader.cancel();
            throw new QuipslyApiError(
              "RESPONSE_TOO_LARGE",
              "Use a narrower search or smaller page of work.",
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const result: unknown = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      );
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new QuipslyApiError(
          "INVALID_RESPONSE",
          "Quipsly returned invalid application data.",
        );
      if ((result as Record<string, unknown>).ok === false)
        throw new QuipslyApiError(
          "REQUEST_REJECTED",
          "Quipsly could not complete the request.",
        );
      return result as Record<string, unknown>;
    } catch (error) {
      if (error instanceof QuipslyApiError) throw error;
      throw new QuipslyApiError(
        "CONNECTION_UNAVAILABLE",
        "The Quipsly response could not be read. A write may have completed; read back or reuse the same request identity when retrying.",
        0,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
