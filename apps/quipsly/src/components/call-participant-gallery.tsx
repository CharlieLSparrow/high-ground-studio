"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CameraOff, ChevronLeft, ChevronRight, Eye, EyeOff, MicOff, Pin, PinOff, ScreenShare } from "lucide-react";
import { Track, type RemoteTrack, type LocalTrack } from "livekit-client";
import { callGalleryGrid, callGalleryPage, nextCallSpeaker, type CallView } from "./call-gallery-layout";

export type CallParticipant = {
  identity: string;
  name: string;
  speaking: boolean;
  isLocal: boolean;
  microphoneMuted: boolean;
};

export type CallParticipantVideo = { identity: string; key: string; track: RemoteTrack | LocalTrack };

function ParticipantVideo({ track, name, screen }: {track: RemoteTrack | LocalTrack; name: string; screen: boolean}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    // Video elements never own call audio. Layout changes cannot double it.
    element.muted = true;
    return () => { track.detach(element); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted aria-label={`${name} ${screen ? "screen" : "camera"}`}
    className={`absolute inset-0 h-full w-full ${screen ? "object-contain" : "object-cover"}`} />;
}

/** People, not subscribed tracks, define the stage. Pinning changes only this
 * viewer's layout and never moves recording or call transport ownership. */
export function CallParticipantGallery({ participants, videos, bindLocalVideo, localCameraOn, localMicrophoneMuted }: {
  participants: CallParticipant[];
  videos: CallParticipantVideo[];
  bindLocalVideo: (element: HTMLVideoElement | null) => void;
  localCameraOn: boolean;
  localMicrophoneMuted: boolean;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [view, setView] = useState<CallView>("gallery");
  const [hideSelf, setHideSelf] = useState(false);
  const [ignoredShare, setIgnoredShare] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({width: 960, height: 540});
  const stage = useRef<HTMLDivElement>(null);
  const people = [...participants.filter(person => !person.isLocal), ...participants.filter(person => person.isLocal)];
  const shares = videos.filter(video => video.track.source === Track.Source.ScreenShare);
  const tiles = [
    ...people.map(person => ({id: person.identity, person, video: videos.find(video => video.identity === person.identity && video.track.source !== Track.Source.ScreenShare), screen: false})),
    ...shares.flatMap(video => {
      const person = people.find(candidate => candidate.identity === video.identity);
      return person ? [{id: `screen:${video.key}`, person, video, screen: true}] : [];
    }),
  ];
  const visibleTiles = tiles.filter(tile => !hideSelf || !tile.person.isLocal || tile.screen);
  const focused = visibleTiles.find(tile => tile.id === pinned)?.id ?? null;
  const share = visibleTiles.find(tile => tile.screen)?.id ?? null;
  const candidateSpeaker = nextCallSpeaker(people, speaker);
  const stableSpeaker = visibleTiles.find(tile => tile.id === speaker)?.id
    ?? visibleTiles.find(tile => !tile.screen && !tile.person.isLocal)?.id
    ?? visibleTiles[0]?.id ?? null;
  const presentation = focused ?? (share !== ignoredShare ? share : null) ?? (view === "speaker" ? stableSpeaker : null);
  const others = visibleTiles.filter(tile => tile.id !== presentation);
  const capacity = presentation ? (size.width >= 720 ? 4 : 3) : size.width < 600 ? 4 : 9;
  const paged = callGalleryPage(presentation ? others : visibleTiles, page, capacity);
  const shown = new Set([...paged.items.map(tile => tile.id), ...(presentation ? [presentation] : [])]);
  const grid = callGalleryGrid(paged.items.length, size.width, size.height);
  const sideStrip = size.width >= 720;
  const stripCount = Math.max(1, paged.items.length);
  const gridStyle: CSSProperties = presentation && paged.items.length ? sideStrip ? {
    gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 22%)",
    gridTemplateRows: "repeat(4, minmax(0, 1fr))",
  } : {
    gridTemplateColumns: `repeat(${stripCount}, minmax(0, 1fr))`,
    gridTemplateRows: "minmax(0, 1fr) minmax(72px, 24%)",
  } : {gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`};
  useEffect(() => { if (pinned && !focused) setPinned(null); }, [pinned, focused]);
  useEffect(() => { if (page !== paged.page) setPage(paged.page); }, [page, paged.page]);
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        const width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height);
        setSize(current => current.width === width && current.height === height ? current : {width, height});
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (candidateSpeaker === speaker) return;
    // A cough or quick acknowledgement should not cause an immediate cut.
    const timer = setTimeout(() => setSpeaker(candidateSpeaker), 1_200);
    return () => clearTimeout(timer);
  }, [candidateSpeaker, speaker]);

  function chooseView(next: CallView) {
    setView(next); setPinned(null); setIgnoredShare(share); setPage(0);
  }

  return <section data-testid="call-video-stage" aria-label="Call participants"
    className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-3">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{people.length} {people.length === 1 ? "person" : "people"} in call</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {focused || (share && presentation === share) ? <button type="button" onClick={() => chooseView("gallery")} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-muted"><PinOff size={15} />Back to gallery</button> : null}
        <label className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2">View
          <select aria-label="Call view" value={view} onChange={event => chooseView(event.target.value as CallView)} className="min-h-11 rounded-lg border border-border bg-card px-2 text-sm text-foreground">
            <option value="gallery">Gallery</option><option value="speaker">Speaker</option>
          </select>
        </label>
        {people.some(person => person.isLocal) ? <button type="button" onClick={() => {setHideSelf(current => !current); setPage(0);}} aria-pressed={hideSelf} title="Only changes your view. Others can still see your camera." className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-muted">
          {hideSelf ? <Eye size={16} /> : <EyeOff size={16} />}<span>{hideSelf ? "Show self" : "Hide self"}</span>
        </button> : null}
      </div>
    </div>
    <div ref={stage} data-testid="call-gallery-grid" data-view={presentation ? "focus" : "gallery"} style={gridStyle} className="grid min-h-24 flex-1 gap-3">
      {tiles.map(({id, person, video, screen}) => {
        const isPinned = presentation === id;
        const tileHeight = presentation ? isPinned ? size.height : sideStrip ? size.height / 4 : size.height * .24 : size.height / grid.rows;
        const compactTile = tileHeight < 180;
        const thumbnailIndex = paged.items.findIndex(tile => tile.id === id);
        const tileStyle: CSSProperties = presentation && paged.items.length ? isPinned
          ? {gridColumn: sideStrip ? "1" : "1 / -1", gridRow: sideStrip ? "1 / -1" : "1"}
          : {gridColumn: sideStrip ? "2" : String(thumbnailIndex + 1), gridRow: sideStrip ? String(thumbnailIndex + 1) : "2"}
          : {};
        const cameraOn = screen || (person.isLocal ? localCameraOn : Boolean(video));
        const muted = person.isLocal ? localMicrophoneMuted : person.microphoneMuted;
        const label = `${person.name}${person.isLocal ? " (you)" : ""}${screen ? " · screen" : ""}`;
        return <article key={id} aria-label={label} data-participant-identity={person.identity} data-focused={isPinned} hidden={!shown.has(id)} style={tileStyle}
          className={`relative isolate min-h-0 w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-[#211a14] text-[#f5e8cf] ${isPinned ? "h-full" : presentation ? "aspect-video max-h-full self-start" : "aspect-video max-h-full self-center"} ${person.speaking && !screen ? "ring-2 ring-inset ring-[#b5c991]" : ""}`}>
          {!screen && person.isLocal ? <video ref={bindLocalVideo} muted playsInline aria-label="Your camera" className={`absolute inset-0 h-full w-full object-cover ${cameraOn ? "" : "invisible"}`} /> : video ? <ParticipantVideo track={video.track} name={person.name} screen={screen} /> : null}
          {!cameraOn && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-8">
            <div className={`grid place-items-center rounded-full bg-[#514b36] font-medium ${compactTile ? "size-10 text-lg" : "size-16 text-2xl sm:size-20 sm:text-3xl"}`} aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || "?"}</div>
            {!compactTile && <span className="inline-flex items-center gap-1 text-xs text-[#dfd0b8]"><CameraOff size={13} />Camera off</span>}
          </div>}
          <button type="button" onClick={() => {setPinned(focused === id ? null : id); setPage(0);}} aria-label={`${focused === id ? "Unpin" : "Pin"} ${label}${focused === id ? "" : " for me"}`} aria-pressed={focused === id}
            className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-xl bg-black/55 text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {focused === id ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2 bg-gradient-to-t from-black/85 to-black/0 px-3 pb-3 pt-8 text-sm font-medium text-white">
            {screen ? <ScreenShare size={15} className="shrink-0" /> : muted ? <MicOff size={15} className="shrink-0" aria-label="Microphone muted" /> : null}
            <span className="truncate">{label}</span>
            {person.speaking && !screen && <span className="ml-auto shrink-0 text-xs text-[#c8dfac]">Speaking</span>}
          </div>
        </article>;
      })}
      {!visibleTiles.length && <div className="col-span-full grid min-h-48 place-items-center rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">{hideSelf ? "Your self-view is hidden. Others will appear here when they join." : "Connecting to the call…"}</div>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
      {hideSelf && <span className="sr-only" role="status">Self-view hidden. Your camera setting has not changed.</span>}
      {people.length === 1 && !hideSelf && <p data-testid="call-gallery-waiting">You’re the first here. Others will appear when they join.</p>}
      {paged.pageCount > 1 && <nav aria-label="Participant pages" className="flex items-center gap-3">
        <button type="button" aria-label="Previous participants" disabled={!paged.page} onClick={() => setPage(paged.page - 1)} className="grid size-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ChevronLeft size={18} /></button>
        <span className="tabular-nums" aria-live="polite">{paged.page + 1} / {paged.pageCount}</span>
        <button type="button" aria-label="Next participants" disabled={paged.page + 1 >= paged.pageCount} onClick={() => setPage(paged.page + 1)} className="grid size-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ChevronRight size={18} /></button>
      </nav>}
    </div>
  </section>;
}
