"use client";

import { StudioNav } from "../studio-nav";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";

interface TelemetryPoint {
  segmentIndex: number;
  timestamp: number;
  retentionRate: number;
}

function BarChart3D() {
  const [data, setData] = useState<TelemetryPoint[]>([]);

  useEffect(() => {
    fetch("/api/telemetry?videoId=AI-Revolution-01")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success && payload.data) {
          setData(payload.data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch telemetry", err);
      });
  }, []);

  const bars = useMemo(() => {
    if (data.length === 0) {
      // Fallback/Loading static view
      return Array.from({ length: 40 }).map((_, i) => {
        const height = Math.max(0.5, Math.random() * 5);
        const isDrop = i === 15 || i === 16;
        return {
          position: [(i - 20) * 0.3, height / 2, 0] as [number, number, number],
          height,
          color: isDrop ? "#ef4444" : "#3f3f46",
        };
      });
    }

    return data.map((point) => {
      // Map retention rate (0 - 100) to height (0.5 - 5.0)
      const height = Math.max(0.5, (point.retentionRate / 100) * 5);
      const isDrop = point.segmentIndex === 15 || point.segmentIndex === 16;
      return {
        position: [(point.segmentIndex - 20) * 0.3, height / 2, 0] as [number, number, number],
        height,
        color: isDrop ? "#ef4444" : "#10b981", // red-500 for drop, emerald-500 for good retention
      };
    });
  }, [data]);

  return (
    <group position={[0, -2.5, 0]}>
      {bars.map((bar, i) => (
        <mesh key={i} position={bar.position}>
          <boxGeometry args={[0.2, bar.height, 0.4]} />
          <meshStandardMaterial color={bar.color} roughness={0.2} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
         <planeGeometry args={[30, 5]} />
         <meshStandardMaterial color="#18181b" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

export default function AnalyticsDashboard() {
  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <StudioNav />
      <main className="flex-1 overflow-y-auto p-8 relative">
        <header className="mb-8">
          <h1 className="text-3xl font-black mb-2 uppercase tracking-tight text-white/90">
            Telemetry & Data Science
          </h1>
          <p className="text-zinc-500 font-mono text-sm max-w-2xl">
            PhD Dissertation Dashboard. Mapping audience retention, topic resonance, and A/B cohort analysis back to the Studio-Cut EDL.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-red-500/10 text-red-400 font-bold text-[10px] px-2 py-1 rounded-bl-lg border-b border-l border-red-500/20 uppercase">
              Live Alert
            </div>
            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-4">Retention Drop Analysis</h3>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-black text-red-500">-24%</span>
              <span className="text-zinc-500 text-sm mb-1">at 04:12</span>
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed border-l-2 border-red-500/50 pl-3">
              The topic shift to <strong>"Docker Containers"</strong> caused a sharp drop in viewership among the <em>Leadership</em> cohort. Recommending a ripple-delete in the master EDL.
            </p>
            <button className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 py-2 rounded text-xs font-bold transition-colors">
              Open in Timeline Editor
            </button>
          </div>

          {/* Card 2 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-4">Topic Resonance</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-emerald-400 font-bold">AI Workflow</span>
                  <span className="text-zinc-400">+12%</span>
                </div>
                <div className="h-1.5 bg-zinc-950 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[85%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-blue-400 font-bold">Hardware Setup</span>
                  <span className="text-zinc-400">+4%</span>
                </div>
                <div className="h-1.5 bg-zinc-950 rounded overflow-hidden">
                  <div className="h-full bg-blue-500 w-[60%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-red-400 font-bold">Cloud Pricing</span>
                  <span className="text-zinc-400">-18%</span>
                </div>
                <div className="h-1.5 bg-zinc-950 rounded overflow-hidden">
                  <div className="h-full bg-red-500 w-[30%]"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-500/10 text-blue-400 font-bold text-[10px] px-2 py-1 rounded-bl-lg border-b border-l border-blue-500/20 uppercase">
              A/B Testing
            </div>
            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-4">Thumbnail CTR</h3>
            <div className="flex gap-4">
              <div className="flex-1 bg-black/50 border border-emerald-500/30 rounded p-2 text-center ring-1 ring-emerald-500/20">
                <div className="h-16 bg-zinc-800 rounded mb-2 flex items-center justify-center text-xs text-zinc-500 border border-zinc-700">A</div>
                <span className="text-emerald-400 font-black">6.4%</span>
              </div>
              <div className="flex-1 bg-black/50 border border-zinc-800 rounded p-2 text-center opacity-50 grayscale">
                <div className="h-16 bg-zinc-800 rounded mb-2 flex items-center justify-center text-xs text-zinc-500">B</div>
                <span className="text-zinc-500 font-black">3.2%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl">
           <h3 className="text-zinc-400 text-sm font-bold uppercase mb-4">Master Telemetry Stream (WorldHub + YouTube)</h3>
                      <div className="h-64 relative pb-4 border-b border-zinc-800 rounded-lg overflow-hidden">
             <Canvas camera={{ position: [0, 5, 15], fov: 45 }}>
                <color attach="background" args={['#09090b']} />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <BarChart3D />
                <Environment preset="city" />
                <ContactShadows position={[0, -2.5, 0]} opacity={0.4} scale={30} blur={2} far={4} />
                <OrbitControls makeDefault minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2} autoRotate autoRotateSpeed={0.5} />
             </Canvas>
           </div>
           <div className="flex justify-between text-xs text-zinc-600 font-mono mt-2 uppercase font-bold tracking-widest">
             <span>Start</span>
             <span className="text-red-500">Drop Detected</span>
             <span>End</span>
           </div>
        </div>
      </main>
    </div>
  );
}
