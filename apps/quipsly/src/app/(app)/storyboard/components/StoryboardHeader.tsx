"use client";

import { Film, Image as ImageIcon, Sparkles, ChevronLeft, Download, Share2 } from "lucide-react";
import Link from "next/link";


export function StoryboardHeader({ storyboardTitle, projectSlug }: { storyboardTitle: string; projectSlug: string }) {
  return (
    <header className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <Link 
          href={`/projects/${projectSlug}`} 
          aria-label="Back to project"
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <ChevronLeft size={20} />
        </Link>
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center">
            <Film size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">{storyboardTitle}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">Draft</span>
              <span className="text-xs text-zinc-400">Autosaved just now</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 md:mt-0">
        <button 
          aria-label="Export storyboard as PDF"
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <ImageIcon size={16} aria-hidden="true" />
          <span>Export PDF</span>
        </button>
        <button 
          aria-label="Share storyboard link"
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Share2 size={16} aria-hidden="true" />
          <span>Share Link</span>
        </button>
        <button 
          aria-label="Render preview of storyboard"
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm shadow-orange-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>Render Preview</span>
        </button>
      </div>
    </header>
  );
}
