import { browserRetainedStartFailure } from "./browser-retained-start-failure";

describe("browserRetainedStartFailure", () => {
  it("turns denied access into standard permission recovery without claiming the call ended", () => {
    const result = browserRetainedStartFailure(
      { name: "NotAllowedError", message: "Permission denied by system" },
      "video",
    );

    expect(result.category).toBe("permission");
    expect(result.message).toMatch(/Allow the camera or microphone for this site/i);
    expect(result.message).toMatch(/call is still connected/i);
    expect(result.message).not.toMatch(/NotAllowedError|Permission denied by system/);
    expect(result.technicalDetail).toBe(
      "NotAllowedError: Permission denied by system",
    );
  });

  it("explains a busy audio device and keeps the driver error as technical detail", () => {
    const result = browserRetainedStartFailure(
      { name: "NotReadableError", message: "Could not start audio source" },
      "audio",
    );

    expect(result.category).toBe("device-unavailable");
    expect(result.message).toMatch(/busy, disconnected, or unavailable/i);
    expect(result.message).toMatch(/Your call is still connected/i);
    expect(result.technicalDetail).toMatch(/Could not start audio source/);
  });

  it("names the failed constraint only in technical detail", () => {
    const result = browserRetainedStartFailure(
      {
        name: "OverconstrainedError",
        message: "No camera supports this request",
        constraint: "deviceId",
      },
      "video",
    );

    expect(result.category).toBe("unsupported-source");
    expect(result.message).toMatch(/Recording settings/i);
    expect(result.message).not.toMatch(/deviceId/);
    expect(result.technicalDetail).toMatch(/constraint: deviceId/);
  });

  it("uses a calm generic recovery for non-device failures", () => {
    const result = browserRetainedStartFailure(
      new Error("START receipt rejected"),
      "audio",
    );

    expect(result.category).toBe("recording-system");
    expect(result.message).toMatch(/high-quality recording couldn’t start/i);
    expect(result.message).toMatch(/call is still connected/i);
    expect(result.technicalDetail).toMatch(/START receipt rejected/);
  });
});
