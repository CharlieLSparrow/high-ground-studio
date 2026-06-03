"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { 
  BarChart2, 
  Video, 
  TrendingUp, 
  Users, 
  Send, 
  Activity, 
  MousePointerClick, 
  MailOpen, 
  AlertOctagon, 
  ChevronRight, 
  Clock,
  Layout,
  Filter
} from "lucide-react";
import { StudioNav } from "../studio-nav";

// Existing 3D Bar Chart definition
interface TelemetryPoint {
  segmentIndex: number;
  timestamp: number;
  retentionRate: number;
}

function BarChart3D() {
  const [data, setData] = useState<TelemetryPoint[]>([]);

  useEffect(() => {
    fetch("/api/telemetry?videoId=AI-Revolution-01")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success && payload.data) {
          setData(payload.data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch telemetry", err);
      });
  }, []);

  const bars = useMemo(() => {
    if (data.length === 0) {
      // Fallback static data
      return Array.from({ length: 40 }).map((_, i) => {
        const height = Math.max(0.5, Math.random() * 5);
        const isDrop = i === 15 || i === 16;
        return {
          position: [(i - 20) * 0.3, height / 2, 0] as [number, number, number],
          height,
          color: isDrop ? "#f2a6a6" : "#4c6662",
        };
      });
    }

    return data.map((point) => {
      const height = Math.max(0.5, (point.retentionRate / 100) * 5);
      const isDrop = point.segmentIndex === 15 || point.segmentIndex === 16;
      return {
        position: [(point.segmentIndex - 20) * 0.3, height / 2, 0] as [number, number, number],
        height,
        color: isDrop ? "#f2a6a6" : "#9fd18b", // red for drop, green for good retention
      };
    });
  }, [data]);

  return (
    <group position={[0, -2.5, 0]}>
      {bars.map((bar, i) => (
        <mesh key={i} position={bar.position}>
          <boxGeometry args={[0.2, bar.height, 0.4]} />
          <meshStandardMaterial color={bar.color} roughness={0.2} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 5]} />
        <meshStandardMaterial color="#032321" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

interface Props {
  funnelViews: number;
  funnelConversions: number;
  funnelLeads: number;
  campaignStats: {
    dispatched: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  eventsLog: any[];
  eventBreakdown: any[];
  organization: any;
}

export function AnalyticsClientView({
  funnelViews,
  funnelConversions,
  funnelLeads,
  campaignStats,
  eventsLog,
  eventBreakdown,
  organization
}: Props) {
  const [activeTab, setActiveTab] = useState<"saas" | "video">("saas");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Conversion rates calculations
  const viewsToConversionsRate = funnelViews > 0 ? ((funnelConversions / funnelViews) * 100).toFixed(1) : "0";
  const openRate = campaignStats.dispatched > 0 ? ((campaignStats.opened / campaignStats.dispatched) * 100).toFixed(1) : "0";
  const clickRate = campaignStats.dispatched > 0 ? ((campaignStats.clicked / campaignStats.dispatched) * 100).toFixed(1) : "0";
  const bounceRate = campaignStats.dispatched > 0 ? ((campaignStats.bounced / campaignStats.dispatched) * 100).toFixed(1) : "0";

  return (
    <div className="flex flex-col gap-6 text-studio-ink bg-transparent min-h-screen">
      {/* Header controls */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-studio-line pb-6 shrink-0">
        <div>
          <span className="text-[10px] font-bold text-studio-tag uppercase tracking-widest">Workspace Telemetry</span>
          <h2 className="text-2xl font-black text-studio-ink mt-0.5">Studio Analytics</h2>
        </div>

        {/* Tab switch buttons */}
        <div className="flex items-center gap-2 bg-[#032321] border border-studio-line rounded-xl p-1 shrink-0 font-mono text-xs overflow-x-auto hide-scrollbar max-w-full">
          <button
            onClick={() => setActiveTab("saas")}
            className={`px-4 py-2 rounded-lg font-bold transition-all whitespace-nowrap ${
              activeTab === "saas" ? "bg-studio-tag text-[#032321]" : "text-studio-dim hover:text-studio-ink"
            }`}
          >
            <BarChart2 className="inline mr-1" size={14} /> SaaS BI Dashboard
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`px-4 py-2 rounded-lg font-bold transition-all whitespace-nowrap ${
              activeTab === "video" ? "bg-studio-tag text-[#032321]" : "text-studio-dim hover:text-studio-ink"
            }`}
          >
            <Video className="inline mr-1" size={14} /> Video Telemetry 3D
          </button>
        </div>
      </header>

      {/* Contents display */}
      <div className="flex-grow">
        
        {/* TAB 1: SAAS BI DASHBOARD */}
        {activeTab === "saas" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            {/* Top row cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#032321]/80 backdrop-blur-md border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-[10px] font-bold text-studio-dim uppercase tracking-wider flex items-center gap-1">
                  <Users size={12} className="text-studio-tag" /> CRM leads
                </span>
                <span className="text-3xl font-black text-studio-ink mt-2">{funnelLeads}</span>
                <span className="text-xs text-studio-muted mt-1">Active subscribers in database</span>
              </div>

              <div className="bg-[#032321]/80 backdrop-blur-md border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-[10px] font-bold text-studio-dim uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp size={12} className="text-[#f0b765]" /> Funnel Conversion
                </span>
                <span className="text-3xl font-black text-[#f0b765] mt-2">{viewsToConversionsRate}%</span>
                <span className="text-xs text-studio-muted mt-1">Landing page click-to-signup rate</span>
              </div>

              <div className="bg-[#032321]/80 backdrop-blur-md border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-[10px] font-bold text-studio-dim uppercase tracking-wider flex items-center gap-1">
                  <Send size={12} className="text-studio-source" /> Campaign dispatch
                </span>
                <span className="text-3xl font-black text-studio-source mt-2">{campaignStats.dispatched}</span>
                <span className="text-xs text-studio-muted mt-1">Total transactional emails sent</span>
              </div>

              <div className="bg-[#032321]/80 backdrop-blur-md border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-[10px] font-bold text-studio-dim uppercase tracking-wider flex items-center gap-1">
                  <Activity size={12} className="text-studio-tag" /> Events pipeline
                </span>
                <span className="text-3xl font-black text-studio-ink mt-2">{eventsLog.length}</span>
                <span className="text-xs text-studio-muted mt-1">Logged telemetry activities</span>
              </div>
            </div>

            {/* Campaign details */}
            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
              <h3 className="text-sm font-bold text-studio-dim uppercase tracking-wider mb-6 flex items-center gap-2">
                <Send className="text-studio-tag" size={16} />
                Campaign Dispatch Telemetry
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div className="p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold text-studio-muted uppercase">Sent Emails</span>
                  <span className="text-2xl font-black text-studio-ink mt-2">{campaignStats.dispatched}</span>
                </div>

                <div className="p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold text-sky-400 uppercase flex items-center gap-1">
                    <MailOpen size={10} /> Open Rate
                  </span>
                  <span className="text-2xl font-black text-sky-400 mt-2">{openRate}%</span>
                  <p className="text-[10px] text-studio-dim mt-1">{campaignStats.opened} opens recorded</p>
                </div>

                <div className="p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                    <MousePointerClick size={10} /> Click Rate
                  </span>
                  <span className="text-2xl font-black text-emerald-400 mt-2">{clickRate}%</span>
                  <p className="text-[10px] text-studio-dim mt-1">{campaignStats.clicked} clicks recorded</p>
                </div>

                <div className="p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase flex items-center gap-1">
                    <AlertOctagon size={10} /> Bounce Rate
                  </span>
                  <span className="text-2xl font-black text-rose-400 mt-2">{bounceRate}%</span>
                  <p className="text-[10px] text-studio-dim mt-1">{campaignStats.bounced} bounces recorded</p>
                </div>
              </div>
            </div>

            {/* Bottom grids */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Funnel conversion & rollups (3 cols) */}
              <div className="lg:col-span-3 flex flex-col gap-6">
                
                {/* Funnel visualizer */}
                <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex flex-col gap-6">
                  <h3 className="text-sm font-bold text-studio-dim uppercase tracking-wider flex items-center gap-2">
                    <Filter className="text-studio-tag" size={16} />
                    Acquisition Conversion Funnel
                  </h3>

                  {/* Horizontal steps */}
                  <div className="flex flex-col sm:flex-row gap-4 items-stretch justify-between relative">
                    <div className="flex-1 p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col gap-1 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-studio-source"></div>
                      <span className="text-[9px] font-bold text-studio-dim uppercase">Step 1: Funnel Views</span>
                      <span className="text-xl font-black text-studio-ink mt-1">{funnelViews}</span>
                      <span className="text-[10px] text-studio-muted">100% Views</span>
                    </div>

                    <div className="flex items-center justify-center shrink-0 text-studio-dim">
                      <ChevronRight className="w-5 h-5 max-sm:rotate-90" />
                    </div>

                    <div className="flex-1 p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col gap-1 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#f0b765]"></div>
                      <span className="text-[9px] font-bold text-studio-dim uppercase">Step 2: Signups</span>
                      <span className="text-xl font-black text-[#f0b765] mt-1">{funnelConversions}</span>
                      <span className="text-[10px] text-studio-muted">{viewsToConversionsRate}% conversion</span>
                    </div>

                    <div className="flex items-center justify-center shrink-0 text-studio-dim">
                      <ChevronRight className="w-5 h-5 max-sm:rotate-90" />
                    </div>

                    <div className="flex-1 p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col gap-1 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-studio-tag"></div>
                      <span className="text-[9px] font-bold text-studio-dim uppercase">Step 3: CRM Registered</span>
                      <span className="text-xl font-black text-studio-tag mt-1">{funnelLeads}</span>
                      <span className="text-[10px] text-studio-muted">Active Contacts Logged</span>
                    </div>
                  </div>
                </div>

                {/* Event aggregates */}
                <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
                  <h3 className="text-sm font-bold text-studio-dim uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Activity className="text-studio-tag" size={16} />
                    Event Frequency Rollups
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {eventBreakdown.map((item, idx) => (
                      <div key={idx} className="p-3.5 bg-[#062d2a]/20 border border-studio-line rounded-xl flex justify-between items-center">
                        <span className="font-bold text-xs text-studio-ink">{item.eventName}</span>
                        <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#032321] border border-studio-line text-[#f0b765] font-bold">
                          {item._count.id}
                        </span>
                      </div>
                    ))}
                    {eventBreakdown.length === 0 && (
                      <div className="col-span-2 text-center py-6 text-studio-dim italic text-xs">
                        No operations registered in the pipeline yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Event timelines log (2 cols) */}
              <div className="lg:col-span-2 bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-bold text-studio-dim uppercase tracking-wider flex items-center gap-2">
                    <Clock className="text-studio-tag" size={16} />
                    Live Activity Ledger
                  </h3>
                  <p className="text-[10px] text-studio-muted mt-0.5">Real-time pipeline stream capturing SaaS actions.</p>
                </div>

                <div className="flex flex-col gap-3 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                  {eventsLog.map((event) => {
                    const isExpanded = expandedEventId === event.id;
                    return (
                      <div key={event.id} className="border border-studio-line rounded-xl overflow-hidden bg-[#062d2a]/30">
                        <button
                          onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                          className="w-full flex justify-between items-center p-3 hover:bg-[#062d2a]/50 transition-colors text-left focus:outline-none"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-studio-tag shrink-0"></span>
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-studio-ink truncate">{event.eventName}</p>
                              <p className="text-[10px] text-studio-dim truncate">
                                {event.user.name || event.user.primaryEmail}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90 text-studio-tag" : "text-studio-dim"}`} />
                        </button>

                        {isExpanded && (
                          <div className="p-3 bg-[#032321] border-t border-studio-line font-mono text-[10px] flex flex-col gap-1.5">
                            <span className="text-studio-dim uppercase font-bold text-[9px]">Metadata Payload:</span>
                            <pre className="p-2.5 bg-black/40 text-studio-muted rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                              {JSON.stringify(JSON.parse(event.payloadJson), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {eventsLog.length === 0 && (
                    <div className="text-center py-12 text-studio-dim italic text-xs">
                      No activity telemetry captured.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: VIDEO TELEMETRY 3D */}
        {activeTab === "video" && (
          <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex flex-col gap-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
              <div>
                <h3 className="text-lg font-bold text-studio-ink">3D Retention Waveform</h3>
                <p className="text-xs text-studio-muted mt-0.5">Audience drop logs mapped back to Timeline Segment indices.</p>
              </div>
              <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold text-[10px] rounded-lg flex items-center gap-1.5 shrink-0">
                <AlertOctagon size={12} /> Sharp Viewers Drop Detected
              </div>
            </div>

            <div className="h-96 relative border border-studio-line rounded-xl overflow-hidden">
              <Canvas camera={{ position: [0, 5, 15], fov: 45 }}>
                <color attach="background" args={["#001615"]} />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <BarChart3D />
                <Environment preset="city" />
                <ContactShadows position={[0, -2.5, 0]} opacity={0.4} scale={30} blur={2} far={4} />
                <OrbitControls makeDefault minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2} autoRotate autoRotateSpeed={0.5} />
              </Canvas>
            </div>
            
            <div className="flex justify-between text-[10px] text-studio-dim font-mono uppercase font-bold tracking-widest mt-2">
              <span>Start</span>
              <span className="text-rose-400">View Drop (Index 15)</span>
              <span>End</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
