"use client";

import React, { useCallback } from "react";
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  Edge
} from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { Maximize, Filter, Download } from "lucide-react";

// Mock data to demonstrate the complexity of the domain mapping
const initialNodes: any[] = [
  { id: 'camus', position: { x: 250, y: 150 }, data: { label: 'Albert Camus' }, type: 'input', style: { background: '#f59e0b', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px' } },
  { id: 'rebel', position: { x: 100, y: 250 }, data: { label: 'The Rebel (1951)' }, style: { background: '#27272a', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' } },
  { id: 'myth', position: { x: 400, y: 250 }, data: { label: 'Myth of Sisyphus' }, style: { background: '#27272a', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' } },
  
  { id: 'q1', position: { x: 50, y: 350 }, data: { label: '"I rebel; therefore I exist."' }, style: { background: '#18181b', color: '#e4e4e7', border: '1px solid #10b981', borderRadius: '4px', fontSize: '10px', width: 150 } },
  { id: 'q2', position: { x: 250, y: 350 }, data: { label: '"The only way to deal with an unfree world..."' }, style: { background: '#18181b', color: '#e4e4e7', border: '1px solid #10b981', borderRadius: '4px', fontSize: '10px', width: 180 } },
  { id: 'q3', position: { x: 450, y: 350 }, data: { label: '"One must imagine Sisyphus happy."' }, style: { background: '#18181b', color: '#e4e4e7', border: '1px solid #10b981', borderRadius: '4px', fontSize: '10px', width: 150 } },
  
  { id: 't_absurd', position: { x: 550, y: 150 }, data: { label: 'Absurdism' }, type: 'output', style: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '20px' } },
  { id: 't_freedom', position: { x: 50, y: 150 }, data: { label: 'Freedom' }, type: 'output', style: { background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '20px' } },
];

const initialEdges: any[] = [
  { id: 'e1', source: 'camus', target: 'rebel', animated: true, style: { stroke: '#52525b' } },
  { id: 'e2', source: 'camus', target: 'myth', animated: true, style: { stroke: '#52525b' } },
  { id: 'e3', source: 'rebel', target: 'q1', style: { stroke: '#3f3f46' } },
  { id: 'e4', source: 'rebel', target: 'q2', style: { stroke: '#3f3f46' } },
  { id: 'e5', source: 'myth', target: 'q3', style: { stroke: '#3f3f46' } },
  { id: 'e6', source: 'q3', target: 't_absurd', style: { stroke: '#3b82f6', strokeDasharray: '5,5' } },
  { id: 'e7', source: 'camus', target: 't_absurd', style: { stroke: '#3b82f6', strokeDasharray: '5,5' } },
  { id: 'e8', source: 'q1', target: 't_freedom', style: { stroke: '#8b5cf6', strokeDasharray: '5,5' } },
  { id: 'e9', source: 'q2', target: 't_freedom', style: { stroke: '#8b5cf6', strokeDasharray: '5,5' } },
];

export function AuthorRelationshipGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">Entity Graph</h2>
          <p className="text-zinc-400 mt-1">Visualize connections between Authors, Manuscripts, Quotes, and Themes.</p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <Filter size={18} />
          </button>
          <button className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <Download size={18} />
          </button>
          <button className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <Maximize size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          className="bg-zinc-950"
        >
          <Background color="#27272a" gap={16} />
          <Controls className="bg-zinc-900 border border-zinc-800 fill-zinc-400" />
        </ReactFlow>
        
        <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-4 rounded-lg">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Legend</h4>
          <div className="space-y-2 text-sm text-zinc-300">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Authors</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-zinc-700 border border-zinc-600"></div> Source Works</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-zinc-900 border border-emerald-500"></div> Verified Quotes</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Themes</div>
          </div>
        </div>
      </div>
    </div>
  );
}
