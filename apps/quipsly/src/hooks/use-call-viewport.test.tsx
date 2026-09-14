import { act, renderHook } from "@testing-library/react";
import { useCallViewport } from "./use-call-viewport";

class Viewport extends EventTarget {
  height = 800; offsetTop = 0; scale = 1;
}
const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
let viewport: Viewport;
beforeEach(() => {
  jest.useFakeTimers();
  viewport = new Viewport();
  Object.defineProperty(window, "visualViewport", {configurable: true, value: viewport});
});
afterEach(() => {
  if (descriptor) Object.defineProperty(window, "visualViewport", descriptor);
  else Reflect.deleteProperty(window, "visualViewport");
  jest.useRealTimers();
});
function update(event = "resize") { act(() => { viewport.dispatchEvent(new Event(event)); jest.advanceTimersByTime(20); }); }

it("fits the call above a keyboard and restores it when the keyboard closes", () => {
  const {result} = renderHook(() => useCallViewport(true));
  expect(result.current).toEqual({height: 800, maxHeight: 800, top: 0, bottom: "auto"});
  viewport.height = 430; viewport.offsetTop = 52;
  update();
  expect(result.current).toEqual({height: 430, maxHeight: 430, top: 52, bottom: "auto"});
  viewport.height = 800; viewport.offsetTop = 0;
  update("scroll");
  expect(result.current?.height).toBe(800);
  expect(result.current?.top).toBe(0);
});

it("does not undo pinch zoom or retain invalid measurements", () => {
  const {result} = renderHook(() => useCallViewport(true));
  viewport.scale = 2; viewport.height = 400; update();
  expect(result.current).toBeUndefined();
  viewport.scale = 1; viewport.height = NaN; update();
  expect(result.current).toBeUndefined();
  viewport.height = 0; update();
  expect(result.current).toBeUndefined();
});

it("cleans up when minimized and measures again when reopened", () => {
  const removed = jest.spyOn(viewport, "removeEventListener");
  const {result, rerender, unmount} = renderHook(({open}) => useCallViewport(open), {initialProps: {open: true}});
  rerender({open: false});
  expect(result.current).toBeUndefined();
  expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
  viewport.height = 650;
  rerender({open: true});
  expect(result.current?.height).toBe(650);
  act(() => viewport.dispatchEvent(new Event("resize")));
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("falls back to CSS viewport sizing when the API is unavailable", () => {
  Object.defineProperty(window, "visualViewport", {configurable: true, value: null});
  const {result} = renderHook(() => useCallViewport(true));
  expect(result.current).toBeUndefined();
});
