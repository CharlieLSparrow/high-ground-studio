"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  CONTENT_MODE_COOKIE,
  formatContentModeLabel,
  type ContentMode,
} from "@/lib/content-mode";

type ModeSwitcherClientProps = {
  currentMode: ContentMode;
  allowedModes: ContentMode[];
};

export default function ModeSwitcherClient({
  currentMode,
  allowedModes,
}: ModeSwitcherClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function updateMode(nextMode: ContentMode) {
    document.cookie = `${CONTENT_MODE_COOKIE}=${nextMode}; path=/; max-age=31536000; samesite=lax`;

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <label className="hidden items-center gap-1.5 lg:flex">
      <span className="sr-only">
        View
      </span>

      <select
        aria-label="Published site mode"
        value={currentMode}
        disabled={isPending}
        onChange={(event) => updateMode(event.target.value as ContentMode)}
        className="rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.82)] outline-none transition hover:border-[rgba(255,122,24,0.35)]"
      >
        {allowedModes.map((mode) => (
          <option key={mode} value={mode} className="text-black">
            {formatContentModeLabel(mode)}
          </option>
        ))}
      </select>
    </label>
  );
}
