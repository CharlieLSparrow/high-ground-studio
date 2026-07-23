/** @jest-environment node */
jest.mock("@/lib/release-health", () => ({
  createCompatibilityHealthResponseBody: jest.fn().mockReturnValue({
    ok: true,
    service: "high-ground-studio",
  }),
  RELEASE_HEALTH_HEADERS: { "Cache-Control": "no-store" },
}));

import { GET } from "./route";

describe("Health API Route", () => {
  it("should return the health response body and headers", async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, service: "high-ground-studio" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
