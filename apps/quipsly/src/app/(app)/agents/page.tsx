"use client";

import { Suspense, useState, useEffect } from "react";
import { Terminal, Cpu, Play, CheckCircle2, CircleDashed, Plus, Activity, Bot } from "lucide-react";
import { StudioNav } from "../studio-nav";

function AgentControlCenterContent() {
  const [activeTab, setActiveTab] = useState<"fleet" | "logs">("fleet");
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [showSpawnModal, setShowSpawnModal] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const spawnAgent = async () => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SPAWN", name: newAgentName, role: newAgentRole })
      });
      if (res.ok) {
        setShowSpawnModal(false);
        setNewAgentName("");
        setNewAgentRole("");
        fetchAgents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const dispatchInstruction = async (agentId: string, instruction: string) => {
    if (!instruction) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DISPATCH", agentId, instruction })
      });
      if (res.ok) {
        fetchAgents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <StudioNav />
      <div className="flex-1 flex flex-col p-8 overflow-y-auto relative">
        <header className="mb-8 flex justify-between items-end border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest text-emerald-500 flex items-center gap-3">
              <Cpu className="w-8 h-8" />
              Agent Control Center
            </h1>
            <p className="text-zinc-400 mt-2">
              Monitor, instruct, and manage your autonomous subagent fleet natively powered by Postgres.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800 mr-4">
              <button 
                onClick={() => setActiveTab("fleet")}
                className={`px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === "fleet" ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-400 hover:text-white"}`}
              >
                Active Fleet
              </button>
              <button 
                onClick={() => setActiveTab("logs")}
                className={`px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === "logs" ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-400 hover:text-white"}`}
              >
                System Logs
              </button>
            </div>
            <button 
              onClick={() => setShowSpawnModal(true)}
              className="px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <Plus className="w-4 h-4" />
              Spawn Agent
            </button>
          </div>
        </header>

        {loading ? (
          <div className="text-zinc-500 text-center mt-20">Loading Agents...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-zinc-900 rounded-xl border border-emerald-900/50 p-6 shadow-xl relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-full h-1 ${agent.status === 'RUNNING' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <Bot className={`w-6 h-6 ${agent.status === 'RUNNING' ? 'text-blue-400' : 'text-emerald-400'}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{agent.name}</h3>
                      <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">ID: {agent.id.substring(0, 8)}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border flex items-center gap-2 ${
                    agent.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {agent.status === 'RUNNING' ? <Activity className="w-4 h-4 animate-spin-slow" /> : <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                    {agent.status}
                  </span>
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400 leading-relaxed mb-4">{agent.role}</p>
                  
                  {agent.tasks && agent.tasks.length > 0 && (
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                      <p className="text-xs text-zinc-500 font-mono mb-2 uppercase">Current/Last Task</p>
                      <p className="text-sm text-zinc-300">{agent.tasks[0].instruction}</p>
                      <div className="flex items-center gap-2 mt-3 text-xs font-bold">
                        {agent.tasks[0].status === 'QUEUED' || agent.tasks[0].status === 'IN_PROGRESS' ? (
                          <span className="text-blue-500 flex items-center gap-2"><CircleDashed className="w-4 h-4 animate-spin" /> In Progress</span>
                        ) : (
                          <span className="text-emerald-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const input = form.elements.namedItem("instruction") as HTMLInputElement;
                      dispatchInstruction(agent.id, input.value);
                      input.value = "";
                    }}
                    className="flex gap-3"
                  >
                    <input name="instruction" type="text" placeholder="Dispatch instruction..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                    <button type="submit" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-emerald-400">
                      <Play className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spawn Modal */}
        {showSpawnModal && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
             <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 w-full max-w-md">
               <h2 className="text-xl font-bold mb-4">Spawn New Agent</h2>
               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-zinc-400 mb-2">AGENT NAME</label>
                   <input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-3 text-sm focus:border-emerald-500 outline-none" placeholder="e.g. Test Architect" />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-zinc-400 mb-2">SYSTEM ROLE / CAPABILITIES</label>
                   <textarea value={newAgentRole} onChange={e => setNewAgentRole(e.target.value)} className="w-full bg-black border border-zinc-700 rounded p-3 text-sm h-24 focus:border-emerald-500 outline-none" placeholder="Describe what this agent can do..." />
                 </div>
                 <div className="flex justify-end gap-3 mt-6">
                   <button onClick={() => setShowSpawnModal(false)} className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white">Cancel</button>
                   <button onClick={spawnAgent} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-lg">Spawn Agent</button>
                 </div>
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentControlCenter() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black p-8 text-zinc-400">Loading agent control center...</div>}>
      <AgentControlCenterContent />
    </Suspense>
  );
}
