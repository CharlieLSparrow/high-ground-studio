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
