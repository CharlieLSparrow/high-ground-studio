import type { DestinationPublicationState } from "@high-ground/quipsly-domain/publishing";
import {
  getDestinationLabel,
  getPublicationStatusLabel,
  publicationStatusClass,
} from "@/lib/publishing/statusModel";

export function DestinationStatusRail({
  states,
  compact = false,
}: {
  states: DestinationPublicationState[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid gap-2 md:grid-cols-2" : "grid gap-3 md:grid-cols-4"}>
      {states.map((state) => (
        <div
          key={state.destination}
          className="rounded-xl border border-[#e8dcc4] bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                {getDestinationLabel(state.destination)}
              </p>
              {state.remoteUrl ? (
                <a
                  href={state.remoteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-xs font-bold text-amber-700 hover:text-amber-900"
                >
                  Open remote
                </a>
              ) : null}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${publicationStatusClass(state.status)}`}>
              {getPublicationStatusLabel(state.status)}
            </span>
          </div>
          {state.notes ? (
            <p className="mt-2 text-xs leading-5 text-[#6b5b45]">{state.notes}</p>
          ) : null}
          {state.error ? (
            <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-800">
              {state.error}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
