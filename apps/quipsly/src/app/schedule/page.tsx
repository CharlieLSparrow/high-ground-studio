"use client";

import { ListTodo, CheckCircle2, CircleDashed, ArrowRight, LayoutGrid } from "lucide-react";

export default function SchedulePage() {
  // Mock Kanban Data
  const columns = [
    {
      id: "ideation",
      title: "Ideation",
      color: "border-blue-200 bg-blue-50/50",
      headerText: "text-blue-800",
      cards: [
        { id: 1, title: "The End of Traditional APIs", tags: ["Essay", "Tech"] },
        { id: 2, title: "Why Next.js won", tags: ["Video", "Web Dev"] },
      ]
    },
    {
      id: "scripting",
      title: "Scripting & Prep",
      color: "border-amber-200 bg-amber-50/50",
      headerText: "text-amber-800",
      cards: [
        { id: 3, title: "Antigravity Agents Tutorial", tags: ["Tutorial", "Code"] },
      ]
    },
    {
      id: "production",
      title: "Production",
      color: "border-purple-200 bg-purple-50/50",
      headerText: "text-purple-800",
      cards: [
        { id: 4, title: "Studio Tour 2026", tags: ["Vlog", "Gear"] },
      ]
    },
    {
      id: "editing",
      title: "Post-Production",
      color: "border-rose-200 bg-rose-50/50",
      headerText: "text-rose-800",
      cards: [
        { id: 5, title: "React Compiler Deep Dive", tags: ["Video", "Deep Dive"] },
        { id: 6, title: "React Compiler Shorts", tags: ["Shorts", "Promo"] },
      ]
    }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden">
      <header className="p-8 pb-4 shrink-0">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Production Pipeline</p>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-[#3d3122]">The Schedule</h1>
            <p className="text-[#8c6b4a] mt-2">Track the lifecycle of your content from idea to final render.</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e8dcc4] text-[#8c6b4a] rounded-xl font-bold text-sm shadow-sm hover:text-[#3d3122] transition-colors">
              <LayoutGrid size={16} /> Board View
            </button>
            <button className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-amber-700 transition-colors">
              + New Project
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-8 pt-4">
        <div className="flex gap-6 h-full min-w-max pb-4">
          
          {columns.map(column => (
            <div key={column.id} className={`w-80 flex flex-col rounded-2xl border ${column.color} overflow-hidden shadow-sm`}>
              <div className={`p-4 border-b ${column.color.replace('bg-', 'border-').replace('/50', '')} flex justify-between items-center bg-white/50 backdrop-blur-sm`}>
                <h3 className={`font-black uppercase tracking-wider text-sm ${column.headerText}`}>{column.title}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white shadow-sm ${column.headerText}`}>
                  {column.cards.length}
                </span>
              </div>
              
              <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3">
                {column.cards.map(card => (
                  <div key={card.id} className="bg-white p-4 rounded-xl shadow-sm border border-[#e8dcc4] hover:border-amber-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group">
                    <h4 className="font-bold text-[#3d3122] text-sm leading-snug">{card.title}</h4>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {card.tags.map(tag => (
                        <span key={tag} className="text-[9px] font-bold uppercase tracking-wider bg-[#f8f3e6] text-[#8c6b4a] px-2 py-0.5 rounded border border-[#e8dcc4]">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#fdfaf6] opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-[#8c6b4a] flex items-center gap-1"><ListTodo size={12}/> 3 tasks</span>
                      <button className="text-amber-600 hover:text-amber-700"><ArrowRight size={14}/></button>
                    </div>
                  </div>
                ))}
                
                <button className="w-full py-3 border-2 border-dashed border-[#d4c1a0] text-[#8c6b4a] rounded-xl text-xs font-bold hover:bg-white hover:border-[#8c6b4a] transition-colors mt-1">
                  + Add Card
                </button>
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
