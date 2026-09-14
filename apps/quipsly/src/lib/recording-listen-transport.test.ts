import { RecordingListenTransport, type ListenState } from "./recording-listen-transport";
import { recordingListenPlan } from "./recording-listen-plan";

class Media extends EventTarget {
  currentTime = 0; readyState = 3; seeking = false; paused = true; error = null;
  src = ""; preload = ""; volume = 1;
  play = jest.fn(async () => { this.paused = false; });
  pause = jest.fn(() => { this.paused = true; });
  removeAttribute = jest.fn(); load = jest.fn();
}
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function fixture(cuts = [{startSeconds: 5, endSeconds: 7}]) {
  const sources = [{id: "coach", label: "Coach", url: "/coach", offset: 0, duration: 20},
    {id: "client", label: "Client", url: "/client", offset: 2, duration: 18}];
  const media = sources.map(() => new Media());
  let clock = 0, frame: FrameRequestCallback | null = null;
  const changed = jest.fn<void, [ListenState]>();
  const player = new RecordingListenTransport(sources, recordingListenPlan(3, 12, cuts), changed, {
    media: source => media[sources.findIndex(item => item.id === source.id)]! as unknown as HTMLAudioElement,
    now: () => clock,
    frame: callback => { frame = callback; return 1; }, cancelFrame: () => { frame = null; },
  });
  return {player, media, changed, advance: async (seconds: number) => {
    clock += seconds * 1000;
    for (const item of media) if (!item.paused) item.currentTime += seconds;
    const tick = frame; frame = null; tick?.(clock); await flush();
  }};
}

test("streams both participant tracks at source offsets and skips cuts on one clock", async () => {
  const f = fixture();
  await f.player.start();
  expect(f.player.state.status).toBe("playing");
  expect(f.media.map(media => media.currentTime)).toEqual([3, 1]);
  await f.advance(2.1);
  expect(f.media[0]!.currentTime).toBeCloseTo(7.1);
  expect(f.media[1]!.currentTime).toBeCloseTo(5.1);
  expect(f.player.state.seconds).toBeCloseTo(2.1);
  await f.advance(5);
  expect(f.player.state.status).toBe("ended");
  expect(f.media.every(media => media.paused)).toBe(true);
  f.player.dispose();
});

test("seeks and resumes against edited output time, not original duration", async () => {
  const f = fixture();
  f.player.seek(3);
  await f.player.start();
  expect(f.media.map(media => media.currentTime)).toEqual([8, 6]);
  await f.advance(0.5);
  f.player.pause();
  expect(f.player.state.seconds).toBeCloseTo(3.5);
  await f.player.start();
  expect(f.media[0]!.currentTime).toBeCloseTo(8.5);
  f.player.dispose();
});

test("one buffering participant freezes the preview and resumes both together", async () => {
  const f = fixture();
  await f.player.start(); await f.advance(1);
  f.media[1]!.readyState = 0;
  f.media[1]!.dispatchEvent(new Event("waiting"));
  await flush();
  expect(f.player.state.status).toBe("loading");
  expect(f.media.every(media => media.paused)).toBe(true);
  f.media[1]!.readyState = 3; f.media[1]!.dispatchEvent(new Event("canplay"));
  await flush();
  expect(f.player.state.status).toBe("playing");
  expect(f.media.map(media => media.currentTime)).toEqual([4, 2]);
  f.player.dispose();
});

test("denied playback is visible and does not leave another participant playing", async () => {
  const f = fixture();
  f.media[1]!.play.mockRejectedValue(new DOMException("Playback denied", "NotAllowedError"));
  await f.player.start();
  expect(f.player.state).toMatchObject({status: "error", error: "Playback denied"});
  expect(f.media.every(media => media.paused)).toBe(true);
  f.player.dispose();
});

test("cancelled late playback never revives a stopped preview", async () => {
  const f = fixture(); let resolve!: () => void;
  f.media[0]!.play.mockImplementation(() => new Promise<void>(done => { resolve = () => { f.media[0]!.paused = false; done(); }; }));
  const pending = f.player.start(); await flush();
  f.player.pause(); resolve(); await pending; await flush();
  expect(f.player.state.status).toBe("paused");
  expect(f.media.every(media => media.paused)).toBe(true);
  f.player.dispose();
});

test("a stalled load times out and disposal cancels resources", async () => {
  jest.useFakeTimers();
  const f = fixture(); f.media[0]!.readyState = 0;
  const pending = f.player.start();
  await jest.advanceTimersByTimeAsync(15_001); await pending;
  expect(f.player.state.status).toBe("error");
  expect(f.player.state.error).toContain("too long");
  f.player.dispose();
  expect(f.media[0]!.removeAttribute).toHaveBeenCalledWith("src");
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test("a stalled play permission promise also times out", async () => {
  jest.useFakeTimers();
  const f = fixture(); f.media[0]!.play.mockImplementation(() => new Promise(() => {}));
  const pending = f.player.start(); await flush();
  await jest.advanceTimersByTimeAsync(15_001); await pending;
  expect(f.player.state.status).toBe("error");
  expect(f.media.every(media => media.paused)).toBe(true);
  f.player.dispose(); jest.useRealTimers();
});

test("a synchronous play failure releases timers and stops every track", async () => {
  jest.useFakeTimers();
  const f = fixture();
  f.media[0]!.play.mockImplementation(() => { throw new Error("Media unavailable"); });
  await f.player.start();
  expect(f.player.state).toMatchObject({status: "error", error: "Media unavailable"});
  expect(f.media.every(media => media.paused)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  f.player.dispose(); jest.useRealTimers();
});

test("invalid seek input cannot poison the output clock", async () => {
  const f = fixture();
  await f.player.start(NaN); await f.advance(0.5);
  expect(f.player.state).toMatchObject({status: "playing", seconds: 0.5});
  f.player.dispose();
});
