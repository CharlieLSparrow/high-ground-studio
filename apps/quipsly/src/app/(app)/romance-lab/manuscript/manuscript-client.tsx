"use client";

import { useState } from "react";
import Editor from "@/components/Editor";
import Mention from "@tiptap/extension-mention";
import { getSuggestionConfig } from "./suggestion";
import { StudioNav } from "../../studio-nav";
import { Scroll, Users2, Shield, Info, Bot, Search } from "lucide-react";
import { cn, panelClassName, labelClassName, StudioChip } from "../../studio-ui";
import { AssistantSidebar } from "@/components/research/AssistantSidebar";
import { ResearchContextPane } from "@/components/research/ResearchContextPane";

export function ManuscriptClient({ initialCharacters }: { initialCharacters: any[] }) {
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showResearch, setShowResearch] = useState(false);

  const activeCharacter = activeCharacterId 
    ? initialCharacters.find(c => c.id === activeCharacterId)
    : null;

  // We add the Mention extension with our custom suggestion config
  const customExtensions = [
    Mention.configure({
      HTMLAttributes: {
        class: "bg-[#8c6b4a]/20 text-[#8c6b4a] font-bold px-1 py-0.5 rounded cursor-pointer hover:bg-[#8c6b4a]/30 transition-colors",
      },
      suggestion: getSuggestionConfig(initialCharacters),
    }),
  ];

  // Global click handler to detect clicks on mention nodes
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-id') && target.hasAttribute('data-type') && target.getAttribute('data-type') === 'mention') {
      const id = target.getAttribute('data-id');
      if (id) setActiveCharacterId(id);
    } else {
      // If clicking elsewhere, we don't necessarily want to dismiss the pane immediately, 
      // but maybe we do. Let's keep it open for reference until another is clicked.
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-hidden min-h-screen">
      
      {/* Header */}
      <header
        className={cn(
          panelClassName,
          "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center m-3.5 md:m-6 mb-0",
        )}
      >
        <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
          <div className="w-12 h-12 bg-[#8c6b4a]/10 rounded-xl flex items-center justify-center border border-[#8c6b4a]/30">
            <Scroll className="text-[#8c6b4a]" size={24} />
          </div>
          <div>
            <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-[#3d3122] max-sm:text-[1.45rem]">
              Smart Manuscript
            </h1>
            <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-[#8c6b4a]">
              Drafting environment wired to the Document Kernel and Entity Forge. Type @ to summon characters.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end items-center">
          <button 
            onClick={() => { setShowResearch(!showResearch); setShowAssistant(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${showResearch ? 'bg-[#8c6b4a] text-white border-[#8c6b4a]' : 'bg-white text-[#8c6b4a] border-[#e8dcc4] hover:bg-[#8c6b4a]/10'}`}
          >
            <Search size={16} /> Research
          </button>
          <button 
            onClick={() => { setShowAssistant(!showAssistant); setShowResearch(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${showAssistant ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-[#e8dcc4] hover:bg-purple-50'}`}
          >
            <Bot size={16} /> Assistant
          </button>
          <div className="w-px h-6 bg-[#e8dcc4] mx-2" />
          <StudioNav />
          <StudioChip tone="source">Romance Lab</StudioChip>
        </div>
      </header>

      {/* Main Workspace: Editor + Context Pane */}
      <div className="flex-1 flex overflow-hidden p-3.5 md:p-6 gap-[18px]">
        
        {/* Editor Wrapper */}
        <div 
          className="flex-1 overflow-y-auto bg-white rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col"
          onClick={handleEditorClick}
        >
          <Editor 
            roomName="romance-lab-manuscript-001"
            disableCollab={true}
            additionalExtensions={customExtensions}
          />
        </div>

        {/* Right Pane Context Area (Dynamic) */}
        {showAssistant && (
           <div className="shrink-0 h-full overflow-hidden rounded-2xl">
             <AssistantSidebar projectId="test-project-001" />
           </div>
        )}

        {showResearch && (
           <div className="shrink-0 h-full overflow-hidden rounded-2xl">
             <ResearchContextPane projectId="test-project-001" />
           </div>
        )}

        {/* Default Lore Context Pane */}
        {!showAssistant && !showResearch && (
          <aside className={cn(panelClassName, "hidden lg:flex flex-col w-80 shrink-0 overflow-y-auto")}>
            <div className="p-4 border-b border-[#e8dcc4] bg-[#f8f3e6] sticky top-0 z-10 flex items-center justify-between">
              <span className={labelClassName}>Context Pane</span>
              <Info size={16} className="text-[#8c6b4a]" />
            </div>

            <div className="p-4 flex flex-col gap-4">
              {!activeCharacter ? (
                <div className="text-center py-12 px-4 flex flex-col items-center gap-3">
                  <Users2 size={32} className="text-[#d4c1a0]" />
                  <p className="text-sm text-[#8c6b4a]">
                    Click on an @mentioned character in the manuscript to view their profile here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  
                  {/* Character Header */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-[#fdfaf6] border border-[#e8dcc4] flex items-center justify-center font-black text-[#8c6b4a] text-2xl shadow-inner">
                      {activeCharacter.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-[#3d3122]">{activeCharacter.name}</h2>
                      <span className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">{activeCharacter.archetype || "Unknown Role"}</span>
                    </div>
                  </div>

                  {/* Character Details */}
                  <div className="flex flex-col gap-3 mt-2">
                    <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-1 block">Faction</span>
                      <div className="flex items-center gap-2 text-sm font-medium text-[#3d3122]">
                        <Shield size={14} className="text-[#8c6b4a]" />
                        {activeCharacter.faction?.name || "No Faction"}
                      </div>
                    </div>

                    <div className="bg-white border border-[#e8dcc4] rounded-xl p-3 shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-[#d4c1a0] tracking-wider mb-1 block">Kernel Status</span>
                      <div className="flex items-center gap-2">
                        <StudioChip tone="node">Canonical Entity Linked</StudioChip>
                      </div>
                      <p className="text-xs text-[#8c6b4a] mt-2 leading-relaxed">
                        This anchor is verified by the Document Kernel. Renaming the entity in the Forge will automatically update this reference.
                      </p>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </aside>
        )}

      </div>
    </div>
  );
}
