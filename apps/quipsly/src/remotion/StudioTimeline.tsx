import { AbsoluteFill, Sequence, Video } from "remotion";

export const StudioTimeline: React.FC<{
  clips: Array<{ id: string; assetId: string; start: number; end: number; name: string }>;
  graphics: Array<{ id: string; start: number; end: number; text: string }>;
}> = ({ clips, graphics }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* 
        This translates the A-Roll EDL into a Sequence stack 
        In production, the 'src' would be pulled from the ComfyUI asset manager or local cache
      */}
      {clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={Math.floor(clip.start * 30)}
          durationInFrames={Math.floor((clip.end - clip.start) * 30)}
        >
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
             <h1 style={{ color: "white", fontSize: 100 }}>{clip.name}</h1>
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* 
        This translates the Graphics Track into overlays 
      */}
      {graphics.map((graphic) => (
        <Sequence
          key={graphic.id}
          from={Math.floor(graphic.start * 30)}
          durationInFrames={Math.floor((graphic.end - graphic.start) * 30)}
        >
          <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 100, alignItems: "center" }}>
            <h1 style={{ color: "gold", fontSize: 80, textShadow: "0 0 20px rgba(0,0,0,0.8)" }}>
              {graphic.text}
            </h1>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
