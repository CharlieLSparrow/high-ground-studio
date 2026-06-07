import { useEffect, useRef, useState } from "react";
import { useVideoConfig, Video, useCurrentFrame, interpolate } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TransformKeyframe } from "./useTimelineState";

type Video360PlayerProps = {
  src: string;
  startFrom?: number;
  endAt?: number;
  volume?: number;
  muted?: boolean;
  transforms?: TransformKeyframe[];
};

function interpolateKeyframes(
  frame: number,
  fps: number,
  keyframes: TransformKeyframe[],
  property: "scale" | "x" | "y" | "rotation",
  defaultValue: number
) {
  if (!keyframes || keyframes.length === 0) return defaultValue;

  const validKeyframes = keyframes.filter(k => k[property] !== undefined).sort((a, b) => a.timeOffset - b.timeOffset);

  if (validKeyframes.length === 0) return defaultValue;
  if (validKeyframes.length === 1) return validKeyframes[0][property] as number;

  const time = frame / fps;

  let prev = validKeyframes[0];
  let next = validKeyframes[validKeyframes.length - 1];

  for (let i = 0; i < validKeyframes.length; i++) {
    if (validKeyframes[i].timeOffset <= time) {
      prev = validKeyframes[i];
    }
    if (validKeyframes[i].timeOffset > time) {
      next = validKeyframes[i];
      break;
    }
  }

  if (prev === next || time >= next.timeOffset) return next[property] as number;
  if (time <= prev.timeOffset) return prev[property] as number;

  return interpolate(
    time,
    [prev.timeOffset, next.timeOffset],
    [prev[property] as number, next[property] as number],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
}

// Scene component to render the sphere with the video texture
function Scene360({ videoRef, transforms }: { videoRef: React.RefObject<HTMLVideoElement | null>, transforms?: TransformKeyframe[] }) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      const newTexture = new THREE.VideoTexture(videoRef.current);
      newTexture.colorSpace = THREE.SRGBColorSpace;
      newTexture.minFilter = THREE.LinearFilter;
      newTexture.magFilter = THREE.LinearFilter;

      // Flip texture horizontally because we are rendering on the inside of the sphere
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.repeat.x = -1;

      setTexture(newTexture);

      return () => {
        newTexture.dispose();
      };
    }
  }, [videoRef]);

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { camera } = useThree();

  useEffect(() => {
    if (!transforms || transforms.length === 0) return;

    // x = Yaw, y = Pitch, rotation = Roll, scale = FOV
    const pitch = interpolateKeyframes(frame, fps, transforms, "y", 0);
    const yaw = interpolateKeyframes(frame, fps, transforms, "x", 0);
    const roll = interpolateKeyframes(frame, fps, transforms, "rotation", 0);
    const fov = interpolateKeyframes(frame, fps, transforms, "scale", 90);

    camera.rotation.order = "YXZ";
    camera.rotation.set(
      THREE.MathUtils.degToRad(pitch),
      THREE.MathUtils.degToRad(yaw),
      THREE.MathUtils.degToRad(roll)
    );

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [frame, fps, transforms, camera]);

  const hasKeyframes = transforms && transforms.length > 0;

  return (
    <>
      <OrbitControls
        enableZoom={!hasKeyframes}
        enablePan={false}
        enableRotate={!hasKeyframes}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={-0.5} // Invert rotation to match natural drag inside a sphere
        target={[0, 0, 0.001]} // Slight offset to prevent gimbal lock
      />
      <mesh>
        <sphereGeometry args={[500, 60, 40]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          map={texture}
          color={texture ? 0xffffff : 0x000000}
        />
      </mesh>
    </>
  );
}

export function Video360Player({ src, startFrom = 0, endAt, volume = 1, muted = false, transforms }: Video360PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { width, height } = useVideoConfig();

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: "#000" }}>
      {/* Hidden video element managed by Remotion for frame sync */}
      <Video
        ref={videoRef}
        src={src}
        startFrom={startFrom}
        endAt={endAt}
        volume={volume}
        muted={muted}
        style={{ display: "none" }}
        crossOrigin="anonymous"
      />

      {/* ThreeCanvas connects React Three Fiber with Remotion's timeline */}
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, 0], fov: 90 }}
        style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      >
        <Scene360 videoRef={videoRef} transforms={transforms} />
      </ThreeCanvas>
    </div>
  );
}
