export type StudioCameraInputEvidence = {
  label: string;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  deviceId: string | null;
};

export function isCanonWebcamUtility(label: string) {
  return /\beos webcam utility\b/i.test(label.trim());
}

function finitePositive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function studioCameraInputEvidence(
  label: string,
  settings: MediaTrackSettings,
): StudioCameraInputEvidence {
  return {
    label,
    width: finitePositive(settings.width),
    height: finitePositive(settings.height),
    frameRate: finitePositive(settings.frameRate),
    deviceId: settings.deviceId || null,
  };
}

export function studioCameraFormatLabel(evidence: StudioCameraInputEvidence) {
  const dimensions = evidence.width && evidence.height
    ? `${evidence.width.toLocaleString()} × ${evidence.height.toLocaleString()}`
    : "resolution not reported";
  const frameRate = evidence.frameRate
    ? `${evidence.frameRate.toFixed(evidence.frameRate % 1 ? 2 : 0)} fps`
    : "frame rate not reported";
  return `${dimensions} · ${frameRate}`;
}
