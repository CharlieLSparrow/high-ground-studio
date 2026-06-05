"use client";

import React, { useState, useEffect } from "react";
import { ResearchDashboard } from "@/components/research/ResearchDashboard";
import { QuoteVerificationTable } from "@/components/research/QuoteVerificationTable";
import { AuthorRelationshipGraph } from "@/components/research/AuthorRelationshipGraph";
import { TelemetryMetrics } from "@/components/research/TelemetryMetrics";
import { SourceMaterialViewer } from "@/components/research/SourceMaterialViewer";
import { 
  LayoutDashboard, 
  CheckSquare, 
  Network, 
  LineChart, 
  BookOpen, 
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  Home,
  ChevronRight as BreadcrumbArrow
} from "lucide-react";

export default function ResearchPortalPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Basic mock routing for the demo without needing Next router
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("view")) {
        setView(urlParams.get("view") as string);
      }
    }
  }, []);

  const handleNav = (newView: string) => {
    setView(newView);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `?view=${newView}`);
    }
  };

  const getBreadcrumbLabel = () => {
    const map: Record<string, string> = {
      dashboard: "Overview Dashboard",
      verification: "Verification Queue",
      sources: "Source Materials",
      relationships: "Entity Graph",
      telemetry: "Telemetry Analytics",
      settings: "System Settings"
    };
    return map[view] || "Dashboard";
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-amber-500/30">
      
      {/* Sidebar */}
      <aside 
        className={`${sidebarOpen ? 'w-64' : 'w-20'} shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-all duration-300 ease-in-out relative z-20`}
        aria-label="Primary Navigation"
      >
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
          {sidebarOpen ? (
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-amber-500 tracking-tight flex items-center gap-2">
                Quipsly <span className="text-zinc-100">Research</span>
              </h1>
            </div>
          ) : (
            <div className="w-full flex justify-center text-amber-500 font-bold text-xl">Q</div>
          )}
        </div>
        
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavItem onClick={() => handleNav("dashboard")} active={view === "dashboard"} icon={<LayoutDashboard size={18} />} label="Dashboard" collapsed={!sidebarOpen} />
          <NavItem onClick={() => handleNav("verification")} active={view === "verification"} icon={<CheckSquare size={18} />} label="Verification Queue" badge="14" collapsed={!sidebarOpen} />
          <NavItem onClick={() => handleNav("sources")} active={view === "sources"} icon={<BookOpen size={18} />} label="Source Materials" collapsed={!sidebarOpen} />
          <NavItem onClick={() => handleNav("relationships")} active={view === "relationships"} icon={<Network size={18} />} label="Entity Graph" collapsed={!sidebarOpen} />
          <NavItem onClick={() => handleNav("telemetry")} active={view === "telemetry"} icon={<LineChart size={18} />} label="Telemetry" collapsed={!sidebarOpen} />
        </nav>

        <div className="p-3 border-t border-zinc-800 shrink-0">
          <NavItem onClick={() => handleNav("settings")} active={view === "settings"} icon={<Settings size={18} />} label="Settings" collapsed={!sidebarOpen} />
        </div>

        {/* Collapse toggle */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 bg-zinc-800 border border-zinc-700 rounded-full p-1 text-zinc-400 hover:text-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0a0c]">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-md z-10 shrink-0">
          
          <div className="flex items-center gap-6 flex-1 min-w-0">
            {/* Mobile menu toggle (hidden on desktop in this mockup, but good practice) */}
            <button className="lg:hidden text-zinc-400 hover:text-white focus:outline-none">
              <Menu size={20} />
            </button>
            
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center text-sm text-zinc-500 font-medium">
              <ol className="flex items-center space-x-2">
                <li>
                  <button onClick={() => handleNav("dashboard")} className="hover:text-zinc-200 transition-colors focus:outline-none focus:underline flex items-center">
                    <Home size={14} className="mr-1.5" aria-hidden="true" />
                    Portal
                  </button>
                </li>
                <li><BreadcrumbArrow size={14} className="text-zinc-700" aria-hidden="true" /></li>
                <li>
                  <span className="text-zinc-200" aria-current="page">{getBreadcrumbLabel()}</span>
                </li>
              </ol>
            </nav>

            <div className="hidden md:flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 w-full max-w-md ml-auto transition-colors focus-within:border-amber-500/50 focus-within:bg-zinc-900/80">
              <Search size={16} className="text-zinc-500 shrink-0" aria-hidden="true" />
              <input 
                type="search" 
                placeholder="Search quotes, authors, or manuscripts... (Cmd+K)" 
                className="bg-transparent border-none outline-none text-sm w-full text-zinc-200 placeholder:text-zinc-600 focus:ring-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-5 ml-6 shrink-0">
            <button 
              className="relative p-2 text-zinc-400 hover:text-amber-400 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-full"
              aria-label="View notifications (1 unread)"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
            </button>
            <button 
              className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
              aria-label="User profile menu"
            >
              RL
            </button>
          </div>
        </header>

        {/* View Router */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 relative">
          <div className="absolute inset-0 z-0 bg-[url('/noise.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
          <div className="relative z-10 w-full h-full">
            {view === "dashboard" && <ResearchDashboard />}
            {view === "verification" && <QuoteVerificationTable />}
            {view === "sources" && <SourceMaterialViewer />}
            {view === "relationships" && <AuthorRelationshipGraph />}
            {view === "telemetry" && <TelemetryMetrics />}
            {view === "settings" && <div className="text-zinc-500 flex h-full items-center justify-center font-medium">Settings configuration panel pending...</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ 
  onClick, 
  active, 
  icon, 
  label, 
  badge, 
  collapsed 
}: { 
  onClick: () => void; 
  active: boolean; 
  icon: React.ReactNode; 
  label: string; 
  badge?: string;
  collapsed?: boolean;
}) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-sm transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-amber-500 ${
        active 
          ? "bg-amber-500/10 text-amber-500 font-medium" 
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <div className="flex items-center gap-3">
        <span className={`${active ? 'text-amber-500' : 'text-zinc-400 group-hover:text-zinc-200'} transition-colors`}>
          {icon}
        </span>
        {!collapsed && <span>{label}</span>}
      </div>
      {!collapsed && badge && (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
          active ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-300"
        }`}>
          {badge}
        </span>
      )}
      {collapsed && badge && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full"></span>
      )}
    </button>
  );
}
