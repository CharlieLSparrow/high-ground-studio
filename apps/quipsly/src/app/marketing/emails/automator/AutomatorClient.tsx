"use client";

import React, { useState } from 'react';
import { User, Sparkles, Mail, Clock, CheckCircle2, ChevronDown, Save } from 'lucide-react';

interface EmailNode {
  id: string;
  dayOffset: number;
  label: string;
  subject: string;
  body: string;
}

const initialSequence: EmailNode[] = [
  { id: '1', dayOffset: 0, label: 'Immediate Welcome', subject: 'Welcome! Here is your free guide', body: 'Hey there,\n\nAs promised, here is the link to download the guide.\n\nCheers!' },
  { id: '2', dayOffset: 1, label: 'Value & Story', subject: 'How I almost lost my agency...', body: 'I want to share a quick story about why I started doing this...' },
  { id: '3', dayOffset: 2, label: 'Objection Handling', subject: 'Is this really possible for you?', body: 'A lot of people ask me if they have the time for this...' },
  { id: '4', dayOffset: 3, label: 'Soft Pitch', subject: 'The exact system I use', body: 'If you want to skip the trial and error, check out my premium course.' },
  { id: '5', dayOffset: 4, label: 'Hard Pitch', subject: 'Closing the doors soon', body: 'This is your last chance to grab the course at this price.' },
];

export function AutomatorClient({ personas }: { personas: any[] }) {
  const [sequence, setSequence] = useState<EmailNode[]>(initialSequence);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(personas[0]?.id || '');
  const [expandedNode, setExpandedNode] = useState<string | null>('1');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateAI = async () => {
    if (!selectedPersonaId) {
      alert("Please select a Target Avatar first.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/marketing/emails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: selectedPersonaId })
      });
      
      if (!res.ok) throw new Error("Failed to generate");
      
      const data = await res.json();
      setSequence(data);
    } catch (err) {
      console.error(err);
      alert("Failed to generate sequence");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateEmail = (id: string, field: 'subject' | 'body', value: string) => {
    setSequence(seq => seq.map(node => node.id === id ? { ...node, [field]: value } : node));
  };

  return (
    <div className="flex gap-8 max-w-6xl">
      
      {/* TIMELINE PANE */}
      <div className="flex-1 space-y-6">
        {sequence.map((node, index) => (
          <div key={node.id} className="relative pl-8">
            {/* Timeline line connecting nodes */}
            {index !== sequence.length - 1 && (
              <div className="absolute left-[11px] top-8 bottom-[-24px] w-[2px] bg-indigo-100 dark:bg-indigo-900/50"></div>
            )}
            
            {/* Node Dot */}
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center border-2 border-white dark:border-zinc-950 z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400"></div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <button 
                onClick={() => setExpandedNode(expandedNode === node.id ? null : node.id)}
                className="w-full px-6 py-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" />
                    Day {node.dayOffset}
                  </div>
                  <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{node.label}</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${expandedNode === node.id ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedNode === node.id && (
                <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Subject Line</label>
                    <input 
                      type="text" 
                      value={node.subject}
                      onChange={(e) => updateEmail(node.id, 'subject', e.target.value)}
                      className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Email Body</label>
                    <textarea 
                      value={node.body}
                      onChange={(e) => updateEmail(node.id, 'body', e.target.value)}
                      className="w-full p-4 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-64"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* SIDEBAR SETTINGS */}
      <div className="w-80 flex-shrink-0 space-y-6">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
          <h3 className="font-bold text-zinc-800 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-500" />
            Sequence Settings
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                <User className="w-4 h-4" /> Target Avatar
              </label>
              <select 
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Select a Persona...</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button className="w-full mt-6 flex items-center justify-center gap-2 text-sm font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
            <Save className="w-4 h-4" /> Save Sequence
          </button>
        </div>

        {/* AI Generator Placeholder (Sprint 6) */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300">Agentic Copywriter</h3>
          </div>
          <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 mb-5">
            Let Quipsly AI draft this entire 5-day welcome sequence tailored perfectly to the psychological profile of your chosen avatar.
          </p>
          <button 
            onClick={handleGenerateAI}
            disabled={isGenerating || !selectedPersonaId}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? 'Generating...' : 'Generate Sequence'}
          </button>
        </div>
      </div>
    </div>
  );
}
