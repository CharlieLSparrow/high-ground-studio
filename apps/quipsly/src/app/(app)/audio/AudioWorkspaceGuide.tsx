import { ArrowRight, Check, CircleAlert, LockKeyhole, Radio } from "lucide-react";

import type { AudioWorkspaceGuide as AudioWorkspaceGuideModel, AudioWorkspaceGuideState } from "./audio-mastery-workspace-model";

function stateStyle(state: AudioWorkspaceGuideState) {
  if (state === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (state === "attention") return "border-amber-300 bg-amber-50 text-amber-950";
  if (state === "held") return "border-rose-300 bg-rose-50 text-rose-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function StateIcon({ state }: { state: AudioWorkspaceGuideState }) {
  if (state === "complete") return <Check className="h-4 w-4" aria-hidden="true" />;
  if (state === "attention") return <CircleAlert className="h-4 w-4" aria-hidden="true" />;
  if (state === "held") return <LockKeyhole className="h-4 w-4" aria-hidden="true" />;
  return <Radio className="h-4 w-4" aria-hidden="true" />;
}

export function AudioWorkspaceGuide({ guide }: { guide: AudioWorkspaceGuideModel }) {
  return (
    <nav className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm" aria-labelledby="audio-workflow-guide-heading">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-800">Audio workflow</p>
          <h2 id="audio-workflow-guide-heading" className="mt-1 text-xl font-black">One source clock, one clear next step</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">These are projections over the retained source, processing, review, and delivery ledgers. Jumping never changes media.</p>
        </div>
        <a href={guide.next.href} className="group inline-flex min-h-12 max-w-xl items-center justify-between gap-4 rounded-xl bg-violet-900 px-4 py-3 text-left text-white shadow-sm hover:bg-violet-800">
          <span>
            <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-violet-200">Recommended next</span>
            <span className="mt-0.5 block text-sm font-black">{guide.next.label}</span>
            <span className="mt-0.5 block text-[10px] font-semibold leading-4 text-violet-100">{guide.next.detail}</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Audio workflow stages">
        {guide.items.map((item, index) => (
          <li key={item.id}>
            <a href={item.href} className={`block min-h-full rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${stateStyle(item.state)}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{index + 1}. {item.label}</span>
                <StateIcon state={item.state} />
              </span>
              <span className="mt-2 block text-xs font-black">{item.statusLabel}</span>
              <span className="mt-1 block text-[10px] font-semibold leading-4 opacity-80">{item.detail}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
