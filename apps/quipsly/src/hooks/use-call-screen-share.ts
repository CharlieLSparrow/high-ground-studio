"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, Track, type LocalTrack, type Room } from "livekit-client";
import type { CallParticipantVideo } from "@/components/call-participant-gallery";

/** Own only presentation tracks. Camera, mic and source recording have separate lifetimes. */
export function useCallScreenShare(room: Room | null) {
  const [videos, setVideos] = useState<CallParticipantVideo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRoom = useRef(room);
  activeRoom.current = room;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const owned = useRef<LocalTrack[]>([]);
  const release = useCallback(async (owner: Room, tracks: LocalTrack[]) => {
    // Stop capture synchronously even if signaling cannot reach the server.
    tracks.forEach(track => track.stop());
    await Promise.allSettled(tracks.map(track => owner.localParticipant.unpublishTrack(track)));
  }, []);

  const stop = useCallback(async () => {
    generation.current++;
    inFlight.current = false;
    setBusy(false);
    setVideos([]);
    const tracks = owned.current;
    owned.current = [];
    if (room) await release(room, tracks);
  }, [room, release]);

  useEffect(() => {
    setVideos([]); setBusy(false); setError(null);
    inFlight.current = false;
    return () => {
      generation.current++;
      const tracks = owned.current;
      owned.current = [];
      if (room) void release(room, tracks);
    };
  }, [room, release]);

  const start = useCallback(async () => {
    if (!room || room.state !== ConnectionState.Connected || inFlight.current || owned.current.length) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing isn't available in this browser. You can still view another person's presentation.");
      return;
    }
    const attempt = ++generation.current;
    const current = () => generation.current === attempt && activeRoom.current === room && room.state !== ConnectionState.Disconnected;
    inFlight.current = true; setBusy(true); setError(null);
    let tracks: LocalTrack[] = [];
    try {
      tracks = await room.localParticipant.createScreenTracks({
        audio: true, selfBrowserSurface: "exclude", systemAudio: "exclude",
        surfaceSwitching: "include", contentHint: "detail",
      });
      // Never publish a picker result returned after Cancel, Leave, or a room switch.
      if (!current()) { await release(room, tracks); return; }
      if (!tracks.some(track => track.kind === Track.Kind.Video && track.mediaStreamTrack.readyState !== "ended")) {
        throw new Error("No live screen was selected.");
      }
      owned.current = tracks;
      const screenTracks = tracks.filter(track => track.kind === Track.Kind.Video);
      // The browser can end capture while publication is still awaiting signaling.
      screenTracks.forEach(track => track.mediaStreamTrack.addEventListener("ended", () => { if (current()) void stop(); }, {once: true}));
      for (const track of tracks) {
        if (!current()) { await release(room, tracks); return; }
        await room.localParticipant.publishTrack(track, {
          source: track.kind === Track.Kind.Video ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio,
        });
      }
      if (!current()) { await release(room, tracks); return; }
      if (screenTracks.some(track => track.mediaStreamTrack.readyState === "ended")) {
        await stop();
        return;
      }
      setVideos(screenTracks.map(track => ({identity: room.localParticipant.identity, key: track.sid || track.mediaStreamTrack.id, track})));
    } catch (failure) {
      await release(room, tracks);
      if (!current()) return;
      owned.current = [];
      // Dismissing the browser picker is normal, not a call failure.
      if (!(failure instanceof Error && ["NotAllowedError", "AbortError"].includes(failure.name))) {
        setError("Your screen couldn't be shared. Try again; your call is still connected.");
      }
    } finally {
      if (current()) { inFlight.current = false; setBusy(false); }
    }
  }, [room, release, stop]);

  return {videos, sharing: videos.length > 0, busy, error, start, stop};
}
