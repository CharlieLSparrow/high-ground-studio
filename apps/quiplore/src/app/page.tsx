// @ts-nocheck
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Feather, Sparkles, Quote, MessageSquare, CheckCircle2 } from "lucide-react";
import { getLorelistsHomeData } from "./actions/feed-actions";

export default async function QuiploreLandingPage() {
  const lorelists = await getLorelistsHomeData();

  return (
    <div className="min-h-screen bg-[#fdf1dc] text-[#4c331b] font-serif selection:bg-[#e2b17b]/50 overflow-x-hidden relative">
      
      {/* Soft paper texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-20 mix-blend-multiply" 
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#fdf1dc]/80 backdrop-blur-md border-b border-[#e2b17b]/40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-sans">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <Feather className="w-6 h-6 text-[#ad6b35]" />
            </div>
            <span className="font-black text-2xl tracking-tight text-[#4c331b] font-serif">QuipLore</span>
          </div>
          <div className="flex items-center gap-6">
            <Link 
              href="/hub" 
              className="text-sm font-bold text-[#ad6b35] hover:text-[#4c331b] transition-colors"
            >
              Explore Hub
            </Link>
            <Link 
              href="https://quipsly.com" 
              className="text-sm font-bold bg-[#ad6b35] hover:bg-[#4c331b] text-white px-5 py-2.5 rounded-xl transition-all shadow-md"
            >
              Meet the Quipslys
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-24 px-6 relative z-10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f8d9b0] text-[#ad6b35] text-xs font-bold uppercase tracking-widest border border-[#e2b17b] font-sans">
              <Sparkles className="w-3 h-3" />
              The Public Archive
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#4c331b] leading-[1.1]">
              The literary archive for your best ideas.
            </h1>
            
            <p className="text-lg md:text-xl text-[#ad6b35] leading-relaxed max-w-lg font-sans">
              Gather your favorite quotes, notes, and sparks of inspiration. QuipLore helps you discover verified quotes in a warm, trustworthy storybook archive.
            </p>

            <div className="flex gap-4 pt-4 font-sans">
               <Link href="/hub" className="bg-[#ad6b35] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#4c331b] transition-colors shadow-sm text-lg flex items-center gap-2">
                 <Quote className="w-5 h-5" />
                 Start Reading
               </Link>
            </div>
          </div>

          <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000">
            {/* Soft backdrop */}
            <div className="absolute inset-0 bg-[#f8d9b0] rounded-[2rem] blur-2xl transform rotate-3 scale-105" />
            
            <div className="relative bg-white p-4 rounded-[2rem] border border-[#e2b17b] shadow-xl rotate-1 hover:rotate-0 transition-transform duration-500">
              <div className="bg-[#fdf1dc] rounded-xl overflow-hidden border border-[#e2b17b]/50 relative">
                <Image 
                  src="/images/examples/quipsly-home-introduction-page.png" 
                  alt="QuipLore Interface" 
                  width={800} 
                  height={600} 
                  className="w-full h-auto object-cover opacity-95 hover:opacity-100 transition-opacity mix-blend-multiply"
                  priority
                />
              </div>
            </div>
            
            {/* Little floating elements to add whimsy */}
            <div className="absolute -bottom-6 -left-6 bg-white p-3 rounded-xl border border-[#e2b17b] shadow-lg rotate-[-5deg] animate-pulse">
               <Quote className="w-6 h-6 text-[#ad6b35]" />
            </div>
            <div className="absolute -top-4 -right-4 bg-white p-3 rounded-xl border border-[#e2b17b] shadow-lg rotate-[10deg] animate-pulse delay-150">
               <BookOpen className="w-6 h-6 text-[#ad6b35]" />
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="max-w-7xl mx-auto mt-32">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white border border-[#e2b17b] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#f8d9b0]/50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-2xl bg-[#fdf1dc] flex items-center justify-center mb-6 border border-[#e2b17b] relative z-10">
                <BookOpen className="w-7 h-7 text-[#ad6b35]" />
              </div>
              <h3 className="text-2xl font-bold text-[#4c331b] mb-3 relative z-10">Verified Sources</h3>
              <p className="text-[#ad6b35] leading-relaxed text-sm font-sans relative z-10">
                Every quote is carefully traced back to its origin. No more misattributions or fake internet quotes.
              </p>
            </div>

            <div className="bg-white border border-[#e2b17b] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-200 relative z-10">
                <Quote className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-[#4c331b] mb-3 relative z-10">Curated Lorelists</h3>
              <p className="text-[#ad6b35] leading-relaxed text-sm font-sans relative z-10">
                Explore collections of quotes built around themes, books, movies, and historical figures.
              </p>
            </div>

            <div className="bg-white border border-[#e2b17b] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mb-6 border border-sky-200 relative z-10">
                <MessageSquare className="w-7 h-7 text-sky-600" />
              </div>
              <h3 className="text-2xl font-bold text-[#4c331b] mb-3 relative z-10">Share Safely</h3>
              <p className="text-[#ad6b35] leading-relaxed text-sm font-sans relative z-10">
                Turn your favorite quotes into beautiful, shareable cards with full attribution and provenance.
              </p>
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-[#e2b17b] py-12 mt-20 bg-white/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[#ad6b35] text-sm font-medium font-sans">
          <div className="flex items-center gap-2">
            <Feather className="w-4 h-4 text-[#ad6b35]" />
            <span className="font-bold text-[#4c331b] font-serif text-lg tracking-wide">QuipLore</span>
          </div>
          <p>© 2026 High Ground Studio. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-[#4c331b] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#4c331b] transition-colors">Terms</a>
            <a href="https://quipsly.com" className="text-[#ad6b35] hover:text-[#4c331b] font-bold transition-colors">Powered by Quipsly</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
