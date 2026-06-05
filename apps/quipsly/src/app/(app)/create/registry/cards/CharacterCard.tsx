import React, { useState } from "react";
import { User, Heart, Shield, Sword, Eye, Sparkles, AlertCircle, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Block } from "../../Tagger";

export default function CharacterCard({ block }: { block: Block }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "relationships" | "arc">("profile");

  const nameMatch = block.text.match(/Name:\s*(.+)/i);
  const name = nameMatch ? nameMatch[1].trim() : "Unknown Character";

  return (
    <div className="my-6 rounded-2xl border-2 border-indigo-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md">
      <div 
        className="bg-indigo-50/80 p-4 border-b border-indigo-100 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-inner">
            <User size={20} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-0.5">Character Profile</div>
            <div className="font-serif text-lg font-bold text-indigo-950 leading-tight">{name}</div>
          </div>
        </div>
        <button className="p-2 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 rounded-full transition-colors">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {expanded && (
        <div className="p-0">
          <div className="flex border-b border-gray-100 bg-gray-50/50">
            {[
              { id: "profile", label: "Profile", icon: Eye },
              { id: "relationships", label: "Relationships", icon: Heart },
              { id: "arc", label: "Story Arc", icon: Sparkles }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  activeTab === tab.id 
                    ? "bg-white text-indigo-700 border-b-2 border-indigo-600" 
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === "profile" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium mb-1">Archetype</div>
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      <Shield size={14} className="text-emerald-500" /> Reluctant Hero
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium mb-1">Motivation</div>
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      <Sword size={14} className="text-rose-500" /> Redemption
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-700 mb-2">Internal Conflict</div>
                  <p className="text-sm text-gray-600 bg-rose-50 p-3 rounded-lg border border-rose-100 leading-relaxed">
                    Struggles between the desire for a quiet life and the inescapable pull of their past mistakes.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "relationships" && (
              <div className="space-y-3">
                {[
                  { name: "Elara", type: "Ally", desc: "Trusts implicitly, but fears putting her in danger." },
                  { name: "The Magistrate", type: "Antagonist", desc: "Former mentor turned bitter rival." }
                ].map((rel, idx) => (
                  <div key={idx} className="flex gap-4 items-start p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                    <div className={`w-2 h-2 mt-2 rounded-full ${rel.type === 'Ally' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <div>
                      <div className="font-bold text-gray-800">{rel.name} <span className="text-xs font-normal text-gray-400 ml-2">({rel.type})</span></div>
                      <div className="text-sm text-gray-600 mt-1">{rel.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "arc" && (
              <div className="relative pl-6 space-y-6 before:absolute before:inset-0 before:ml-7 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-indigo-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <BookOpen size={10} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-gray-800 text-sm">Status Quo</div>
                      <time className="font-mono text-xs text-indigo-500">Act 1</time>
                    </div>
                    <div className="text-gray-600 text-xs">Living in hiding, suppressing their true abilities.</div>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-rose-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <AlertCircle size={10} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-gray-800 text-sm">Inciting Incident</div>
                      <time className="font-mono text-xs text-rose-500">Act 1</time>
                    </div>
                    <div className="text-gray-600 text-xs">Forced to reveal their power to save a stranger.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-gray-50 p-3 border-t border-gray-100 flex justify-end gap-2">
            <button className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">Edit Source</button>
            <button className="text-xs font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg transition-colors">Open Full Profile</button>
          </div>
        </div>
      )}
    </div>
  );
}
