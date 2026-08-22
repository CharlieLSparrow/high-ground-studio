"use client";

import { useEffect } from "react";

type QuipslyWakeLockSentinel = {
  readonly released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<QuipslyWakeLockSentinel>;
  };
};

export function useActiveMediaLifecycle({
  hasUnsavedMedia = false,
  keepScreenAwake = false,
  flushPendingMedia,
}: {
  hasUnsavedMedia?: boolean;
  keepScreenAwake?: boolean;
  flushPendingMedia?: () => void;
}) {
  useEffect(() => {
    if (!hasUnsavedMedia) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines still require returnValue even though browsers render
      // their own standard, non-customizable confirmation message.
      event.returnValue = true;
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingMedia?.();
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [flushPendingMedia, hasUnsavedMedia]);

  useEffect(() => {
    if (!keepScreenAwake) return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;

    let disposed = false;
    let sentinel: QuipslyWakeLockSentinel | null = null;
    const acquire = async () => {
      if (
        disposed
        || document.visibilityState !== "visible"
        || (sentinel && !sentinel.released)
      ) return;
      try {
        const acquired = await wakeLock.request("screen");
        if (disposed) {
          await acquired.release().catch(() => undefined);
          return;
        }
        sentinel = acquired;
      } catch {
        // Battery policy, browser support, and OS power mode may refuse this
        // convenience. The call and retained recorder remain authoritative.
      }
    };
    const reconcileVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else {
        const held = sentinel;
        sentinel = null;
        if (held && !held.released) void held.release().catch(() => undefined);
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", reconcileVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", reconcileVisibility);
      const held = sentinel;
      sentinel = null;
      if (held && !held.released) void held.release().catch(() => undefined);
    };
  }, [keepScreenAwake]);
}
