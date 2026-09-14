/** Explain the recoverable setup problem without presenting device errors as
 * connection failures or copying provider diagnostics into the ordinary UI. */
export function browserMediaSetupMessage(error: unknown, input: "microphone" | "camera" | "microphone and camera" | "devices"): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const label = input === "devices" ? "Microphone or camera" : input[0].toUpperCase() + input.slice(1);
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return `${label} access is blocked. Allow access in this site's browser settings and your device's privacy settings, then try again.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No ${input === "devices" ? "microphone or camera" : input} was found. Check its connection or choose another device.`;
    case "NotReadableError":
    case "TrackStartError":
      return `${label} couldn't start. It may be in use by another app. Close other apps using it or choose another device, then try again.`;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return `The selected ${input === "devices" ? "device" : input} is no longer available with these settings. Refresh devices and choose it again.`;
    default:
      return `${label} couldn't start. Check its connection and browser access, then try again.`;
  }
}

/** Browser permission prompts can legitimately remain unanswered. Cancel the
 * owning UI operation instead of treating reading time as a device failure.
 * getUserMedia itself is not abortable, so dispose of a late stream too. */
export function requestBrowserMedia(
  mediaDevices: Pick<MediaDevices, "getUserMedia">,
  constraints: MediaStreamConstraints,
  signal: AbortSignal,
): Promise<MediaStream> {
  if (signal.aborted) return Promise.reject(new DOMException("Device setup cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Device setup cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new DOMException("Device setup cancelled", "AbortError");
      return mediaDevices.getUserMedia(constraints);
    }).then(stream => {
      if (settled || signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(stream);
    }, error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}
