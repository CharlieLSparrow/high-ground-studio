import { Composition } from "remotion";
import { StudioTimeline } from "./StudioTimeline";

// This is the core Remotion Root component that defines the video targets
// It will parse the EDL payload (Edit Decision List) passed from the Video Editor

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HighGroundFinalCut"
        component={StudioTimeline}
        durationInFrames={1500} // This is dynamically overridden by the EDL
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: [],
          graphics: [],
        }}
      />
    </>
  );
};
