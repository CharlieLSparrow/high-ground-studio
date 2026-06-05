import React from "react";
import { StoryBibleSidebar } from "@/components/story-bible";

export default async function WorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <div className="flex h-screen w-full bg-void-light text-subject overflow-hidden">
      {/* Mock Editor Area */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-white/10 flex items-center px-6 bg-void">
          <h1 className="font-semibold text-lg">Quipsly Editor Workspace</h1>
        </header>
        
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto prose-hgo">
            <h1>Chapter 1: The Gathering Storm</h1>
            <p>
              The wind howled through the narrow streets of Oakhaven. 
              <span className="bg-flare/20 text-flare-glow px-1 rounded cursor-pointer border border-flare/30">Elara</span> 
              pulled her cloak tighter, her eyes scanning the shadows for any sign of the Queen&apos;s guard.
            </p>
            <p>
              &quot;They know we&apos;re here,&quot; whispered <span className="bg-flare/20 text-flare-glow px-1 rounded cursor-pointer border border-flare/30">Kael</span>, emerging from the alleyway. 
              His hand rested firmly on the hilt of his sword.
            </p>
            <p>
              She nodded, glancing toward the <span className="bg-flare/20 text-flare-glow px-1 rounded cursor-pointer border border-flare/30">Obsidian Tower</span> looming in the distance. 
              &quot;Then we move now. Before the storm breaks.&quot;
            </p>
          </div>
        </main>
      </div>

      {/* StoryBible Side Panel MVP */}
      <StoryBibleSidebar projectId={projectId} />
    </div>
  );
}
