'use client';

import React, { useState } from 'react';
import { ScrollPanel, ExperienceType } from './types';
import { useInteractionState } from './InteractionStateContext';
import { CommentDrawer } from './CommentDrawer';

interface InteractionOverlayProps {
  panel: ScrollPanel;
  experienceType: ExperienceType;
}

export function InteractionOverlay({ panel, experienceType }: InteractionOverlayProps) {
  const { toggleFavorite, localInteractions, activePanelId } = useInteractionState();
  const [showComments, setShowComments] = useState(false);
  
  const isActive = activePanelId === panel.id;
  const interactions = localInteractions[panel.id] || panel.interactions;
  
  const favCount = interactions.filter(i => i.interactionType === 'FAVORITE').length;
  const isFavorited = interactions.some(i => i.interactionType === 'FAVORITE' && i.userId === 'user_current');
  const commentCount = interactions.filter(i => i.interactionType === 'COMMENT').length;

  return (
    <>
      <div className="w-full bg-zinc-900 border-t border-zinc-800 flex flex-col z-20 pb-safe">
        {/* Caption Area */}
        {panel.content.caption && (
          <div className="px-4 py-3 text-sm md:text-base text-zinc-300 font-medium leading-snug">
            {panel.content.caption}
          </div>
        )}

        {/* Action Bar */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button 
              onClick={() => toggleFavorite(panel.id, 'user_current')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                isFavorited ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{favCount > 0 ? favCount : 'Favorite'}</span>
            </button>

            <button 
              onClick={() => setShowComments(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full text-sm font-semibold text-zinc-400 hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
            </button>
          </div>
          
          {(experienceType === 'STORYBOARD' || experienceType === 'PHOTOGRAPHY') && (
            <button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-full shadow-lg shadow-indigo-900/50 transition-all active:scale-95">
              Approve
            </button>
          )}
        </div>
      </div>

      {/* Drawer Overlay */}
      {showComments && (
        <CommentDrawer 
          panelId={panel.id} 
          interactions={interactions} 
          onClose={() => setShowComments(false)} 
        />
      )}
    </>
  );
}
