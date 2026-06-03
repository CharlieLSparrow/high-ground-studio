"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Wand2, Target, Film, CheckCircle2 } from 'lucide-react';

export default function QuipslyLandingPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'You have been added to the waitlist!');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Network error. Please try again later.');
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-indigo-500/30">
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Quipsly</span>
          </div>
          <Link 
            href="/create" 
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-sm font-medium border border-indigo-500/20 mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Beta coming soon
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500 leading-tight">
            The AI Operating System <br className="hidden md:block"/> for Content Creators.
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            From pre-production storyboarding to AI-generated marketing funnels, Quipsly is the all-in-one suite to orchestrate your entire digital empire.
          </p>

          {/* Waitlist Form */}
          <div className="max-w-md mx-auto pt-8">
            {status === 'success' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-emerald-50">You're on the list!</h3>
                <p className="text-emerald-200/70 text-sm text-center">
                  Keep an eye on your inbox. We'll send you an invite as soon as beta spots open up.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl focus-within:ring-2 ring-indigo-500/50 focus-within:border-indigo-500/50 transition-all">
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email" 
                    className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:outline-none focus:ring-0 placeholder:text-zinc-600"
                  />
                  <button 
                    disabled={status === 'loading'}
                    type="submit"
                    className="bg-white text-black px-6 py-3 rounded-xl font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
                  </button>
                </div>
                {status === 'error' && (
                  <p className="text-red-400 text-sm text-left px-4">{message}</p>
                )}
                <p className="text-xs text-zinc-600">Join 1,000+ creators waiting for beta access.</p>
              </form>
            )}
          </div>
        </div>

        {/* Feature Grid */}
        <div className="max-w-6xl mx-auto mt-32 grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6 border border-blue-500/30 group-hover:scale-110 transition-transform">
              <Film className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Pre-Production</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Build storyboards, auto-generate shot lists, and visualize your scenes with Gemini-powered image generation before you even pick up a camera.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6 border border-amber-500/30 group-hover:scale-110 transition-transform">
              <Target className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Marketing Suite</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Create AI personas, generate landing page copy, and simulate webhook-driven email sequences in a unified drag-and-drop campaign sandbox.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/30 group-hover:scale-110 transition-transform">
              <Wand2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Agentic Insights</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Watch as Quipsly actively analyzes your funnel conversion rates and pinpoints exact revenue leaks, offering actionable solutions in real-time.
            </p>
          </div>
        </div>

      </main>
      
      {/* Footer */}
      <footer className="border-t border-white/10 py-12 text-center text-zinc-600 text-sm mt-12">
        <p>© 2026 High Ground Studio. All rights reserved.</p>
        <Link href="/create" className="text-indigo-400 hover:text-indigo-300 mt-2 inline-block">Developer Access (Bypass)</Link>
      </footer>
    </div>
  );
}
