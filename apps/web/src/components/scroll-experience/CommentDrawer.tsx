'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ScrollInteraction } from './types';
import { useInteractionState } from './InteractionStateContext';

interface CommentDrawerProps {
  panelId: string;
  interactions: ScrollInteraction[];
  onClose: () => void;
}

export function CommentDrawer({ panelId, interactions, onClose }: CommentDrawerProps) {
  const { addInteraction } = useInteractionState();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const comments = interactions
    .filter(i => i.interactionType === 'COMMENT')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    addInteraction({
      experienceId: 'exp_current',
      panelId,
      userId: 'user_current',
      interactionType: 'COMMENT',
      payload: { text: text.trim() }
    });
    setText('');
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-xl animate-in slide-in-from-bottom-full duration-300">
      <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-900/50">
        <h3 className="font-bold text-zinc-100">Feedback Thread</h3>
        <button 
          onClick={onClose} 
          className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {comments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <svg className="w-12 h-12 opacity-20" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
            <p>No feedback yet. Start the conversation.</p>
          </div>
        ) : (
          comments.map(c => (
            <div key={c.id} className={`flex flex-col max-w-[85%] ${c.userId === 'user_current' ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 ml-1">{c.userId}</span>
              <div className={`px-4 py-2 rounded-2xl text-sm ${c.userId === 'user_current' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'}`}>
                {c.payload.text}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-zinc-900 border-t border-zinc-800 pb-safe">
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input 
            ref={inputRef}
            type="text" 
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment..." 
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-full px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          <button 
            type="submit"
            disabled={!text.trim()}
            className="absolute right-1 top-1 bottom-1 px-4 bg-indigo-600 text-white font-medium rounded-full text-sm disabled:opacity-50 disabled:bg-zinc-800 transition-colors"
          >
            Post
          </button>
        </form>
      </div>
    </div>
  );
}
