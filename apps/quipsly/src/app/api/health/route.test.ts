/** @jest-environment node */
import { GET } from "./route";

// We need to mock the lib functions since they might not be fully implemented or we just want unit tests.
jest.mock("@/lib/studio-health.mjs", () => ({
  createStudioHealthResponseBody: jest.fn().mockReturnValue({ status: "ok" }),
  STUDIO_HEALTH_HEADERS: { "X-Studio-Health": "1" },
}));

describe("Health API Route", () => {
  it("should return the health response body and headers", async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(response.headers.get("X-Studio-Health")).toBe("1");
  });
});
