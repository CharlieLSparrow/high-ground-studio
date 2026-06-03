"use client";

import React, { useState } from 'react';
import { User, LayoutTemplate, Sparkles, Save, Eye } from 'lucide-react';
import { QuipslyAgenticInsights } from '@/components/marketing/QuipslyAgenticInsights';

export function BuilderClient({ personas }: { personas: any[] }) {
  const [headline, setHeadline] = useState('Supercharge Your Podcast Growth');
  const [subheadline, setSubheadline] = useState('Join 10,000+ creators getting daily tips on scaling their audience without spending a dime on ads.');
  const [ctaText, setCtaText] = useState('Get My Free Guide');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(personas[0]?.id || '');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [leadEmail, setLeadEmail] = useState('');
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);

  const handleGenerateAI = async () => {
    if (!selectedPersonaId) {
      alert("Please select a Target Avatar first.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/marketing/pages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: selectedPersonaId })
      });
      
      if (!res.ok) throw new Error("Failed to generate");
      
      const data = await res.json();
      setHeadline(data.headline);
      setSubheadline(data.subheadline);
      setCtaText(data.ctaText);
    } catch (err) {
      console.error(err);
      alert("Failed to generate copy");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCaptureLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail) return;

    setIsSubmittingLead(true);
    try {
      const res = await fetch('/api/marketing/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: leadEmail,
          name: leadEmail.split('@')[0], // Mock name
          // Since we are mocking the landing page, we don't have a hard ID, we just pass null or undefined
          landingPageId: null 
        })
      });

      if (!res.ok) throw new Error("Failed to capture");
      
      setLeadCaptured(true);
      setLeadEmail('');
      setTimeout(() => setLeadCaptured(false), 5000); // Reset after 5s
    } catch (err) {
      console.error(err);
      alert("Failed to subscribe");
    } finally {
      setIsSubmittingLead(false);
    }
  };

  return (
    <div className="flex w-full h-full divide-x divide-zinc-200 dark:divide-zinc-800">
      
      {/* LEFT PANE: BUILDER FORM */}
      <div className="w-[450px] flex flex-col bg-white dark:bg-zinc-950 overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-bold text-zinc-900 dark:text-white">Lead Capture Editor</h2>
          </div>
          <button className="flex items-center gap-2 text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Target Persona */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" /> Target Avatar
            </label>
            <select 
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Select a Persona...</option>
              {personas.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* AI Generator Placeholder (Sprint 6) */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-300">Agentic Copywriter</h4>
                <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-1 mb-3">
                  Let Quipsly AI write the entire page tailored to your selected Avatar.
                </p>
                <button 
                  onClick={handleGenerateAI}
                  disabled={isGenerating || !selectedPersonaId}
                  className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? 'Generating...' : 'Generate with AI'}
                </button>
              </div>
            </div>
          </div>

          {/* Manual Editor */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Headline</label>
            <textarea 
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Subheadline</label>
            <textarea 
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Call to Action (CTA)</label>
            <input 
              type="text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* RIGHT PANE: LIVE PREVIEW & INSIGHTS */}
      <div className="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-900">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-zinc-500" />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-sm">Live Preview</span>
          </div>
        </div>
        
        <div className="flex-1 p-8 overflow-y-auto flex gap-8">
          {/* Mock Landing Page */}
          <div className="flex-1 max-w-2xl mx-auto bg-white dark:bg-black rounded-2xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="h-6 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
            </div>
            <div className="p-12 flex flex-col items-center justify-center min-h-[500px] text-center">
              <h1 className="text-4xl font-extrabold text-zinc-900 dark:text-white mb-6 leading-tight">
                {headline || 'Enter your headline'}
              </h1>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10 max-w-lg">
                {subheadline || 'Enter your subheadline'}
              </p>
              
              {leadCaptured ? (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl font-bold flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-800 animate-in fade-in zoom-in duration-300">
                  <Sparkles className="w-5 h-5" />
                  Success! Webhook fired and sequence queued.
                </div>
              ) : (
                <form onSubmit={handleCaptureLead} className="flex flex-col sm:flex-row gap-3 w-full max-w-md mx-auto">
                  <input
                    type="email"
                    placeholder="Enter your best email..."
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    required
                    className="flex-1 p-4 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={isSubmittingLead}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg px-8 py-4 rounded-xl shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isSubmittingLead ? '...' : (ctaText || 'Submit')}
                  </button>
                </form>
              )}
            </div>
          </div>
          
          {/* Agentic Insights Sidebar */}
          <div className="w-80 flex-shrink-0">
             {/* We reuse the component, passing a mock funnel step just for visual testing */}
            <QuipslyAgenticInsights funnelStepsData={[{
                id: '1', stepOrder: 1, stepType: 'landing_page', name: 'Draft Page', views: 0, conversions: 0, expectedConvRate: 35, actualConvRate: 0
            }]} personaId={selectedPersonaId} />
          </div>
        </div>
      </div>

    </div>
  );
}
