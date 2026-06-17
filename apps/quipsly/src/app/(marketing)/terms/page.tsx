import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#fdf5eb] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 relative flex flex-col justify-center items-center p-6">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 p-6 flex justify-start max-w-7xl mx-auto">
        <Link href="/" className="text-sm font-bold text-[#a96735] hover:text-[#4a2e1c] transition-colors flex items-center gap-2 font-sans">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </nav>

      <div className="max-w-2xl w-full bg-white border border-[#e8d0b5] rounded-[3rem] p-10 md:p-16 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#fdf5eb] border border-[#e8d0b5] mb-6">
          <FileText className="w-8 h-8 text-[#a96735]" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#3d2618] tracking-tight mb-4">
          Terms of Service (Beta)
        </h1>
        <p className="text-[#8c552e] font-sans leading-relaxed mb-8">
          Quipsly is currently in a closed private beta for our Patreon supporters. By participating in this beta, you acknowledge that the software is provided "as is" and may contain bugs, incomplete features, or experience downtime. Our full Terms of Service will be available before the public launch.
        </p>
        <p className="text-sm text-[#a96735] font-sans italic">
          Last updated: June 2026
        </p>
      </div>
    </div>
  );
}
