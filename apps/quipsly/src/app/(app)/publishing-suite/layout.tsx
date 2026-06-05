import Link from "next/link";
import { PackageOpen, Calendar, BarChart3, Settings } from "lucide-react";

export default function PublishingSuiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full min-h-screen bg-[#fdfaf6]">
      {/* Sidebar Navigation for the Suite */}
      <aside className="w-64 flex-shrink-0 border-r border-[#e8dcc4] bg-[#f8f3e6] flex flex-col">
        <div className="p-6 border-b border-[#e8dcc4]">
          <h2 className="text-xl font-black text-[#3d3122] tracking-tight">The Transmitter</h2>
          <p className="text-xs text-[#8c6b4a] mt-1 font-medium">Publishing & Analytics</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/publishing-suite" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#5e4b33] hover:bg-[#ebdcc8] hover:text-[#3d3122] transition-colors">
            <Settings className="w-5 h-5 text-[#8c6b4a]" />
            <span className="font-bold text-sm">Overview</span>
          </Link>
          <Link href="/publishing-suite/package-builder" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#5e4b33] hover:bg-[#ebdcc8] hover:text-[#3d3122] transition-colors">
            <PackageOpen className="w-5 h-5 text-[#8c6b4a]" />
            <span className="font-bold text-sm">Package Builder</span>
          </Link>
          <Link href="/publishing-suite/calendar" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#5e4b33] hover:bg-[#ebdcc8] hover:text-[#3d3122] transition-colors">
            <Calendar className="w-5 h-5 text-[#8c6b4a]" />
            <span className="font-bold text-sm">Dispatch Calendar</span>
          </Link>
          <Link href="/publishing-suite/analytics" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#5e4b33] hover:bg-[#ebdcc8] hover:text-[#3d3122] transition-colors">
            <BarChart3 className="w-5 h-5 text-[#8c6b4a]" />
            <span className="font-bold text-sm">Analytics Nexus</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-[#e8dcc4]">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-[#e8dcc4]">
            <p className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-2">System Status</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#3d3122] font-medium">RSS Feed</span>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-[#3d3122] font-medium">YouTube API</span>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-[#3d3122] font-medium">Patreon API</span>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
