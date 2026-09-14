import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  QuipslyApi,
  QuipslyApiError,
  readSessionToken,
} from "./quipsly-api.js";

const options = {
  baseUrl: "https://nest.example.test",
  token: async () => "synthetic-token",
};
const read = { method: "GET", path: "/api/coaching/runway" } as const;
const failure = (code: string) => (error: unknown) =>
  error instanceof QuipslyApiError && error.code === code;

test("session files are owner-only, regular, non-symlink files and are refreshed per read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quipsly-agent-session-test-"));
  const file = join(dir, "session.jwt");
  try {
    await assert.rejects(readSessionToken(file), failure("SESSION_REQUIRED"));
    await writeFile(file, "eyJhbGciOiJub25lIn0.e30.", { mode: 0o600 });
    assert.equal(await readSessionToken(file), "eyJhbGciOiJub25lIn0.e30.");
    await writeFile(file, "e30.eyJ1aWQiOiJ0ZXN0In0.signature");
    assert.equal(
      await readSessionToken(file),
      "e30.eyJ1aWQiOiJ0ZXN0In0.signature",
    );
    await symlink(file, join(dir, "link"));
    await assert.rejects(
      readSessionToken(join(dir, "link")),
      failure("SESSION_REQUIRED"),
    );
    await chmod(file, 0o644);
    await assert.rejects(readSessionToken(file), failure("SESSION_REQUIRED"));
    await chmod(file, 0o600);
    await writeFile(file, "secret\nAuthorization: another-secret");
    await assert.rejects(readSessionToken(file), failure("SESSION_REQUIRED"));
    await writeFile(file, "x".repeat(17_000));
    await assert.rejects(readSessionToken(file), failure("SESSION_REQUIRED"));
    await assert.rejects(readSessionToken(dir), failure("SESSION_REQUIRED"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("only HTTPS or explicit local development origins are accepted", () => {
  for (const baseUrl of [
    "http://nest.example.test",
    "https://user:secret@nest.example.test",
    "https://nest.example.test/path",
    "https://nest.example.test?token=secret",
  ]) {
    assert.throws(
      () => new QuipslyApi({ ...options, baseUrl }),
      failure("INVALID_ORIGIN"),
    );
  }
  for (const baseUrl of [
    "https://nest.example.test",
    "http://127.0.0.1:3012",
    "http://localhost:3012",
    "http://[::1]:3012",
  ]) {
    assert.doesNotThrow(() => new QuipslyApi({ ...options, baseUrl }));
  }
});

test("credentials stay on the configured origin; queries are encoded and tokens refresh", async () => {
  let count = 0;
  const api = new QuipslyApi({
    ...options,
    token: async () => `token-${++count}`,
    fetch: async (url, init) => {
      assert.equal(
        String(url),
        "https://nest.example.test/api/coaching/runway?q=a%26b",
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer token-${count}`,
      );
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      return Response.json({ ok: true });
    },
  });
  await api.request({ ...read, query: { q: "a&b" } });
  await api.request({ ...read, query: { q: "a&b" } });
  for (const path of [
    "//other.example/api/x",
    "https://other.example/api/x",
    "/api/../../secret",
    "/api/\\other",
  ]) {
    await assert.rejects(
      api.request({ ...read, path }),
      failure("INVALID_PATH"),
    );
  }
  assert.equal(count, 2);
});

for (const [status, code, retryable] of [
  [401, "SESSION_EXPIRED", false],
  [403, "WORK_UNAVAILABLE", false],
  [404, "WORK_UNAVAILABLE", false],
  [409, "WORK_CHANGED", false],
  [429, "SERVICE_UNAVAILABLE", true],
  [503, "SERVICE_UNAVAILABLE", true],
  [400, "REQUEST_REJECTED", false],
] as const)
  test(`HTTP ${status} becomes a redacted actionable error, without a hidden retry`, async () => {
    let calls = 0;
    const api = new QuipslyApi({
      ...options,
      fetch: async () => {
        calls++;
        return Response.json({ error: "private database secret" }, { status });
      },
    });
    await assert.rejects(
      api.request({
        method: "POST",
        path: "/api/coaching/example",
        body: { secret: "private note" },
      }),
      (error: unknown) => {
        assert.ok(error instanceof QuipslyApiError);
        assert.equal(error.code, code);
        assert.equal(error.retryable, retryable);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /private|secret|synthetic-token/);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

test("stream limits apply even without content-length", async () => {
  const api = new QuipslyApi({
    ...options,
    maxResponseBytes: 20,
    fetch: async () => Response.json({ body: "x".repeat(100) }),
  });
  await assert.rejects(api.request(read), failure("RESPONSE_TOO_LARGE"));
});

test("non-JSON, invalid shapes and application failures do not look successful", async () => {
  for (const response of [
    new Response("login page"),
    Response.json([]),
    Response.json({ ok: false, error: "secret" }),
  ]) {
    const api = new QuipslyApi({ ...options, fetch: async () => response });
    await assert.rejects(api.request(read), QuipslyApiError);
  }
});

test("a timeout aborts the request and preserves uncertain-write guidance", async () => {
  const api = new QuipslyApi({
    ...options,
    timeoutMs: 5,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("secret transport detail")),
        );
      }),
  });
  await assert.rejects(api.request(read), failure("CONNECTION_UNAVAILABLE"));
});
