import { writingSaveRetryDelay } from "./voice-writing-save-retry";

test("transient saves retry with a bounded backoff", () => {
  expect([1, 2, 3, 4].map(attempt => writingSaveRetryDelay(attempt))).toEqual([2000, 5000, 15000, null]);
  for (const status of [408, 429, 500, 502, 503]) expect(writingSaveRetryDelay(1, status)).toBe(2000);
  for (const status of [200, 400, 401, 403, 404, 409, 422]) expect(writingSaveRetryDelay(1, status)).toBeNull();
});

test("server holds can extend but never shorten the backoff", () => {
  const now = Date.parse("2026-09-09T01:00:00Z");
  expect(writingSaveRetryDelay(1, 429, "60", now)).toBe(60000);
  expect(writingSaveRetryDelay(1, 503, "Wed, 09 Sep 2026 01:01:00 GMT", now)).toBe(60000);
  expect(writingSaveRetryDelay(2, 429, "0", now)).toBe(5000);
  expect(writingSaveRetryDelay(2, 429, "nonsense", now)).toBe(5000);
  expect(writingSaveRetryDelay(2, 429, "999999999999999999999", now)).toBeNull();
});
