import {
  browserSourcePreparationRetryDelayMs,
  browserSourcePreparationShouldRetry,
} from "./browser-source-preparation";

describe("browser source preparation recovery", () => {
  it.each([null, 408, 425, 429, 500, 503])(
    "retries transient status %s",
    (status) => {
      expect(browserSourcePreparationShouldRetry(status)).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 409, 422])(
    "does not loop on permanent status %s",
    (status) => {
      expect(browserSourcePreparationShouldRetry(status)).toBe(false);
    },
  );

  it("backs off quickly and caps repeated retries", () => {
    expect([0, 1, 2, 3, 4, 12].map(browserSourcePreparationRetryDelayMs)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      10_000,
      10_000,
    ]);
  });
});
