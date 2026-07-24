import { classifyRecorderEntryAccess } from "./recorder-entry-access";

describe("classifyRecorderEntryAccess", () => {
  it("allows only a verified database-backed Nest session", () => {
    expect(classifyRecorderEntryAccess({ mode: "database", status: "active" })).toBe("allowed");
  });

  it.each(["auth-required", "access-denied"])("fails closed for %s", (status) => {
    expect(classifyRecorderEntryAccess({ mode: "fallback", status })).toBe("denied");
  });

  it("does not treat an unverifiable database fallback as permission", () => {
    expect(classifyRecorderEntryAccess({ mode: "fallback", status: "fallback" })).toBe("unavailable");
  });
});
