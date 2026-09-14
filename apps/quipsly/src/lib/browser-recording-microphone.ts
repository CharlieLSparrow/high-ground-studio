/** One microphone choice for the call and its independently owned master.
 * Disable samples, not the recorder: silence preserves duration and sync.
 * This controller is synchronous so privacy does not wait for a React effect
 * or a network-backed call mute acknowledgement. */
export class BrowserRecordingMicrophone {
  private muted = false;
  private stream: MediaStream | null = null;
  private listeners = new Set<() => void>();

  getMuted = () => this.muted;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setMuted(muted: boolean) {
    this.muted = muted;
    this.apply();
    this.listeners.forEach(listener => listener());
  }

  attach(stream: MediaStream) {
    this.stream = stream;
    this.apply(); // Includes a mute selected while permission was pending.
  }

  detach(stream: MediaStream) {
    if (this.stream === stream) this.stream = null;
  }

  private apply() {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !this.muted; });
  }
}
