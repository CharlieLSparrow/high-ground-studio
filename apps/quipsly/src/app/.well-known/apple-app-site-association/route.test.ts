/** @jest-environment node */

import { GET } from "./route";

describe("Quipsly Capture associated domains", () => {
  it("serves a direct, narrowly scoped Apple association document", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.applinks.details).toEqual([expect.objectContaining({
      appIDs: ["585GUXMY5M.com.highgroundodyssey.HighGroundCapture"],
      components: expect.arrayContaining([
        expect.objectContaining({ "/": "/open/capture/write" }),
        expect.objectContaining({ "/": "/open/capture/writing/*" }),
        expect.objectContaining({ "/": "/sessions/*", "?": { open: "capture" } }),
      ]),
    })]);
    expect(JSON.stringify(body)).not.toMatch(/token|secret|password/i);
  });
});
