"use client";

import { Activity, AlertTriangle, CheckCircle2, Layers3, RadioTower } from "lucide-react";

import type {
  EpisodeAudioActivityMap as ActivityMap,
  EpisodeAudioActivityMoment,
} from "@/lib/episode-audio-activity-map";

function timestamp(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function momentTone(kind: EpisodeAudioActivityMoment["kind"]) {
  if (kind === "possible-participant-overlap") return "border-amber-300 bg-amber-50 text-amber-950";
  if (kind === "same-participant-multidevice") return "border-indigo-300 bg-indigo-50 text-indigo-950";
  if (kind === "unassigned-energy") return "border-violet-300 bg-violet-50 text-violet-950";
  return "border-slate-300 bg-slate-50 text-slate-800";
}

export function EpisodeAudioActivityMap({
  map,
  selectedAssetId,
  onSelectTrack,
  onInspectMoment,
}: {
  map: ActivityMap;
  selectedAssetId: string | null;
  onSelectTrack: (assetId: string) => void;
  onInspectMoment: (moment: EpisodeAudioActivityMoment) => void;
}) {
  const tickSeconds = [0, 0.25, 0.5, 0.75, 1].map((fraction) => map.programDurationSeconds * fraction);
  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-slate-950 text-white shadow-xl" aria-labelledby="episode-audio-activity-heading">
      <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.16),_transparent_40%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200"><RadioTower className="h-4 w-4" aria-hidden="true" /> Program sound map</div>
            <h2 id="episode-audio-activity-heading" className="mt-1 text-xl font-black sm:text-2xl">Measured energy across the shared clock</h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Compare complete-decode source energy, alignment coverage, and listen-required attention regions. Energy is not speech, speaker identity, bleed, echo, or an edit decision.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[390px]">
            <div className="rounded-xl border border-cyan-900 bg-slate-900 px-2 py-2"><div className="font-mono text-base font-black text-cyan-100">{map.coverage.plottedTrackCount}/{map.coverage.trackCount}</div><div className="text-[9px] font-black uppercase tracking-wide text-cyan-300">Plotted</div></div>
            <div className="rounded-xl border border-cyan-900 bg-slate-900 px-2 py-2"><div className="font-mono text-base font-black text-cyan-100">{map.summary.possibleOverlapCount}</div><div className="text-[9px] font-black uppercase tracking-wide text-cyan-300">Overlap checks</div></div>
            <div className="rounded-xl border border-cyan-900 bg-slate-900 px-2 py-2"><div className="font-mono text-base font-black text-cyan-100">{map.moments.length}</div><div className="text-[9px] font-black uppercase tracking-wide text-cyan-300">Listen points</div></div>
          </div>
        </div>
        {!map.programClock ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div><div className="text-xs font-black">Choose a reviewed program clock first</div><p className="mt-1 text-[10px] font-semibold leading-4">{map.coverage.profiledTrackCount} source profile{map.coverage.profiledTrackCount === 1 ? " is" : "s are"} available, but Quipsly will not pretend they share time until one exact source owns the program clock.</p></div>
          </div>
        ) : map.coverage.plottedTrackCount === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-xs font-bold text-amber-100">The clock is explicit, but no contract-valid complete-decode profile is available on an eligible aligned track yet.</div>
        ) : null}
        {map.coverage.missingProfileCount || map.coverage.unalignedProfileCount || map.coverage.unidentifiedDialogueTrackCount ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black text-slate-300" aria-label="Program sound map coverage gaps">
            {map.coverage.missingProfileCount ? <span className="rounded-full border border-slate-700 px-2 py-1">{map.coverage.missingProfileCount} missing signal profile</span> : null}
            {map.coverage.unalignedProfileCount ? <span className="rounded-full border border-slate-700 px-2 py-1">{map.coverage.unalignedProfileCount} profile not on shared clock</span> : null}
            {map.coverage.unidentifiedDialogueTrackCount ? <span className="rounded-full border border-slate-700 px-2 py-1">{map.coverage.unidentifiedDialogueTrackCount} dialogue identity needed</span> : null}
          </div>
        ) : null}
      </div>

      {map.programClock && map.lanes.length > 0 ? (
        <div className="p-3 sm:p-4">
          {map.coverage.plottedTrackCount > 0 ? <div className="mb-2 ml-[min(42%,18rem)] flex justify-between font-mono text-[8px] font-bold text-slate-500" aria-hidden="true">{tickSeconds.map((second) => <span key={second}>{timestamp(second)}</span>)}</div> : <div className="mb-2 text-right text-[8px] font-black uppercase tracking-wide text-slate-600">Coverage only · shared-clock plot waits for eligible evidence</div>}
          <div className="space-y-1.5" aria-label="Aligned source energy lanes">
            {map.lanes.map((lane) => {
              const selected = lane.assetId === selectedAssetId;
              const plotted = lane.evidenceJobId && lane.programOffsetSeconds !== null;
              return (
                <button key={`${lane.assetId}:${lane.sourceId}`} type="button" aria-pressed={selected} onClick={() => onSelectTrack(lane.assetId)} className={`grid min-h-14 w-full grid-cols-[minmax(8rem,18rem)_1fr] items-center gap-2 rounded-lg border p-2 text-left ${selected ? "border-cyan-300 bg-cyan-950/40" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-black text-white">{lane.participantLabel || lane.title}</span>
                    <span className="mt-0.5 block truncate text-[8px] font-bold uppercase tracking-wide text-slate-400">{lane.role.replaceAll("-", " ")} · {lane.alignment.replaceAll("-", " ")}{lane.activityThresholdDbfs !== null ? ` · active ≥ ${lane.activityThresholdDbfs.toFixed(1)} dBFS` : ""}</span>
                  </span>
                  {plotted ? (
                    <svg viewBox="0 0 1000 36" className="h-9 w-full overflow-hidden rounded bg-slate-950" role="img" aria-label={`${lane.title}: ${lane.cells.filter((cell) => cell.energyActive).length} of ${lane.cells.length} display cells cross the measured-energy threshold.`} preserveAspectRatio="none">
                      {lane.cells.map((cell) => <rect key={cell.index} x={(cell.index / lane.cells.length) * 1000} y={cell.energyActive ? 5 : 15} width={Math.max(1.2, 1000 / lane.cells.length)} height={cell.energyActive ? 26 : 8} fill={cell.clippingObserved ? "#fb7185" : cell.energyActive ? "#22d3ee" : "#334155"} opacity={cell.energyActive ? 0.45 + cell.intensity * 0.55 : 0.45} />)}
                    </svg>
                  ) : <span className="flex h-9 items-center justify-center rounded border border-dashed border-slate-700 text-[9px] font-black text-slate-500">{lane.evidenceJobId ? "Needs qualified clock alignment" : "Build complete-decode signal profile"}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-slate-800 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200"><Activity className="h-4 w-4" aria-hidden="true" /> Listen-first attention</div><p className="mt-1 text-[9px] font-semibold leading-4 text-slate-400">Deterministic source-clock regions derived from each track's own energy distribution. Confirmation still requires protected playback.</p></div>
              {map.moments.length === 0 ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-[9px] font-black text-emerald-200"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> No derived region</span> : null}
            </div>
            {map.moments.length > 0 ? <div className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Program sound attention queue">{map.moments.slice(0, 12).map((moment) => (
              <button key={moment.id} type="button" onClick={() => onInspectMoment(moment)} className={`rounded-lg border p-3 text-left ${momentTone(moment.kind)}`}>
                <span className="flex items-center gap-2 text-[10px] font-black"><Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> <span className="font-mono">{timestamp(moment.startSeconds)}–{timestamp(moment.endSeconds)}</span> · {moment.label}</span>
                <span className="mt-1 block text-[9px] font-semibold leading-4 opacity-80">{moment.detail}</span>
              </button>
            ))}</div> : null}
            {map.moments.length > 12 ? <p className="mt-2 text-[9px] font-bold text-slate-500">Showing the first 12 of {map.moments.length} regions. A filtered, reviewable queue comes with the episode-analysis receipt phase.</p> : null}
          </div>
        </div>
      ) : null}
      <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 text-[9px] font-semibold leading-4 text-slate-400"><span className="font-black text-slate-200">No automatic mix has been written.</span> Qualified candidate alignment powers visual triage only; it does not move a clip or authorize attenuation.</div>
    </section>
  );
}
