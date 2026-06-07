"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PackageOpen, Calendar, BarChart3, ArrowRight } from "lucide-react";
import { getPublishingSuiteStatsAction } from "@/app/(app)/create/actions";

export default function PublishingSuiteDashboard() {
  const searchParams = useSearchParams();
  const projectSlug = searchParams?.get("project") || "high-ground-odyssey-manuscript";

  const [stats, setStats] = useState({ drafted: 0, published: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const res = await getPublishingSuiteStatsAction(projectSlug);
        if (res.ok) {
          setStats({ drafted: res.drafted || 0, published: res.published || 0 });
        }
      } catch (error) {
        console.error("Failed to load stats", error);
      }
      setLoading(false);
    };
    loadStats();
  }, [projectSlug]);

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col justify-center">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-[#3d3122] tracking-tight mb-4">The Transmitter</h1>
        <p className="text-lg text-[#8c6b4a] max-w-2xl mx-auto">
          Welcome to the Quipsly Publishing & Analytics Suite. Assemble your safe public packages, schedule them across platforms, and close the feedback loop.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8">

        <Link href={`/publishing-suite/package-builder?project=${projectSlug}`} className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <PackageOpen className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">Package Builder</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            Transform private drafts into public-safe distribution packages. Override tags, clip beats, and assign media.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            {loading ? "..." : `${stats.drafted} Packages waiting`} <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link href={`/publishing-suite/calendar?project=${projectSlug}`} className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Calendar className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">Dispatch Calendar</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            Manage your background jobs, embargo windows, and multi-platform rollout schedules.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            {loading ? "..." : `${stats.published} Events scheduled`} <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link href={`/publishing-suite/analytics?project=${projectSlug}`} className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center text-center">
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

        <Link href={`/publishing-suite/youtube?project=${projectSlug}`} className="group bg-white rounded-3xl p-8 border border-[#e8dcc4] shadow-sm hover:shadow-md hover:border-red-400 transition-all flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
          </div>
          <h2 className="text-xl font-bold text-[#3d3122] mb-2">YouTube Desk</h2>
          <p className="text-sm text-[#8c6b4a] mb-6 flex-1">
            Manage channel OAuth, assemble YouTube payloads (Title, Tags, Chapters), and push directly to YouTube Data API.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-red-600">
            Open YouTube Desk <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

      </div>
    </div>
  );
}
