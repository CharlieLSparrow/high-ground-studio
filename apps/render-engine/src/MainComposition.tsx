import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Video } from "remotion";

export const MainComposition: React.FC<{
  titleText: string;
  titleColor: string;
}> = ({ titleText, titleColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    fps,
    frame,
  });

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {/* We will map over timeline clips here in the future */}
        <div style={{
          fontSize: 60,
          fontWeight: "bold",
          color: titleColor,
          transform: `scale(${scale})`,
          opacity: opacity,
        }}>
          {titleText}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
