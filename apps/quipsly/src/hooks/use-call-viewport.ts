"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Mobile keyboards can reduce the visible viewport without changing dvh.
 * Keep the call controls and work pane above it. Do not counteract pinch zoom. */
export function useCallViewport(open: boolean): CSSProperties | undefined {
  const [bounds, setBounds] = useState<{height: number; top: number} | null>(null);
  useEffect(() => {
    if (!open || !window.visualViewport) { setBounds(null); return; }
    const viewport = window.visualViewport;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      if (!Number.isFinite(viewport.height) || viewport.height <= 0 || Math.abs(viewport.scale - 1) > 0.05) {
        setBounds(null); return;
      }
      const height = Math.round(viewport.height);
      const top = Number.isFinite(viewport.offsetTop) ? Math.max(0, Math.round(viewport.offsetTop)) : 0;
      setBounds(current => current?.height === height && current.top === top ? current : {height, top});
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [open]);
  return open && bounds ? {height: bounds.height, maxHeight: bounds.height, top: bounds.top, bottom: "auto"} : undefined;
}
