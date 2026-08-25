jest.mock("server-only", () => ({}));

import { privateMediaByteRange } from "./private-media-byte-range";

describe("privateMediaByteRange", () => {
  it("supports open, bounded, and suffix ranges", () => {
    expect(privateMediaByteRange("bytes=10-", 100)).toEqual({
      start: 10,
      end: 99,
    });
    expect(privateMediaByteRange("bytes=10-19", 100)).toEqual({
      start: 10,
      end: 19,
    });
    expect(privateMediaByteRange("bytes=-20", 100)).toEqual({
      start: 80,
      end: 99,
    });
  });

  it("rejects multipart, inverted, and out-of-bounds ranges", () => {
    expect(privateMediaByteRange("bytes=0-1,4-5", 100)).toBe("invalid");
    expect(privateMediaByteRange("bytes=20-10", 100)).toBe("invalid");
    expect(privateMediaByteRange("bytes=100-", 100)).toBe("invalid");
  });
});
