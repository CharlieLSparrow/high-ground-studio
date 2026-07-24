import { clearCompletedJobs, getRenderJobs, submitRenderJob } from "./actions";

describe("render queue capability boundary", () => {
  it("does not create an in-memory job or claim success", async () => {
    const submitted = await submitRenderJob("Episode 4", { clips: [{ id: "private-source" }] });

    expect(submitted).toEqual({
      success: false,
      errorCode: "RECEIPT_BACKED_RENDER_WORKER_NOT_CONNECTED",
      error: expect.stringMatching(/No job was queued/i),
    });
    expect(await getRenderJobs()).toEqual([]);
    expect(await clearCompletedJobs()).toEqual(submitted);
  });
});
