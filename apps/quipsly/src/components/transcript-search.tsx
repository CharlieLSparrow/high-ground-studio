"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";

const literalPattern = (query: string, flags = "iu") => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

export function TranscriptSearch({segments, onHighlight}: {
  segments: readonly {id: string; text: string; speakerLabel: string | null}[];
  onHighlight: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const normalized = query.trim();
  const matches = useMemo(() => {
    if (!normalized) return [];
    const pattern = literalPattern(normalized);
    return segments.filter(segment => pattern.test(`${segment.speakerLabel ?? ""}\n${segment.text}`));
  }, [segments, normalized]);
  const selectedIndex = matches.findIndex(segment => segment.id === selected);
  function move(direction: number) {
    if (!matches.length) return;
    const index = selectedIndex < 0 ? direction > 0 ? 0 : matches.length - 1 : (selectedIndex + direction + matches.length) % matches.length;
    const segment = matches[index];
    setSelected(segment.id);
    document.getElementById(`transcript-segment-${encodeURIComponent(segment.id)}`)?.scrollIntoView({behavior: "smooth", block: "center"});
  }
  function change(value: string) {setQuery(value); setSelected(null); onHighlight(value.trim());}
  return <div role="search" aria-label="Search this transcript" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2">
    <label className="flex min-w-40 flex-1 items-center gap-2 px-2"><Search size={17} className="shrink-0 text-muted-foreground" /><span className="sr-only">Find in transcript</span><input type="search" value={query} onChange={event => change(event.target.value)} onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); move(event.shiftKey ? -1 : 1);} if (event.key === "Escape") {event.preventDefault(); change("");}}} placeholder="Find words or a speaker" className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
    {normalized ? <><span role="status" className="text-xs text-muted-foreground">{matches.length ? `${selectedIndex >= 0 ? `${selectedIndex + 1} of ` : ""}${matches.length} matching passage${matches.length === 1 ? "" : "s"}` : "No matching passages"}</span><button type="button" disabled={!matches.length} onClick={() => move(-1)} aria-label="Previous matching passage" className="grid size-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ArrowUp size={17} /></button><button type="button" disabled={!matches.length} onClick={() => move(1)} aria-label="Next matching passage" className="grid size-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ArrowDown size={17} /></button><button type="button" onClick={() => change("")} aria-label="Clear transcript search" className="grid size-11 place-items-center rounded-lg hover:bg-muted"><X size={17} /></button></> : null}
  </div>;
}

export function TranscriptSearchHighlight({text, query}: {text: string; query: string}) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(literalPattern(needle, "giu"))) {
    const index = match.index!;
    parts.push(text.slice(offset, index), <mark key={index} className="rounded bg-amber-200 px-0.5 text-amber-950">{match[0]}</mark>);
    offset = index + match[0].length;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
