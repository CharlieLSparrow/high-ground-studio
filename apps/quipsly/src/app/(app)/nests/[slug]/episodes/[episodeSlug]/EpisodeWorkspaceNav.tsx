import Link from "next/link";
import { AudioLines, BookOpenText, CheckCircle2, Mic2, Radio, Scissors, Send } from "lucide-react";

export type EpisodeWorkspaceMode = "plan" | "record" | "edit";

function episodeHref(projectSlug: string, episodeSlug: string, mode?: EpisodeWorkspaceMode) {
  const base = `/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episodeSlug)}`;
  if (!mode || mode === "plan") return base;
  return `${base}?mode=${mode}${mode === "record" ? "#record" : ""}`;
}

export function EpisodeWorkspaceNav({
  projectSlug,
  episodeSlug,
  activeMode,
  recordingRoomId,
}: {
  projectSlug: string;
  episodeSlug: string;
  activeMode: EpisodeWorkspaceMode;
  recordingRoomId?: string | null;
}) {
  const canonical = [
    { mode: "plan" as const, label: "Plan & collaborate", icon: BookOpenText },
    { mode: "record" as const, label: "Record", icon: Mic2 },
    { mode: "edit" as const, label: "Edit", icon: Scissors },
  ];
  const connected = [
    {
      label: "Audio",
      href: `/audio?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`,
      icon: AudioLines,
    },
    {
      label: "Review & finish",
      href: recordingRoomId
        ? `/sessions/${encodeURIComponent(recordingRoomId)}?mode=outputs`
        : `/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episodeSlug)}#production-runway`,
      icon: CheckCircle2,
    },
    {
      label: "Publish",
      href: `/publishing?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`,
      icon: Send,
    },
  ];

  return <nav aria-label="Episode workspace" className="flex w-full flex-wrap items-center gap-2">
    <span className="mr-1 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#83a390]"><Radio size={12} aria-hidden="true" />Episode workspace</span>
    {canonical.map(({ mode, label, icon: Icon }) => <Link
      key={mode}
      href={episodeHref(projectSlug, episodeSlug, mode)}
      aria-current={activeMode === mode ? "page" : undefined}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-wide transition ${activeMode === mode ? "border-[#d8ad56] bg-[#d8ad56] text-[#172018]" : "border-[#40584c] bg-[#17251e] text-[#f4eedf] hover:border-[#d8ad56]"}`}
    ><Icon size={14} aria-hidden="true" />{label}</Link>)}
    <span className="mx-1 hidden h-6 w-px bg-[#30483d] sm:block" aria-hidden="true" />
    {connected.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#40584c] bg-[#101b16] px-3 text-[10px] font-black uppercase tracking-wide text-[#c7d2ca] transition hover:border-[#d8ad56] hover:text-white"><Icon size={14} aria-hidden="true" />{label}</Link>)}
  </nav>;
}
