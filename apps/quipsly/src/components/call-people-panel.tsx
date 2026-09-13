"use client";

import { Mic, MicOff, ScreenShare, Users } from "lucide-react";
import { useState } from "react";
import type { CallParticipant } from "./call-participant-gallery";

/** A view of the live transport roster, never another membership authority. */
export function CallPeoplePanel({ participants, sharingIdentities = [] }: {
  participants: CallParticipant[];
  sharingIdentities?: string[];
}) {
  const [query, setQuery] = useState("");
  const matches = participants.filter(person => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{participants.length} {participants.length === 1 ? "person" : "people"} in this call</p>
    </div>
    <label className="block text-sm font-medium">Find a person
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground" placeholder="Search by name" />
    </label>
    <ul aria-label="People in this call" className="space-y-2">
      {matches.map(person => <li key={person.identity} className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 p-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || <Users size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{person.name}{person.isLocal ? " (you)" : ""}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{sharingIdentities.includes(person.identity) ? <><ScreenShare size={13} />Sharing screen</> : person.speaking && !person.microphoneMuted ? "Speaking" : person.microphoneMuted ? "Microphone off" : "Microphone on"}</p>
        </div>
        {person.microphoneMuted ? <MicOff size={17} aria-label="Microphone off" className="shrink-0 text-muted-foreground" /> : <Mic size={17} aria-label="Microphone on" className={`shrink-0 ${person.speaking ? "text-primary" : "text-muted-foreground"}`} />}
      </li>)}
    </ul>
    {!matches.length ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">{query.trim() ? "No one matches that name." : "People will appear here when they join."}</p> : null}
  </div>;
}
