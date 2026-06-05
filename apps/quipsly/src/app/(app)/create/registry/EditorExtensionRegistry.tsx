import React, { createContext, useContext, ReactNode } from "react";
import { PlayCircle, MessageSquare, Mic, List, Tag, LucideIcon } from "lucide-react";
import { Block } from "../Tagger"; // Assuming Block is exported or defined in a shared file

export type TagDefinition = {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  color: string;
  mark: string;
};

export type BlockAccentRenderer = {
  id: string;
  className: string;
  shouldApply: (block: Block, tagIds: string[]) => boolean;
};

export type BlockCardRenderer = {
  id: string;
  shouldRender: (block: Block, tagIds: string[]) => boolean;
  render: (props: {
    block: Block;
    onTextChange: (id: string, text: string) => void;
    onTextCommit: (id: string, text: string) => void;
  }) => React.ReactNode;
};

type EditorExtensionState = {
  tagDefinitions: TagDefinition[];
  blockAccents: BlockAccentRenderer[];
  blockCards: BlockCardRenderer[];
};

import { User, DollarSign, Image, HelpCircle, Quote } from "lucide-react";

const defaultTagDefinitions: TagDefinition[] = [

  { id: "character", label: "Character", category: "fiction", icon: User, color: "bg-indigo-100 text-indigo-900 border-indigo-200", mark: "bg-indigo-100 text-indigo-950 ring-indigo-200" },
  { id: "sponsor-ad", label: "Sponsor Ad", category: "podcast", icon: DollarSign, color: "bg-emerald-100 text-emerald-900 border-emerald-200", mark: "bg-emerald-100 text-emerald-950 ring-emerald-200" },
  { id: "gallery", label: "Image Gallery", category: "photography", icon: Image, color: "bg-zinc-200 text-zinc-900 border-zinc-300", mark: "bg-zinc-200 text-zinc-950 ring-zinc-300" },
  { id: "quiz", label: "Quiz", category: "course", icon: HelpCircle, color: "bg-sky-100 text-sky-900 border-sky-200", mark: "bg-sky-100 text-sky-950 ring-sky-200" },
  { id: "quote-attribution", label: "QuipLore", category: "quote", icon: Quote, color: "bg-[#ebd6b1] text-[#7a5c3d] border-[#d4b98c]", mark: "bg-[#ebd6b1] text-[#59442d] ring-[#d4b98c]" },

  { id: "chapter", label: "Chapter", category: "structure", icon: PlayCircle, color: "bg-cyan-100 text-cyan-900 border-cyan-200", mark: "bg-cyan-100 text-cyan-950 ring-cyan-200" },
  { id: "episode", label: "Episode", category: "structure", icon: PlayCircle, color: "bg-rose-100 text-rose-900 border-rose-200", mark: "bg-rose-100 text-rose-950 ring-rose-200" },
  { id: "quote", label: "Quote", category: "quote", icon: MessageSquare, color: "bg-blue-100 text-blue-800 border-blue-200", mark: "bg-blue-100 text-blue-950 ring-blue-200" },
  { id: "social-clip", label: "Social Clip", category: "media", icon: Mic, color: "bg-purple-100 text-purple-800 border-purple-200", mark: "bg-purple-100 text-purple-950 ring-purple-200" },
  { id: "educational", label: "Educational", category: "educational", icon: List, color: "bg-green-100 text-green-800 border-green-200", mark: "bg-green-100 text-green-950 ring-green-200" },
  { id: "internal_note", label: "Internal Note", category: "internal_note", icon: Tag, color: "bg-gray-100 text-gray-800 border-gray-200", mark: "bg-gray-100 text-gray-950 ring-gray-200" },
  { id: "media", label: "Media", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "episode-1", label: "Episode 1", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-4", label: "Episode 4", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-8", label: "Episode 8", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-9", label: "Episode 9", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "voice-homer", label: "Homer", category: "content_role", icon: Mic, color: "bg-emerald-100 text-emerald-900 border-emerald-200", mark: "bg-emerald-100 text-emerald-950 ring-emerald-200" },
  { id: "voice-charlie", label: "Charlie", category: "content_role", icon: MessageSquare, color: "bg-sky-100 text-sky-900 border-sky-200", mark: "bg-sky-100 text-sky-950 ring-sky-200" },
  { id: "show-note", label: "Show Note", category: "workflow_status", icon: List, color: "bg-yellow-100 text-yellow-900 border-yellow-200", mark: "bg-yellow-100 text-yellow-950 ring-yellow-200" },
  { id: "clip-cue", label: "Clip Cue", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "published-episode", label: "Published Episode", category: "media", icon: PlayCircle, color: "bg-indigo-100 text-indigo-900 border-indigo-200", mark: "bg-indigo-100 text-indigo-950 ring-indigo-200" },
  { id: "youtube-clip", label: "YouTube Clip", category: "media", icon: PlayCircle, color: "bg-rose-100 text-rose-900 border-rose-200", mark: "bg-rose-100 text-rose-950 ring-rose-200" }
];

const defaultBlockAccents: BlockAccentRenderer[] = [
  { id: "voice-homer", className: "border-l-4 border-l-emerald-400 bg-emerald-50/30", shouldApply: (_, tags) => tags.includes("voice-homer") },
  { id: "voice-charlie", className: "border-l-4 border-l-sky-400 bg-sky-50/30", shouldApply: (_, tags) => tags.includes("voice-charlie") },
  { id: "show-note", className: "border-l-4 border-l-yellow-400 bg-yellow-50/40", shouldApply: (_, tags) => tags.includes("show-note") },
  { id: "clip-cue", className: "border-l-4 border-l-orange-400 bg-orange-50/40", shouldApply: (_, tags) => tags.includes("clip-cue") || tags.includes("youtube-clip") }
];

const EditorExtensionContext = createContext<EditorExtensionState>({
  tagDefinitions: defaultTagDefinitions,
  blockAccents: defaultBlockAccents,
  blockCards: [], // We will inject the cards here or from Workspace
});

export const useEditorExtensions = () => useContext(EditorExtensionContext);

export function EditorExtensionProvider({ 
  children, 
  customCards = [] 
}: { 
  children: ReactNode; 
  customCards?: BlockCardRenderer[];
}) {
  return (
    <EditorExtensionContext.Provider value={{
      tagDefinitions: defaultTagDefinitions,
      blockAccents: defaultBlockAccents,
      blockCards: customCards
    }}>
      {children}
    </EditorExtensionContext.Provider>
  );
}
