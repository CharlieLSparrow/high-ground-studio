/** @jest-environment node */

import { GET } from "./route";

describe("Apple app-site association", () => {
  it("associates only explicit Capture Session handoffs", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["585GUXMY5M.com.highgroundodyssey.HighGroundCapture"],
            components: [
              {
                "/": "/sessions/*",
                "?": { open: "capture" },
                comment: expect.stringContaining("without carrying invitation"),
              },
            ],
          },
        ],
      },
    });
  });
});
