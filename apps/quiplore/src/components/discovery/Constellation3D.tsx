// @ts-nocheck
"use client";

import React, { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Text } from "@react-three/drei";
import * as THREE from "three";
import { getAllQuipCards } from "@high-ground/quipsly-domain/seed";
import { QuipCard } from "../QuipCard";
import { X } from "lucide-react";

// Mocking 3D positions for the nodes
function generateNodes(count: number) {
  const cards = getAllQuipCards();
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const card = cards[i % cards.length];
    nodes.push({
      id: `${card.quote.id}-${i}`,
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40
      ),
      card,
    });
  }
  return nodes;
}

function ConstellationNodes({ nodes, onSelect }: { nodes: any[]; onSelect: (node: any) => void }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hoverRef = useRef<number | null>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (meshRef.current) {
      nodes.forEach((node, i) => {
        dummy.position.copy(node.position);
        const scale = hoverRef.current === i ? 2 : 1;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, nodes.length]}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoverRef.current = e.instanceId ?? null;
      }}
      onPointerOut={() => {
        hoverRef.current = null;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
          onSelect(nodes[e.instanceId]);
        }
      }}
    >
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial color="#e2b17b" emissive="#ad6b35" emissiveIntensity={0.5} />
    </instancedMesh>
  );
}

export function Constellation3D() {
  const nodes = useMemo(() => generateNodes(300), []);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  return (
    <div className="relative w-full h-[calc(100vh-80px)] bg-black overflow-hidden">
      <Canvas camera={{ position: [0, 0, 50], fov: 60 }}>
        <color attach="background" args={["#0a0502"]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <ConstellationNodes nodes={nodes} onSelect={setSelectedNode} />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          autoRotate={!selectedNode}
          autoRotateSpeed={0.5}
        />
      </Canvas>

      {/* Overlay UI */}
      <div className="absolute top-6 left-6 pointer-events-none text-[#e2b17b] font-serif">
        <h2 className="text-3xl font-bold tracking-widest uppercase">The Constellation</h2>
        <p className="opacity-70">Drag to navigate the archive. Click a star to read.</p>
      </div>

      {selectedNode && (
        <div className="absolute right-6 top-6 bottom-6 w-[400px] flex flex-col pointer-events-auto animate-in slide-in-from-right-8">
          <div className="bg-[#fdf1dc]/90 backdrop-blur-xl border border-[#e2b17b] rounded-[2rem] p-6 shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif font-bold text-[#4c331b] uppercase tracking-widest text-sm">
                Quote Discovered
              </h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-2 hover:bg-[#e2b17b]/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-[#ad6b35]" />
              </button>
            </div>

            <QuipCard card={selectedNode.card} />

            <div className="mt-8">
              <button className="w-full py-3 border-2 border-[#ad6b35] text-[#ad6b35] rounded-xl font-bold uppercase tracking-wider hover:bg-[#ad6b35] hover:text-white transition-all">
                Map Related Quotes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
