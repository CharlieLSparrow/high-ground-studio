import React from "react";
import { AbsoluteFill, Sequence, Video, Audio } from "remotion";
import { TimelineState } from "./useTimelineState";

export const RemotionComposition: React.FC<{
  timeline: TimelineState;
}> = ({ timeline }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {timeline.clips.map((clip) => {
        const startFrame = Math.max(0, Math.round(clip.startIn * 30));
        const durationInFrames = Math.max(1, Math.round(clip.duration * 30));

        if (clip.trackId === "V1") {
          return (
            <Sequence
              key={clip.id}
              from={startFrame}
              durationInFrames={durationInFrames}
              name={`V1: ${clip.name}`}
            >
              <AbsoluteFill style={{ backgroundColor: clip.color, justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: 40, fontFamily: 'sans-serif', fontWeight: 'bold' }}>
                  {clip.name}
                </span>
              </AbsoluteFill>
            </Sequence>
          );
        } else if (clip.trackId === "A1" || clip.trackId === "A2") {
          // In a real app, this would be an <Audio src={proxyUrl} />
          return (
            <Sequence
              key={clip.id}
              from={startFrame}
              durationInFrames={durationInFrames}
              name={`${clip.trackId}: ${clip.name}`}
            >
              {/* Audio tracks don't render visually in Remotion, but we can render a debug overlay if we want */}
              <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 20 }}>
                <span style={{ color: 'white', fontSize: 20, opacity: 0.5 }}>
                  🔊 {clip.name}
                </span>
              </AbsoluteFill>
            </Sequence>
          );
        }
        
        return null;
      })}
    </AbsoluteFill>
  );
};
