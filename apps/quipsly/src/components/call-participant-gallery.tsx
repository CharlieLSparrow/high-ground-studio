"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, MicOff, Pin, PinOff, ScreenShare } from "lucide-react";
import { Track, type RemoteTrack } from "livekit-client";

export type CallParticipant = {
  identity: string;
  name: string;
  speaking: boolean;
  isLocal: boolean;
  microphoneMuted: boolean;
};

export type CallParticipantVideo = { identity: string; key: string; track: RemoteTrack };

function ParticipantVideo({ track, name, screen }: {track: RemoteTrack; name: string; screen: boolean}) {
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
  const people = [...participants.filter(person => !person.isLocal), ...participants.filter(person => person.isLocal)];
  const shares = videos.filter(video => video.track.source === Track.Source.ScreenShare);
  const tiles = [
    ...people.map(person => ({id: person.identity, person, video: videos.find(video => video.identity === person.identity && video.track.source !== Track.Source.ScreenShare), screen: false})),
    ...shares.flatMap(video => {
      const person = people.find(candidate => candidate.identity === video.identity);
      return person ? [{id: `screen:${video.key}`, person, video, screen: true}] : [];
    }),
  ];
  const focused = tiles.some(tile => tile.id === pinned) ? pinned : null;
  useEffect(() => { if (pinned && !focused) setPinned(null); }, [pinned, focused]);

  return <section data-testid="call-video-stage" aria-label="Call participants"
    className="flex min-h-48 w-full min-w-0 max-w-full flex-1 flex-col gap-3">
    <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>{people.length} {people.length === 1 ? "person" : "people"} in call</span>
      {focused ? <button type="button" onClick={() => setPinned(null)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold hover:bg-muted"><PinOff size={15} />Show everyone equally</button> : <span>Gallery</span>}
    </div>
    <div className={`grid min-h-0 flex-1 gap-3 ${tiles.length === 2 && !focused ? "grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1" : tiles.length > 1 ? "grid-cols-2" : "grid-cols-1"} ${tiles.length > 4 && !focused ? "lg:grid-cols-3" : ""}`}>
      {tiles.map(({id, person, video, screen}) => {
        const isPinned = focused === id;
        const cameraOn = screen || (person.isLocal ? localCameraOn : Boolean(video));
        const muted = person.isLocal ? localMicrophoneMuted : person.microphoneMuted;
        const label = `${person.name}${person.isLocal ? " (you)" : ""}${screen ? " · screen" : ""}`;
        return <article key={id} aria-label={label} data-participant-identity={person.identity}
          className={`relative isolate min-h-36 w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-[#211a14] text-[#f5e8cf] ${isPinned ? "order-first col-span-full min-h-64 aspect-video" : focused ? "aspect-video max-h-44" : tiles.length === 2 ? "aspect-auto sm:aspect-video sm:self-center" : "aspect-video"} ${person.speaking && !screen ? "ring-2 ring-inset ring-[#b5c991]" : ""}`}>
          {!screen && person.isLocal ? <video ref={bindLocalVideo} muted playsInline aria-label="Your camera" className={`absolute inset-0 h-full w-full object-cover ${cameraOn ? "" : "invisible"}`} /> : video ? <ParticipantVideo track={video.track} name={person.name} screen={screen} /> : null}
          {!cameraOn && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-8">
            <div className="grid size-16 place-items-center rounded-full bg-[#514b36] text-2xl font-medium sm:size-20 sm:text-3xl" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || "?"}</div>
            <span className="inline-flex items-center gap-1 text-xs text-[#dfd0b8]"><CameraOff size={13} />Camera off</span>
          </div>}
          <button type="button" onClick={() => setPinned(isPinned ? null : id)} aria-label={`${isPinned ? "Unpin" : "Pin"} ${label}${isPinned ? "" : " for me"}`} aria-pressed={isPinned}
            className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-xl bg-black/55 text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {isPinned ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2 bg-gradient-to-t from-black/85 to-black/0 px-3 pb-3 pt-8 text-sm font-medium text-white">
            {screen ? <ScreenShare size={15} className="shrink-0" /> : muted ? <MicOff size={15} className="shrink-0" aria-label="Microphone muted" /> : null}
            <span className="truncate">{label}</span>
            {person.speaking && !screen && <span className="ml-auto shrink-0 text-xs text-[#c8dfac]">Speaking</span>}
          </div>
        </article>;
      })}
    </div>
    {people.length === 1 && <p className="text-center text-sm text-muted-foreground">You’re the first here. Others will appear when they join.</p>}
  </section>;
}
