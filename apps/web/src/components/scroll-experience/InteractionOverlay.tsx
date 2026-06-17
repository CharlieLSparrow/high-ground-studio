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
  const { toggleFavorite, toggleSelection, setRating, localInteractions, activePanelId } = useInteractionState();
  const [showComments, setShowComments] = useState(false);
  
  const isActive = activePanelId === panel.id;
  const interactions = localInteractions[panel.id] || panel.interactions;
  
  const favCount = interactions.filter(i => i.interactionType === 'FAVORITE').length;
  const isFavorited = interactions.some(i => i.interactionType === 'FAVORITE' && i.userId === 'user_current');
  const commentCount = interactions.filter(i => i.interactionType === 'COMMENT').length;
  const isSelected = interactions.some(i => i.interactionType === 'SELECTION' && i.userId === 'user_current');
  const userRating = interactions.find(i => i.interactionType === 'RATING' && i.userId === 'user_current')?.payload?.rating || 0;

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
          <div className="flex gap-2 items-center">
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

            {/* Optional Rating UI for Courses/Lorelists */}
            {(experienceType === 'COURSE' || experienceType === 'LORELIST') && (
              <div className="flex gap-1 ml-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button 
                    key={star} 
                    onClick={() => setRating(panel.id, 'user_current', star === userRating ? 0 : star)}
                    className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                  >
                    <svg className={`w-5 h-5 ${star <= userRating ? 'text-yellow-400' : 'text-zinc-600'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Approval/Selection UI for Photography/Storyboard */}
          {(experienceType === 'STORYBOARD' || experienceType === 'PHOTOGRAPHY') && (
            <button 
              onClick={() => toggleSelection(panel.id, 'user_current')}
              className={`px-4 py-1.5 text-sm font-bold rounded-full shadow-lg transition-all active:scale-95 ${
                isSelected 
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-900/50' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50'
              }`}
            >
              {isSelected ? '✓ Selected' : 'Select'}
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
