import React from "react";
import { Quote, Share2, Bookmark, ExternalLink, MessageSquareQuote } from "lucide-react";
import { Block } from "../../Tagger";

export default function QuoteAttributionCard({ block }: { block: Block }) {
  const quoteText = block.text.replace(/^["']|["']$/g, '').trim();
  
  return (
    <div className="my-8 max-w-3xl mx-auto rounded-3xl border border-[#e8dcc4] bg-[#fdfaf6] p-8 md:p-12 shadow-sm relative group overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#f4ebd8] rounded-bl-full -mr-8 -mt-8 opacity-50 pointer-events-none transition-transform group-hover:scale-110" />
      <Quote size={80} className="absolute top-6 left-6 text-[#ebd6b1] opacity-30 pointer-events-none" />
      
      <div className="relative z-10">
        <blockquote className="font-serif text-2xl md:text-3xl text-[#3d3122] leading-snug mb-8 font-medium">
          "{quoteText || "The limits of my language mean the limits of my world."}"
        </blockquote>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-t border-[#ebd6b1] pt-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-200 overflow-hidden border-2 border-white shadow-sm shrink-0">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Ludwig" alt="Author" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="font-bold text-lg text-[#3d3122]">Ludwig Wittgenstein</div>
              <div className="text-sm font-medium text-[#8c6b4a]">Tractatus Logico-Philosophicus (1922)</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#ebd6b1] text-[#7a5c3d] px-2 py-0.5 rounded-sm">Philosophy</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#ebd6b1] text-[#7a5c3d] px-2 py-0.5 rounded-sm">Language</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2.5 rounded-xl bg-white border border-[#e8dcc4] text-[#8c6b4a] hover:bg-[#ebd6b1] hover:text-[#3d3122] transition-colors shadow-sm" title="Save to Notebook">
              <Bookmark size={18} />
            </button>
            <button className="p-2.5 rounded-xl bg-white border border-[#e8dcc4] text-[#8c6b4a] hover:bg-[#ebd6b1] hover:text-[#3d3122] transition-colors shadow-sm" title="Create QuipLore Image">
              <MessageSquareQuote size={18} />
            </button>
            <button className="px-4 py-2.5 rounded-xl bg-[#3d3122] text-[#fdfaf6] hover:bg-[#261f15] transition-colors shadow-sm font-bold text-sm flex items-center gap-2">
              <Share2 size={16} /> Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
