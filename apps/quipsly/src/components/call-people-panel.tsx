"use client";

import { Mic, MicOff, ScreenShare, Users } from "lucide-react";
import { useState } from "react";
import { groupCallPeople, type CallParticipant } from "./call-roster";

/** A view of the live transport roster, never another membership authority. */
export function CallPeoplePanel({ participants, sharingIdentities = [] }: {
  participants: CallParticipant[];
  sharingIdentities?: string[];
}) {
  const [query, setQuery] = useState("");
  const people = groupCallPeople(participants);
  const matches = people.filter(person => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{people.length} {people.length === 1 ? "person" : "people"} in this call</p>
    </div>
    <label className="block text-sm font-medium">Find a person
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground" placeholder="Search by name" />
    </label>
    <ul aria-label="People in this call" className="space-y-2">
      {matches.map(person => <li key={person.key} className="flex min-w-0 items-start gap-3 rounded-xl bg-muted/60 p-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || <Users size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{person.name}{person.isLocal ? " (you)" : ""}</p>
          <div className="mt-1 space-y-2">{person.endpoints.map(device => <div key={device.identity} className="flex items-start gap-2 text-xs text-muted-foreground">
            {device.microphoneMuted ? <MicOff size={15} aria-label="Microphone off" className="mt-0.5 shrink-0" /> : <Mic size={15} aria-label="Microphone on" className={`mt-0.5 shrink-0 ${device.speaking ? "text-primary" : ""}`} />}
            <div className="min-w-0">
              {person.endpoints.length > 1 ? <p className="break-words font-medium text-foreground">{device.deviceLabel || "Device"}{device.isLocal ? " · this device" : ""}</p> : null}
              <p>{device.companion ? "Audio on another device" : device.speaking && !device.microphoneMuted ? "Speaking" : device.microphoneMuted ? "Microphone off" : "Microphone on"}</p>
              {sharingIdentities.includes(device.identity) ? <p className="flex items-center gap-1"><ScreenShare size={13} />Sharing screen</p> : null}
            </div>
          </div>)}</div>
        </div>
      </li>)}
    </ul>
    {!matches.length ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">{query.trim() ? "No one matches that name." : "People will appear here when they join."}</p> : null}
  </div>;
}
