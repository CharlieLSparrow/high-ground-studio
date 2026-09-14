import { listenProgramPosition, listenSourcePositions, type ListenSource, type ListenSpan } from "./recording-listen-plan";

export type ListenState = { status: "paused" | "loading" | "playing" | "ended" | "error"; seconds: number; error: string | null };
type Runtime = {
  media: (source: ListenSource) => HTMLAudioElement;
  ownsMedia?: boolean;
  now: () => number;
  frame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
};
const browserRuntime: Runtime = {
  media: () => new Audio(), now: () => performance.now(),
  frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
};

/** Streaming, non-destructive listening preview. Export still uses the media
 * renderer: HTML media seeks are not sample-accurate audio edits. */
export class RecordingListenTransport {
  state: ListenState = {status: "paused", seconds: 0, error: null};
  private entries: Array<{source: ListenSource; media: HTMLAudioElement; waiting: () => void; error: () => void}>;
  private controller: AbortController | null = null;
  private frameId: number | null = null;
  private anchorTime = 0;
  private anchorSeconds = 0;
  private activeIds = "";
  private spanStart = -1;
  private disposed = false;
  readonly duration: number;

  constructor(private sources: ListenSource[], private spans: ListenSpan[], private changed: (state: ListenState) => void,
    private runtime: Runtime = browserRuntime) {
    this.duration = spans.at(-1)?.outputEnd ?? 0;
    this.entries = sources.map(source => {
      const media = runtime.media(source);
      if (runtime.ownsMedia !== false) {
        media.preload = "metadata";
        media.src = source.url;
      }
      // Conservative audition gain; this is not the mastered delivery mix.
      media.volume = 1 / Math.max(1, sources.length);
      const waiting = () => {
        if (this.state.status === "playing" && this.activeIds.split("|").includes(source.id)) {
          const position = this.currentPosition();
          void this.start(position);
        }
      };
      const error = () => {
        if (this.state.status === "playing" || this.state.status === "loading") this.fail(`Could not play ${source.label}. Try again, or use the prepared preview.`);
      };
      media.addEventListener("waiting", waiting);
      media.addEventListener("error", error);
      return {source, media, waiting, error};
    });
  }

  private publish(update: Partial<ListenState>) { this.state = {...this.state, ...update}; this.changed(this.state); }
  private currentPosition() {
    return this.state.status === "playing" ? Math.min(this.duration, this.anchorSeconds + (this.runtime.now() - this.anchorTime) / 1000) : this.state.seconds;
  }
  private stopMedia() {
    if (this.frameId !== null) this.runtime.cancelFrame(this.frameId);
    this.frameId = null;
    this.controller?.abort(); this.controller = null;
    for (const {media} of this.entries) media.pause();
  }
  pause() {
    const seconds = this.currentPosition();
    this.stopMedia();
    this.publish({status: "paused", seconds});
  }
  seek(seconds: number) {
    const resume = this.state.status === "playing" || this.state.status === "loading";
    this.stopMedia();
    const bounded = Math.max(0, Math.min(this.duration, Number.isFinite(seconds) ? seconds : 0));
    this.publish({status: "paused", seconds: bounded, error: null});
    if (resume) void this.start(bounded);
  }
  private fail(error: string) {
    const seconds = this.currentPosition();
    this.stopMedia();
    this.publish({status: "error", seconds, error});
  }
  private ready(media: HTMLAudioElement, signal: AbortSignal, predicate: () => boolean) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        for (const name of ["loadedmetadata", "canplay", "seeked", "error"]) media.removeEventListener(name, check);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const check = () => { if (media.error) finish(new Error("The recording could not load.")); else if (predicate()) finish(); };
      const timeout = setTimeout(() => finish(new Error("The recording is taking too long to load. Try again.")), 15_000);
      for (const name of ["loadedmetadata", "canplay", "seeked", "error"]) media.addEventListener(name, check);
      signal.addEventListener("abort", abort, {once: true});
      if (signal.aborted) abort(); else check();
    });
  }
  private playMedia(media: HTMLAudioElement, controller: AbortController) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timeout); controller.signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const timeout = setTimeout(() => finish(new Error("Playback did not start. Press Listen to edit to try again.")), 15_000);
      controller.signal.addEventListener("abort", abort, {once: true});
      if (controller.signal.aborted) { abort(); return; }
      try {
        media.play().then(() => {
          if (controller.signal.aborted && (!this.controller || this.controller === controller)) media.pause();
          finish();
        }, finish);
      } catch (error) { finish(error); }
    });
  }
  async start(requestedSeconds = this.state.seconds) {
    if (this.disposed || !this.duration || !this.sources.length) return;
    this.stopMedia();
    const seconds = !Number.isFinite(requestedSeconds) || requestedSeconds >= this.duration ? 0 : Math.max(0, requestedSeconds);
    const position = listenProgramPosition(this.spans, seconds);
    if (!position) return;
    const active = listenSourcePositions(this.sources, position.seconds);
    this.activeIds = active.map(value => value.source.id).join("|");
    this.spanStart = position.span.outputStart;
    const controller = new AbortController();
    this.controller = controller;
    this.publish({status: "loading", seconds, error: null});
    try {
      await Promise.all(active.map(async value => {
        const media = this.entries.find(entry => entry.source.id === value.source.id)!.media;
        await this.ready(media, controller.signal, () => media.readyState >= 1);
        if (controller.signal.aborted) return;
        media.currentTime = value.seconds;
        await this.ready(media, controller.signal, () => !media.seeking && media.readyState >= 2);
      }));
      if (controller.signal.aborted) return;
      await Promise.all(active.map(async value => {
        const media = this.entries.find(entry => entry.source.id === value.source.id)!.media;
        // Stop/unmount can happen while a browser permission promise is open.
        await this.playMedia(media, controller);
      }));
      if (controller.signal.aborted) return;
      this.anchorTime = this.runtime.now(); this.anchorSeconds = seconds;
      this.publish({status: "playing"});
      this.frameId = this.runtime.frame(this.tick);
    } catch (error) {
      if (!controller.signal.aborted) this.fail(error instanceof Error ? error.message : "Playback could not start. Try again.");
    }
  }
  private tick = () => {
    if (this.disposed || this.state.status !== "playing") return;
    const seconds = this.currentPosition();
    if (seconds >= this.duration) {
      this.stopMedia(); this.publish({status: "ended", seconds: this.duration}); return;
    }
    const position = listenProgramPosition(this.spans, seconds)!;
    const active = listenSourcePositions(this.sources, position.seconds);
    const ids = active.map(value => value.source.id).join("|");
    const drifted = active.some(value => {
      const media = this.entries.find(entry => entry.source.id === value.source.id)!.media;
      return media.paused || media.seeking || media.readyState < 2 || Math.abs(media.currentTime - value.seconds) > 0.12;
    });
    if (position.span.outputStart !== this.spanStart || ids !== this.activeIds || drifted) {
      void this.start(seconds); return;
    }
    this.publish({seconds});
    this.frameId = this.runtime.frame(this.tick);
  };
  dispose() {
    this.disposed = true; this.stopMedia();
    for (const {media, waiting, error} of this.entries) {
      media.removeEventListener("waiting", waiting); media.removeEventListener("error", error);
      if (this.runtime.ownsMedia !== false) { media.removeAttribute("src"); media.load(); }
    }
  }
}
