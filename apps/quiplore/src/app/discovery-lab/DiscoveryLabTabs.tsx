"use client";

import React, { useState } from "react";
import { TheOracle } from "../../components/discovery/TheOracle";
import { DailyDigest } from "../../components/discovery/DailyDigest";
import { Constellation3D } from "../../components/discovery/Constellation3D";
import { QuipStreamExperience } from "../../components/QuipStreamExperience";
import { Sparkles, Globe, BookOpen, Smartphone } from "lucide-react";

type Tab = "oracle" | "constellation" | "digest" | "stream";

export function DiscoveryLabTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("oracle");

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)]">
      {/* Tab Navigation */}
      <div className="bg-[#fdf1dc] border-b border-[#e2b17b]/50 sticky top-[60px] z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#4c331b]">Discovery Lab</h1>
            <p className="text-sm text-[#ad6b35]">Testing new curation interfaces for our 50k vectors.</p>
          </div>

          <div className="flex bg-[#fffaf1] p-1 rounded-full border border-[#e2b17b]/50 shadow-inner">
            <button
              onClick={() => setActiveTab("oracle")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "oracle"
                  ? "bg-[#ad6b35] text-white shadow-md"
                  : "text-[#ad6b35] hover:bg-[#e2b17b]/20"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              The Oracle
            </button>
            <button
              onClick={() => setActiveTab("constellation")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "constellation"
                  ? "bg-[#ad6b35] text-white shadow-md"
                  : "text-[#ad6b35] hover:bg-[#e2b17b]/20"
              }`}
            >
              <Globe className="w-4 h-4" />
              Constellation
            </button>
            <button
              onClick={() => setActiveTab("digest")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "digest"
                  ? "bg-[#ad6b35] text-white shadow-md"
                  : "text-[#ad6b35] hover:bg-[#e2b17b]/20"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Daily Digest
            </button>
            <button
              onClick={() => setActiveTab("stream")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "stream"
                  ? "bg-[#ad6b35] text-white shadow-md"
                  : "text-[#ad6b35] hover:bg-[#e2b17b]/20"
              }`}
            >
              <Smartphone className="w-4 h-4" />
              Endless Stream
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-grow">
        {activeTab === "oracle" && <TheOracle />}
        {activeTab === "constellation" && <Constellation3D />}
        {activeTab === "digest" && <DailyDigest />}
        {activeTab === "stream" && (
          <div className="h-[calc(100vh-140px)] max-w-md mx-auto mt-8 rounded-3xl overflow-hidden shadow-2xl border border-[#e2b17b]/50">
            <QuipStreamExperience fullScreen={true} />
          </div>
        )}
      </div>
    </div>
  );
}
