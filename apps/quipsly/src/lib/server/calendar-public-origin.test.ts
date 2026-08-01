/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { resolveCalendarPublicOrigin } from "./calendar-public-origin";

describe("calendar public origin", () => {
  it("uses the configured canonical host instead of a request-controlled host", () => {
    expect(
      resolveCalendarPublicOrigin("https://attacker.example/calendar", {
        QUIPSLY_APP_HOST: "nest.quipsly.com",
        NODE_ENV: "production",
      }),
    ).toBe("https://nest.quipsly.com");
  });

  it("defaults production links to Nest and preserves local development origins", () => {
    expect(
      resolveCalendarPublicOrigin("https://attacker.example/calendar", {
        NODE_ENV: "production",
      }),
    ).toBe("https://nest.quipsly.com");
    expect(
      resolveCalendarPublicOrigin("http://quipsly.test:3010/calendar", {
        NODE_ENV: "development",
      }),
    ).toBe("http://quipsly.test:3010");
  });

  it("rejects configured credentials, paths, and non-web protocols", () => {
    for (const value of [
      "https://person:secret@nest.quipsly.com",
      "https://nest.quipsly.com/private",
      "javascript://nest.quipsly.com",
    ]) {
      expect(() =>
        resolveCalendarPublicOrigin("http://localhost:3010", {
          QUIPSLY_APP_HOST: value,
          NODE_ENV: "production",
        }),
      ).toThrow(/origin is invalid/);
    }
  });
});
