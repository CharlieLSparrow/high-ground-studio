import { importedMediaProxyReadiness } from "./media-proxy-readiness";

describe("importedMediaProxyReadiness", () => {
  it("uses canonical media-asset readiness instead of contradictory import metadata", () => {
    expect(importedMediaProxyReadiness({
      proxyStatus: "ready",
      asset: { readiness: { hasProxy: false, needsProxy: true } },
    })).toEqual({
      ready: false,
      needed: true,
      status: "needed",
      source: "media-asset",
    });
  });

  it("uses import metadata only when no registered media-asset readiness exists", () => {
    expect(importedMediaProxyReadiness({ proxyStatus: "ready" })).toEqual({
      ready: true,
      needed: false,
      status: "ready",
      source: "import-metadata",
    });
  });

  it("never reports ready and needed at the same time", () => {
    const result = importedMediaProxyReadiness({
      proxyStatus: "queued",
      asset: { readiness: { hasProxy: true, needsProxy: true } },
    });

    expect(result).toEqual({
      ready: true,
      needed: false,
      status: "ready",
      source: "media-asset",
    });
  });
});
