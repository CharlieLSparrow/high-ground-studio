import React from "react";
import Link from "next/link";
import { Feather, ArrowRight, ShieldAlert, Sparkles, BookOpen, Clock } from "lucide-react";

export default function BetaWelcomePage() {
  return (
    <div className="min-h-screen bg-[#f6efe6] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 overflow-x-hidden relative">
      {/* Soft parchment texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-20 mix-blend-multiply"
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#f6efe6]/90 backdrop-blur-md border-b border-[#e8d0b5]/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-sans">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 flex items-center justify-center">
              <Feather className="w-6 h-6 text-[#a96735]" />
            </div>
            <span className="font-black text-2xl tracking-tight text-[#3d2618] font-serif">Quipsly</span>
          </Link>
          <div className="flex items-center gap-4">
             <span className="text-xs font-bold text-[#a96735] uppercase tracking-widest bg-[#fdf5eb] px-3 py-1 rounded-full border border-[#e8d0b5]">
               Private Beta
             </span>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-24 px-6 relative z-10">
        <div className="max-w-3xl mx-auto space-y-12">

          <div className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold text-[#3d2618] tracking-tight leading-tight">
              Welcome to the flock.
            </h1>
            <p className="text-xl text-[#8c552e] font-sans max-w-2xl mx-auto leading-relaxed">
              You are now part of the High Ground Odyssey private beta. Before you enter your Nest, let's set some expectations.
            </p>
          </div>

          {/* Account Reconciliation Warning */}
          <div className="bg-[#fffaf1] border-2 border-[#a96735] rounded-3xl p-8 md:p-10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#a96735]/10 rounded-bl-full -mr-10 -mt-10 pointer-events-none" />

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#fdf5eb] rounded-full flex items-center justify-center flex-shrink-0 border border-[#e8d0b5]">
                <Clock className="w-6 h-6 text-[#a96735]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#3d2618] mb-2">Patreon Syncing in Progress</h2>
                <p className="text-[#8c552e] font-sans leading-relaxed mb-4">
                  To keep the beta safe and cost-effective, we manually reconcile new Patreon sign-ups. Your account has been created, but <strong>it may take a few hours for your Nest to fully unlock</strong> depending on when you signed in.
                </p>
                <p className="text-[#8c552e] font-sans leading-relaxed text-sm italic">
                  (If you are on the $10 or $50 tier, you'll receive full access shortly. Free readers can browse public Lorelists immediately.)
                </p>
              </div>
            </div>
          </div>

          {/* What to expect */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-[#e8d0b5] p-8 rounded-3xl shadow-sm">
              <div className="w-10 h-10 bg-[#617c4d]/10 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-5 h-5 text-[#617c4d]" />
              </div>
              <h3 className="text-xl font-bold text-[#3d2618] mb-2">Living Documents</h3>
              <p className="text-sm text-[#8c552e] font-sans leading-relaxed">
                Your primary workspace is the Living Manuscript. Your Quipsly can organize, research, draft, and rewrite with you, but it will not silently replace your work. Tag chapters, add lenses, and prep Publishing Packets for podcasting or YouTube.
              </p>
            </div>

            <div className="bg-white border border-[#e8d0b5] p-8 rounded-3xl shadow-sm">
              <div className="w-10 h-10 bg-[#dc982f]/10 rounded-full flex items-center justify-center mb-4">
                <ShieldAlert className="w-5 h-5 text-[#dc982f]" />
              </div>
              <h3 className="text-xl font-bold text-[#3d2618] mb-2">Beta Realities</h3>
              <p className="text-sm text-[#8c552e] font-sans leading-relaxed">
                You will find bugs. Some Quipslys are still learning to fly. If a mobile recording segment gets interrupted, don't worry—recording breaks are now treated as safe, first-class sync data, not failures.
              </p>
            </div>
          </div>

          <div className="text-center pt-8">
            <a
              href="https://nest.quipsly.com/create"
              className="inline-flex items-center gap-3 bg-[#a96735] text-[#fdf5eb] px-10 py-5 rounded-xl font-bold hover:bg-[#8c552e] transition-all shadow-md text-xl font-sans"
            >
              Enter Your Nest <ArrowRight className="w-6 h-6" />
            </a>
            <p className="mt-4 text-xs text-[#a96735] font-sans uppercase tracking-widest font-bold">
              (Redirects to nest.quipsly.com)
            </p>
          </div>

        </div>
      </main>

      <footer className="border-t border-[#e8d0b5] py-12 mt-20 bg-[#fffaf1]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 text-center text-[#8c552e] text-sm font-medium font-sans">
          <p className="italic text-[#a96735]">"Collect words. Build wisdom."</p>
        </div>
      </footer>
    </div>
  );
}
