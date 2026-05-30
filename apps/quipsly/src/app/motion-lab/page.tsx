"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment, Text, Center, Float, ContactShadows } from "@react-three/drei";
import { useRef, useState, Suspense } from "react";
import * as THREE from "three";
import { StudioNav } from "../studio-nav";

function InteractivePrimitive(props: any) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);
  const [clicked, setClick] = useState(false);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <mesh
      {...props}
      ref={meshRef}
      scale={clicked ? 1.5 : 1}
      onClick={(event) => setClick(!clicked)}
      onPointerOver={(event) => setHover(true)}
      onPointerOut={(event) => setHover(false)}
    >
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial 
        color={hovered ? "#3b82f6" : "#4ade80"} 
        roughness={0.1}
        metalness={0.8}
      />
    </mesh>
  );
}


function SpinningImagePlane({ imageUrl }: { imageUrl: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, imageUrl);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={[3, 0, 0]}>
      <planeGeometry args={[4, 4]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function MotionLab() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
    }
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <StudioNav />
      <main className="flex-1 flex flex-col p-6 relative">
        <header className="flex justify-between items-center mb-6 z-10">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white/90">
              Motion Lab
            </h1>
            <p className="text-zinc-500 font-mono text-sm">
              Interactive WebGL Prototyping powered by Three.js & React-Three-Fiber
            </p>
          </div>
          <div className="flex gap-2">
            <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded text-xs font-bold">WebGL Active</span>
            <span className="bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1 rounded text-xs font-bold">Orbit Controls</span>
          </div>
        </header>

        {/* 3D Canvas Workspace */}
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden relative shadow-2xl">
          
          <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md p-4 rounded border border-zinc-800 max-w-sm pointer-events-none">
            <h3 className="font-bold mb-2">Interactive Scene</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              This is a live WebGL canvas embedded directly into your Next.js application.
            </p>
            <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
              <li>Click & Drag to Orbit</li>
              <li>Scroll to Zoom</li>
              <li>Hover & Click the Object to interact</li>
            </ul>
          </div>

          <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
            <color attach="background" args={['#09090b']} />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            
            <Float
              speed={2} 
              rotationIntensity={0.5} 
              floatIntensity={1} 
              floatingRange={[0, 1]}
            >
              <Center position={[0, 1.5, 0]}>
                <Text
                  fontSize={1.2}
                  color="white"
                  font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.05}
                  outlineColor="#3b82f6"
                >
                  MOTION GRAPHICS
                </Text>
              </Center>
              <InteractivePrimitive position={[0, -1, 0]} />
            </Float>

                        {uploadedImage && (
              <Suspense fallback={null}>
                <SpinningImagePlane imageUrl={uploadedImage} />
              </Suspense>
            )}
            {/* Dynamic Environment Lighting */}
            <Environment preset="city" />
            
            {/* Ground Shadow */}
            <ContactShadows position={[0, -3.5, 0]} opacity={0.5} scale={15} blur={2} far={4} />
            
            <OrbitControls makeDefault minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2} />
          </Canvas>
          
                    <div className="absolute bottom-4 right-4 z-10 flex gap-2">
            <label className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded shadow-lg transition-colors pointer-events-auto cursor-pointer">
              Upload Image
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
            <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded shadow-lg transition-colors pointer-events-auto">
              Export as WebGL Component
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
