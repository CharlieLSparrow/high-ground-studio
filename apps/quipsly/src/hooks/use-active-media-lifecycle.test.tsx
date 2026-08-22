import { act, render } from "@testing-library/react";
import { useActiveMediaLifecycle } from "./use-active-media-lifecycle";

function Harness({
  hasUnsavedMedia = false,
  keepScreenAwake = false,
  flushPendingMedia,
}: {
  hasUnsavedMedia?: boolean;
  keepScreenAwake?: boolean;
  flushPendingMedia?: () => void;
}) {
  useActiveMediaLifecycle({
    hasUnsavedMedia,
    keepScreenAwake,
    flushPendingMedia,
  });
  return null;
}

describe("useActiveMediaLifecycle", () => {
  const originalWakeLock = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
  const originalVisibilityState = document.visibilityState;

  afterEach(() => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: originalWakeLock,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
    jest.restoreAllMocks();
  });

  it("warns only while media is unsaved and flushes a current chunk when hidden", () => {
    const flush = jest.fn();
    const { rerender } = render(
      <Harness hasUnsavedMedia flushPendingMedia={flush} />,
    );

    const activeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(activeUnload);
    expect(activeUnload.defaultPrevented).toBe(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(1);

    rerender(<Harness hasUnsavedMedia={false} flushPendingMedia={flush} />);
    const safeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(safeUnload);
    expect(safeUnload.defaultPrevented).toBe(false);
  });

  it("holds a supported screen wake lock only during active call work", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const release = jest.fn().mockResolvedValue(undefined);
    const request = jest.fn().mockResolvedValue({ released: false, release });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const { rerender } = render(<Harness keepScreenAwake />);
    await act(async () => undefined);
    expect(request).toHaveBeenCalledWith("screen");

    rerender(<Harness keepScreenAwake={false} />);
    await act(async () => undefined);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
