"use client";

import Link from "next/link";
import { PackageOpen, Calendar, BarChart3, ArrowRight } from "lucide-react";
import { mockPackages, mockPublishedEvents } from "./mockData";

export default function PublishingSuiteDashboard() {
  const draftedPackages = mockPackages.length;
  const scheduledEvents = mockPublishedEvents.filter(e => e.status === "scheduled").length;

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col justify-center">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-[#3d3122] tracking-tight mb-4">The Transmitter</h1>
        <p className="text-lg text-[#8c6b4a] max-w-2xl mx-auto">
          Welcome to the Quipsly Publishing & Analytics Suite. Assemble your safe public packages, schedule them across platforms, and close the feedback loop.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8">
        
        <Link href="/publishing-suite/package-builder" className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <PackageOpen className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">Package Builder</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            Transform private drafts into public-safe distribution packages. Override tags, clip beats, and assign media.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            {draftedPackages} Packages waiting <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link href="/publishing-suite/calendar" className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Calendar className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">Dispatch Calendar</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            Manage your background jobs, embargo windows, and multi-platform rollout schedules.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            {scheduledEvents} Events scheduled <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link href="/publishing-suite/analytics" className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <BarChart3 className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">Analytics Nexus</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            See how your published packages are performing and map engagement back to the original source principles.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            View Performance <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

      </div>
    </div>
  );
}
