import { AbsoluteFill, Sequence, Video, Audio } from "remotion";
import React from "react";

// The EDL payload now passes the full timelineState
export const StudioTimeline: React.FC<{
  timelineState: any;
  projectSlug?: string;
  episodeSlug?: string;
}> = ({ timelineState }) => {
  const clips = timelineState?.clips || [];
  const loopClips = timelineState?.loopClips || [];

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* 
        A-Roll Video/Audio Tracks
      */}
      {clips.map((clip: any) => {
        const fromFrame = Math.floor(clip.startIn * 30);
        const durationFrames = Math.floor(clip.duration * 30);
        const sourceStartFrames = Math.floor(clip.sourceStart * 30);
        const sourceEndFrames = Math.floor(clip.sourceEnd * 30);

        return (
          <Sequence
            key={clip.id}
            from={fromFrame}
            durationInFrames={durationFrames}
            name={clip.name}
          >
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
              {clip.resolvedUrl ? (
                clip.kind === "audio" ? (
                  <Audio 
                    src={clip.resolvedUrl} 
                    startFrom={sourceStartFrames} 
                    endAt={sourceEndFrames} 
                    volume={clip.volume ?? 1} 
                  />
                ) : (
                  <Video 
                    src={clip.resolvedUrl} 
                    startFrom={sourceStartFrames} 
                    endAt={sourceEndFrames} 
                    volume={clip.volume ?? 1}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                  />
                )
              ) : (
                // Fallback if no resolved URL
                <h1 style={{ color: "white", fontSize: 100 }}>{clip.name} (Missing Media)</h1>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* 
        Graphics / Loop Clips
      */}
      {loopClips.map((graphic: any) => {
        const fromFrame = Math.floor(graphic.startSec * 30);
        const durationFrames = Math.floor((graphic.endSec - graphic.startSec) * 30);

        return (
          <Sequence
            key={graphic.id}
            from={fromFrame}
            durationInFrames={durationFrames}
            name={graphic.title}
          >
            <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 100, alignItems: "center" }}>
              <h1 style={{ color: "gold", fontSize: 80, textShadow: "0 0 20px rgba(0,0,0,0.8)" }}>
                {graphic.title}
              </h1>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
