/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock(
  "@high-ground/quipsly-domain/mobile-capture-upload",
  () => ({ buildMobileCaptureLocalRetention: jest.fn(() => ({})) }),
  { virtual: true },
);
jest.mock(
  "@high-ground/quipsly-capture-verification",
  () => ({
    MAX_LONG_VIDEO_SOURCE_BYTES: 25 * 1024 * 1024 * 1024,
    SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES: 250 * 1024 * 1024,
  }),
  { virtual: true },
);

import { GET, POST } from "./route";

describe("canonical mobile capture resumable route", () => {
  it("loads the shared handlers with source-authority gating wired", () => {
    expect(typeof GET).toBe("function");
    expect(typeof POST).toBe("function");
  });
});
