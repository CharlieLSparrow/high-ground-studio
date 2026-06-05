"use client";

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere } from '@react-three/drei'
import * as THREE from 'three'
import { useState, useEffect } from 'react'

const AmbientLight = "ambientLight" as any;
const MeshBasicMaterial = "meshBasicMaterial" as any;
const VideoTexture = "videoTexture" as any;

interface ConsumerViewer360Props {
  videoUrl: string;
  startSeconds: number;
  endSeconds: number;
  initialCameraAngles?: { pan: number, tilt: number, zoom: number } | null;
}

export function ConsumerViewer360({ videoUrl, startSeconds, endSeconds, initialCameraAngles }: ConsumerViewer360Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  
  useEffect(() => {
    const vid = document.createElement('video');
    vid.src = videoUrl;
    vid.crossOrigin = 'Anonymous';
    vid.loop = false; // We handle loop manually for the segment range
    vid.playsInline = true;
    vid.muted = false;

    vid.currentTime = startSeconds;
    vid.play().catch(e => console.log("360 Autoplay prevented", e));
    
    const handleTimeUpdate = () => {
      if (vid.currentTime >= endSeconds) {
        vid.currentTime = startSeconds;
        vid.play().catch(e => console.log("360 Replay prevented", e));
      }
    };
    vid.addEventListener('timeupdate', handleTimeUpdate);

    setVideo(vid);

    return () => {
      vid.removeEventListener('timeupdate', handleTimeUpdate);
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    };
  }, [videoUrl, startSeconds, endSeconds]);

  if (!video) return <div className="absolute inset-0 bg-black flex items-center justify-center text-white/50 text-xs tracking-widest uppercase">Initializing 3D...</div>;

  return (
    <Canvas camera={{ position: [0, 0, 0.1], zoom: initialCameraAngles?.zoom || 1 }} className="absolute inset-0 cursor-move">
      <AmbientLight intensity={1} />
      <OrbitControls 
        enableZoom={false} // Disable zoom in consumer feed
        enablePan={false} 
        enableDamping={true} 
        dampingFactor={0.05} 
        rotateSpeed={0.5}
        target={[0, 0, 0]}
      />
      <Sphere args={[500, 60, 40]} rotation={initialCameraAngles ? [(initialCameraAngles.tilt * Math.PI) / 180, (initialCameraAngles.pan * Math.PI) / -180, 0] : [0, 0, 0]}>
        <MeshBasicMaterial side={THREE.BackSide}>
          <VideoTexture attach="map" args={[video]} />
        </MeshBasicMaterial>
      </Sphere>
    </Canvas>
  );
}
