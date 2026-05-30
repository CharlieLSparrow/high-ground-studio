/** @jest-environment node */
import { GET } from "./route";

describe("Telemetry API Route", () => {
  it("should return telemetry data and alert for a valid request", async () => {
    const mockRequest = new Request("http://localhost:3000/api/telemetry?videoId=Test-123");
    
    const response = await GET(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.videoId).toBe("Test-123");
    
    // Check alert logic
    expect(data.alert).toEqual({
      type: "SHARP_DROP",
      segmentIndex: 15,
      severity: "high",
      message: "24% drop detected in the Leadership cohort."
    });
    
    // Check data points
    expect(data.data.length).toBe(40);
    expect(data.data[0].segmentIndex).toBe(0);
    expect(data.data[15].retentionRate).toBeLessThan(data.data[14].retentionRate - 15);
  });

  it("should use a default videoId if not provided", async () => {
    const mockRequest = new Request("http://localhost:3000/api/telemetry");
    
    const response = await GET(mockRequest);
    const data = await response.json();
    
    expect(data.videoId).toBe("AI-Revolution-01");
  });
});
