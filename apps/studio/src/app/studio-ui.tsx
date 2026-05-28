import type { ReactNode } from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type StudioTone = "default" | "tag" | "node" | "source" | "review" | "danger";

const chipToneClassName: Record<StudioTone, string> = {
  default: "border-studio-line text-studio-muted",
  tag: "border-studio-tag/45 text-studio-tag",
  node: "border-studio-node/45 text-studio-node",
  source: "border-studio-source/45 text-studio-source",
  review: "border-studio-review/45 text-studio-review",
  danger: "border-studio-danger/50 text-studio-danger",
};

export const panelClassName =
  "min-w-0 rounded-xl border border-studio-line/40 bg-studio-panel/60 p-[18px] shadow-studio-panel backdrop-blur-xl transition-all duration-300";

export const cardClassName =
  "rounded-lg border border-studio-line/30 bg-black/25 backdrop-blur-md transition-all duration-300 hover:bg-black/35";

export const labelClassName =
  "m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim";

export const panelTitleClassName =
  "m-0 text-base uppercase leading-tight tracking-normal text-studio-ink";

export const panelCopyClassName =
  "mt-2.5 mb-0 text-[0.92rem] leading-relaxed text-studio-muted";

export const monoMetaClassName =
  "mt-1 break-words font-mono text-xs leading-relaxed text-studio-muted";

export const primaryButtonClassName =
  "mt-4 min-h-11 w-full rounded-lg border border-studio-tag/40 bg-studio-tag/15 px-4 py-2 font-black text-studio-tag backdrop-blur-sm transition-all duration-300 hover:bg-studio-tag/25 hover:border-studio-tag/60 shadow-[0_4px_12px_rgba(159,209,139,0.1)] disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim";

export const secondaryButtonClassName =
  "min-h-11 w-full rounded-lg border border-studio-danger/30 bg-studio-danger/10 px-4 py-2 font-black text-studio-danger backdrop-blur-sm transition-all duration-300 hover:bg-studio-danger/20 hover:border-studio-danger/50";

export function StudioChip({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: StudioTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center rounded-lg border bg-black/20 px-2 py-[5px] text-[0.72rem] font-extrabold uppercase leading-tight tracking-normal",
        chipToneClassName[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StudioGlyph({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-[42px] shrink-0 place-items-center rounded-lg border border-studio-tag/40 bg-studio-tag/10 text-[1.35rem] font-extrabold text-studio-tag",
        className,
      )}
      aria-hidden="true"
    >
      S
    </div>
  );
}
