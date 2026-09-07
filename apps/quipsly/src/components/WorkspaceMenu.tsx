"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** A disclosure of ordinary links/actions, with keyboard and outside-click dismissal. */
export function WorkspaceMenu({ label, trigger, children, className = "", triggerClassName = "" }: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => { ref.current?.removeAttribute("open"); }, [pathname]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open");
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.removeAttribute("open");
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={ref} className={`group relative ${className}`} onClick={(event) => {
    if (event.target instanceof Element && event.target.closest("a[href]")) ref.current?.removeAttribute("open");
  }}>
    <summary aria-label={label} className={`flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-quipsly-peacock-700 ${triggerClassName}`}>{trigger}</summary>
    {children}
  </details>;
}
