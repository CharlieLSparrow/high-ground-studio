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
    <label className="hidden md:flex items-center gap-2">
      <span className="sr-only">Content mode</span>

      <select
        value={currentMode}
        disabled={isPending}
        onChange={(event) => updateMode(event.target.value as ContentMode)}
        className="rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-light)] outline-none transition hover:border-[rgba(255,122,24,0.35)]"
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