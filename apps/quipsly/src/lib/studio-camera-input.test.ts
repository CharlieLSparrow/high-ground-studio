import {
  isCanonWebcamUtility,
  studioCameraFormatLabel,
  studioCameraInputEvidence,
} from "./studio-camera-input";

describe("studio camera input evidence", () => {
  it("recognizes Canon's virtual camera without mislabeling the camera body", () => {
    expect(isCanonWebcamUtility("EOS Webcam Utility")).toBe(true);
    expect(isCanonWebcamUtility("Canon EOS R8")).toBe(false);
  });

  it("preserves the browser-reported call format without claiming retained-master quality", () => {
    const evidence = studioCameraInputEvidence("EOS Webcam Utility", {
      deviceId: "canon-virtual",
      width: 1280,
      height: 720,
      frameRate: 28.75,
    });

    expect(evidence).toEqual({
      label: "EOS Webcam Utility",
      deviceId: "canon-virtual",
      width: 1280,
      height: 720,
      frameRate: 28.75,
    });
    expect(studioCameraFormatLabel(evidence)).toBe("1,280 × 720 · 28.75 fps");
  });

  it("states when a browser withholds format details", () => {
    expect(studioCameraFormatLabel(studioCameraInputEvidence("Camera", {}))).toBe(
      "resolution not reported · frame rate not reported",
    );
  });
});
