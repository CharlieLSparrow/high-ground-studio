"use client";

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere } from '@react-three/drei'
import * as THREE from 'three'
import { useState, useEffect, MutableRefObject } from 'react'

interface Viewer360Props {
  videoUrl: string;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (time: number) => void;
  onDurationUpdate?: (duration: number) => void;
  onCameraMove?: (camera: THREE.Camera) => void;
  initialCameraAngles?: { x: number, y: number, z: number } | null;
}

export function Viewer360({ videoUrl, videoRef, onTimeUpdate, onDurationUpdate, onCameraMove, initialCameraAngles }: Viewer360Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  
  useEffect(() => {
    const vid = document.createElement('video');
    vid.src = videoUrl;
    vid.crossOrigin = 'Anonymous';
    vid.loop = true;
    vid.playsInline = true;
    
    vid.addEventListener('timeupdate', () => {
      onTimeUpdate?.(vid.currentTime);
    });
    
    vid.addEventListener('loadedmetadata', () => {
      onDurationUpdate?.(vid.duration);
    });

    setVideo(vid);
    
    if (videoRef) {
      videoRef.current = vid;
    }

    return () => {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    };
  }, [videoUrl, videoRef, onTimeUpdate]);

  if (!video) return <div className="flex items-center justify-center h-full text-white bg-black/50">Loading Video...</div>;

  return (
    <Canvas camera={{ position: [0, 0, 0.1] }}>
      <ambientLight intensity={1} />
      {/* 
        The OrbitControls handle dragging to look around.
        We disable pan so the user can't drag themselves out of the sphere center.
        We enable zoom for closer inspection.
      */}
      <OrbitControls 
        enableZoom={true} 
        enablePan={false} 
        enableDamping={true} 
        dampingFactor={0.05} 
        rotateSpeed={0.5}
        target={[0, 0, 0]}
        onChange={(e) => {
          if (onCameraMove && e?.target?.object) {
             onCameraMove(e.target.object as THREE.Camera);
          }
        }}
      />
      <Sphere args={[500, 60, 40]} rotation={initialCameraAngles ? [initialCameraAngles.x, initialCameraAngles.y, initialCameraAngles.z] : [0, 0, 0]}>
        <meshBasicMaterial side={THREE.BackSide}>
          <videoTexture attach="map" args={[video]} />
        </meshBasicMaterial>
      </Sphere>
    </Canvas>
  );
}
