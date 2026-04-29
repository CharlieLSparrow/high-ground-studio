"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  LAYOUT_VARIANT_COOKIE,
  formatLayoutVariantLabel,
  type LayoutVariant,
} from "@/lib/layout-variant";

type LayoutVariantSwitcherClientProps = {
  currentVariant: LayoutVariant;
  allowedVariants: LayoutVariant[];
};

export default function LayoutVariantSwitcherClient({
  currentVariant,
  allowedVariants,
}: LayoutVariantSwitcherClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function updateVariant(nextVariant: LayoutVariant) {
    document.cookie = `${LAYOUT_VARIANT_COOKIE}=${nextVariant}; path=/; max-age=31536000; samesite=lax`;

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <label className="hidden md:flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
        Layout
      </span>

      <select
        value={currentVariant}
        disabled={isPending}
        onChange={(event) =>
          updateVariant(event.target.value as LayoutVariant)
        }
        className="rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-light)] outline-none transition hover:border-[rgba(255,122,24,0.35)]"
      >
        {allowedVariants.map((variant) => (
          <option key={variant} value={variant} className="text-black">
            {formatLayoutVariantLabel(variant)}
          </option>
        ))}
      </select>
    </label>
  );
}
