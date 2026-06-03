"use client";

import { useState, useMemo, useCallback } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  applyNodeChanges, 
  applyEdgeChanges, 
  type Node, 
  type Edge, 
  type NodeChange, 
  type EdgeChange 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StudioNav } from "../../studio-nav";
import { cn, panelClassName, labelClassName, StudioChip } from "../../studio-ui";
import { Network, Users2, Shield, Info } from 'lucide-react';

export function LoreLinkClient({ characters, factions }: { characters: any[], factions: any[] }) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const R1 = 500; // Faction circle radius
    const R2 = 250; // Character circle radius
    
    const angleStep = (2 * Math.PI) / Math.max(1, factions.length);
    
    factions.forEach((faction, i) => {
      const fx = Math.cos(i * angleStep) * R1;
      const fy = Math.sin(i * angleStep) * R1;
      
      nodes.push({
        id: `faction-${faction.id}`,
        type: 'default',
        position: { x: fx + window.innerWidth / 2 - 100, y: fy + window.innerHeight / 2 - 100 },
        data: { label: faction.name, type: 'faction', entity: faction },
        style: {
          backgroundColor: '#f8f3e6',
          border: '2px solid #d4c1a0',
          borderRadius: '8px',
          padding: '20px',
          fontWeight: '900',
          fontSize: '16px',
          color: '#3d3122',
          width: 180,
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }
      });

      const factionChars = characters.filter(c => c.factionId === faction.id);
      const charAngleStep = (2 * Math.PI) / Math.max(1, factionChars.length);
      
      factionChars.forEach((char, j) => {
        const cx = Math.cos(j * charAngleStep) * R2;
        const cy = Math.sin(j * charAngleStep) * R2;
        
        nodes.push({
          id: `char-${char.id}`,
          type: 'default',
          position: { x: fx + cx + window.innerWidth / 2 - 100, y: fy + cy + window.innerHeight / 2 - 100 },
          data: { label: char.name, type: 'character', entity: char },
          style: {
            backgroundColor: '#fff',
            border: '1px solid #8c6b4a',
            borderRadius: '20px',
            padding: '10px 15px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#8c6b4a',
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'
          }
        });

        edges.push({
          id: `e-${faction.id}-${char.id}`,
          source: `faction-${faction.id}`,
          target: `char-${char.id}`,
          animated: true,
          style: { stroke: '#d4c1a0', strokeWidth: 2 }
        });
      });
    });
    
    // Unaligned characters
    const unaligned = characters.filter(c => !c.factionId);
    unaligned.forEach((char, i) => {
      nodes.push({
        id: `char-${char.id}`,
        type: 'default',
        position: { x: 100, y: 200 + i * 60 },
        data: { label: char.name, type: 'character', entity: char },
        style: {
          backgroundColor: '#fdfaf6',
          border: '1px dashed #8c6b4a',
          borderRadius: '20px',
          padding: '10px 15px',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#8c6b4a'
        }
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [characters, factions]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [activeNode, setActiveNode] = useState<Node | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-hidden min-h-screen">
      
      {/* Header */}
      <header
        className={cn(
          panelClassName,
          "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center m-3.5 md:m-6 mb-0 z-10 relative",
        )}
      >
        <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
          <div className="w-12 h-12 bg-[#8c6b4a]/10 rounded-xl flex items-center justify-center border border-[#8c6b4a]/30">
            <Network className="text-[#8c6b4a]" size={24} />
          </div>
          <div>
            <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-[#3d3122] max-sm:text-[1.45rem]">
              LoreLink Visualizer
            </h1>
            <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-[#8c6b4a]">
              Interactive relationship mapping for characters, factions, and documents in the Kernel.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end items-center">
          <StudioNav />
          <StudioChip tone="source">Romance Lab</StudioChip>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden p-3.5 md:p-6 gap-[18px]">
        
        {/* React Flow Canvas */}
        <div className="flex-1 bg-white rounded-2xl border border-[#e8dcc4] shadow-sm relative overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(e, node) => setActiveNode(node)}
            onPaneClick={() => setActiveNode(null)}
            fitView
            attributionPosition="bottom-right"
          >
            <Background color="#e8dcc4" gap={20} size={1} />
            <Controls className="bg-white border-[#e8dcc4] shadow-sm" />
            <MiniMap 
              nodeColor={(node) => {
                return node.data.type === 'faction' ? '#d4c1a0' : '#8c6b4a';
              }} 
              maskColor="rgba(253, 250, 246, 0.7)"
              className="bg-white border-[#e8dcc4] shadow-sm rounded-xl overflow-hidden"
            />
          </ReactFlow>
        </div>

        {/* Info Sidebar */}
        <aside className={cn(panelClassName, "hidden lg:flex flex-col w-80 shrink-0 overflow-y-auto")}>
          <div className="p-4 border-b border-[#e8dcc4] bg-[#f8f3e6] sticky top-0 z-10 flex items-center justify-between">
            <span className={labelClassName}>Node Inspector</span>
            <Info size={16} className="text-[#8c6b4a]" />
          </div>

          <div className="p-4 flex flex-col gap-4">
            {!activeNode ? (
              <div className="text-center py-12 px-4 flex flex-col items-center gap-3">
                <Network size={32} className="text-[#d4c1a0]" />
                <p className="text-sm text-[#8c6b4a]">
                  Click on any node in the graph to view its details.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                
                {/* Node Header */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#fdfaf6] border border-[#e8dcc4] flex items-center justify-center font-black text-[#8c6b4a] text-2xl shadow-inner">
                    {activeNode.data.type === 'faction' ? <Shield size={24} /> : <Users2 size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-[#3d3122]">{String(activeNode.data.label)}</h2>
                    <span className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">
                      {activeNode.data.type === 'faction' ? 'Faction' : 'Character'}
                    </span>
                  </div>
                </div>

                {/* Node Details */}
                <div className="flex flex-col gap-3 mt-2">
                  {activeNode.data.type === 'character' && (
                    <>
                      <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-1 block">Archetype</span>
                        <div className="text-sm font-medium text-[#3d3122]">
                          {(activeNode.data.entity as any).archetype || "Unknown Role"}
                        </div>
                      </div>
                      
                      {/* Connection List */}
                      <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-2 block">Connections</span>
                        {edges.filter(e => e.target === activeNode.id).map(e => {
                          const sourceNode = nodes.find(n => n.id === e.source);
                          return (
                            <div key={e.id} className="flex items-center gap-2 text-xs text-[#8c6b4a] mb-1 last:mb-0 bg-[#f8f3e6] px-2 py-1.5 rounded-md">
                              <Shield size={12} />
                              <span className="font-bold text-[#3d3122]">{String(sourceNode?.data?.label)}</span>
                            </div>
                          );
                        })}
                        {edges.filter(e => e.target === activeNode.id).length === 0 && (
                          <div className="text-xs text-[#8c6b4a] italic">No active connections.</div>
                        )}
                      </div>
                    </>
                  )}

                  {activeNode.data.type === 'faction' && (
                    <>
                      <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-1 block">Description</span>
                        <div className="text-sm font-medium text-[#3d3122]">
                          {(activeNode.data.entity as any).description || "No description provided."}
                        </div>
                      </div>

                      {/* Connection List */}
                      <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                        <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-2 block">Members ({edges.filter(e => e.source === activeNode.id).length})</span>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                          {edges.filter(e => e.source === activeNode.id).map(e => {
                            const targetNode = nodes.find(n => n.id === e.target);
                            return (
                              <div key={e.id} className="flex items-center gap-2 text-xs text-[#8c6b4a] bg-[#f8f3e6] px-2 py-1.5 rounded-md">
                                <Users2 size={12} />
                                <span className="font-bold text-[#3d3122]">{String(targetNode?.data?.label)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
