"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PackageOpen, Youtube, CheckCircle2, AlertCircle, ArrowRight, Rss } from "lucide-react";
import { getEpisodeCandidatesBySlugAction, approveEpisodeCandidateAction } from "@/app/(app)/create/actions";
import { DashboardSkeleton, ContentBlockSkeleton } from "../components/LoadingSkeleton";

export default function PackageBuilderPage() {
  const searchParams = useSearchParams();
  const projectSlug = searchParams?.get("project") || "high-ground-odyssey-manuscript";

  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "media" | "destinations">("content");
  const [isLoading, setIsLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const loadCandidates = async () => {
    setIsLoading(true);
    try {
      const res = await getEpisodeCandidatesBySlugAction(projectSlug);
      if (res.ok && res.candidates) {
        setCandidates(res.candidates);
        if (res.candidates.length > 0) {
          setSelectedPkgId(res.candidates[0].id);
        } else {
          setSelectedPkgId(null);
        }
      }
    } catch (error) {
      console.error("Failed to load candidates", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadCandidates();
  }, [projectSlug]);

  const pkg = candidates.find(p => p.id === selectedPkgId) || null;

  useEffect(() => {
    setValidationErrors([]);
    if (pkg) {
      const errors: string[] = [];
      if (pkg.packet?.title?.length < 5) {
        errors.push("Title is too short for optimal SEO and discovery.");
      }
      if (!pkg.packet?.summary) {
        errors.push("Summary/meta description is required.");
      }
      setValidationErrors(errors);
    }
  }, [selectedPkgId, pkg]);

  const handleApprove = async () => {
    if (!selectedPkgId || approving) return;
    setApproving(true);
    try {
      const res = await approveEpisodeCandidateAction(selectedPkgId);
      if (res.ok) {
        alert(res.message || "Package approved and published live!");
        await loadCandidates();
      } else {
        alert(res.error || "Failed to approve package.");
      }
    } catch {
      alert("Failed to approve package.");
    }
    setApproving(false);
  };

  if (isLoading && candidates.length === 0) return <DashboardSkeleton />;

  if (candidates.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto h-full flex flex-col justify-center items-center text-center mt-16">
        <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mb-6">
          <PackageOpen className="w-10 h-10 text-amber-600 animate-pulse-slow" />
        </div>
        <h1 className="text-3xl font-black text-[#3d3122] mb-3">No compiled packages yet</h1>
        <p className="text-[#8c6b4a] max-w-lg mb-8 leading-relaxed">
          Open your living writing document, tag at least one section with the <strong className="text-[#3d3122]">#episode</strong> or <strong className="text-[#3d3122]">#chapter</strong> structure tag, and click <strong className="text-[#3d3122]">Compile Document Outline</strong> in the Publisher Panel.
        </p>
        <a href="/create" className="px-6 py-3 bg-[#3d3122] hover:bg-[#2c2217] text-white rounded-xl font-bold transition-all shadow-sm">
          Go to Writing Desk
        </a>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-[#3d3122] tracking-tight">Package Builder</h1>
          <p className="text-[#8c6b4a] font-medium mt-1">Transform raw drafts into public-safe distribution packages.</p>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Package Selection */}
        <div className="col-span-3 bg-white rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col overflow-hidden" role="region" aria-label="Package Queue">
          <div className="p-4 border-b border-[#e8dcc4] bg-[#f8f3e6]">
            <h2 className="font-bold text-sm text-[#5e4b33] uppercase tracking-wider">Queue</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {candidates.map(p => {
              const isSelected = selectedPkgId === p.id;
              return (
                <button 
                  key={p.id}
                  onClick={() => setSelectedPkgId(p.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${isSelected ? "bg-[#ebdcc8] border-[#c8a980] border" : "hover:bg-[#f8f3e6] border border-transparent"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${p.packet?.kind === "episode" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>
                      {p.packet?.kind || "EPISODE"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${p.candidateStatus === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {p.candidateStatus}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#3d3122] text-sm truncate">{p.projectionTitle}</h3>
                  <p className="text-xs text-[#8c6b4a] truncate mt-1">{p.packet?.summary || "No summary."}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Middle & Right Column: Builder Canvas */}
        <div className="col-span-9 flex flex-col bg-white rounded-2xl border border-[#e8dcc4] shadow-sm overflow-hidden">
          
          {/* Builder Header */}
          <div className="p-6 border-b border-[#e8dcc4] flex justify-between items-start bg-[#fdfaf6]">
            {!pkg ? <ContentBlockSkeleton /> : (
              <>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                      {pkg.packet?.kind || "EPISODE"}
                    </span>
                    <span className="text-xs text-[#8c6b4a] font-mono">{pkg.candidateId}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-[#3d3122]">{pkg.projectionTitle}</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {pkg.candidateStatus !== "published" ? (
                    <button 
                      onClick={handleApprove}
                      disabled={validationErrors.length > 0 || approving}
                      className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-amber-600"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {approving ? "Publishing..." : "Approve & Publish live"}
                    </button>
                  ) : (
                    <span className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Published Live
                    </span>
                  )}
                  {validationErrors.length > 0 && (
                     <span className="text-xs text-red-600 font-bold flex items-center gap-1">
                       <AlertCircle className="w-3 h-3" /> Fix errors to approve
                     </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Builder Tabs */}
          <div className="flex border-b border-[#e8dcc4] bg-[#f8f3e6] px-4" role="tablist">
            {(["content", "media", "destinations"] as const).map(tab => {
              const isActive = activeTab === tab;
              return (
                <button 
                  key={tab}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab}`}
                  id={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)} 
                  className={`px-4 py-3 font-bold text-sm border-b-2 transition-all focus:outline-none focus:bg-amber-50 ${isActive ? "border-amber-600 text-amber-700" : "border-transparent text-[#8c6b4a] hover:text-[#3d3122]"}`}
                >
                  {tab === "content" ? "Public Safe Content" : tab === "media" ? "Media Assets" : "Destination Overrides"}
                </button>
              );
            })}
          </div>

          {/* Builder Content Area */}
          <div 
            className="flex-1 overflow-y-auto p-6 bg-[#fdfaf6]"
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
          >
            {!pkg ? <ContentBlockSkeleton /> : (
              <>
                {validationErrors.length > 0 && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 text-red-800" role="alert">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm mb-1">Validation Errors Found</h4>
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === "content" && (
                  <div className="space-y-8">
                    <div>
                      <label htmlFor="pkg-summary" className="block text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-3">Summary (Meta Description)</label>
                      <textarea 
                        id="pkg-summary"
                        className="w-full p-4 rounded-xl border border-[#e8dcc4] bg-white text-sm text-[#3d3122] focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-shadow" 
                        rows={3} 
                        value={pkg.packet?.summary || ""} 
                        readOnly 
                        aria-readonly="true"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-3">Verified Pull Quotes</h3>
                        {pkg.packet?.verifiedQuotes?.length > 0 ? (
                          <div className="space-y-3" role="list">
                            {pkg.packet.verifiedQuotes.map((q: any, i: number) => (
                              <div key={i} className="p-4 bg-white rounded-xl border border-[#e8dcc4] shadow-sm" role="listitem">
                                <p className="text-[#5e4b33] italic text-sm">"{q.text}"</p>
                                <p className="text-xs font-bold text-amber-700 mt-2">— {q.attribution || "Homer"}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#8c6b4a] italic">No verified quotes compiled from this section.</p>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-3">Manuscript Text (MDX Draft)</h3>
                        <div className="p-4 bg-white rounded-xl border border-[#e8dcc4] shadow-sm max-h-[300px] overflow-y-auto text-sm text-[#5e4b33] leading-relaxed">
                          {pkg.packet?.body ? (
                            <div dangerouslySetInnerHTML={{ __html: pkg.packet.body }} />
                          ) : (
                            <p className="italic text-[#8c6b4a]">No body text compiled.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "media" && (
                  <div className="space-y-6">
                     <div className="border border-[#e8dcc4] rounded-xl p-4 bg-white flex flex-col md:flex-row gap-6 items-center">
                       <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 flex items-center justify-center">
                         {pkg.packet?.media?.thumbnailUrl ? (
                           <img src={pkg.packet.media.thumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                         ) : (
                           <span className="text-xs italic text-[#8c6b4a]">No Thumbnail</span>
                         )}
                       </div>
                       <div className="flex-1 w-full">
                         <h3 className="font-bold text-[#3d3122]">Primary Thumbnail URL</h3>
                         <input 
                           type="text" 
                           readOnly 
                           value={pkg.packet?.media?.thumbnailUrl || "No media thumbnail connected. Using default."} 
                           className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-[#8c6b4a] mt-2 outline-none" 
                           aria-label="Thumbnail URL" 
                         />
                         <p className="text-xs text-[#8c6b4a] mt-2">To configure media assets (e.g. dynamic audio recording file paths), edit your show prep settings.</p>
                       </div>
                     </div>
                  </div>
                )}

                {activeTab === "destinations" && (
                  <div className="space-y-6">
                    {/* Destination Status Panel */}
                    <div className="bg-[#fcf9f2] border border-[#e8dcc4] rounded-2xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-[#5e4b33] mb-4 flex items-center gap-2">
                        <PackageOpen className="w-5 h-5 text-amber-700 animate-pulse-slow" />
                        Distribution Pipeline Status
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* 1. HGO */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">HGO Site</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pkg.candidateStatus === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                {pkg.candidateStatus === "published" ? "Live" : "Staged"}
                              </span>
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">High Ground Odyssey</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal">Public episode rendering engine on highgroundodyssey.com</p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100">
                            {pkg.candidateStatus === "published" ? (
                              <a 
                                href={`https://highgroundodyssey.com/episodes/${pkg.projectionSlug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1 group"
                              >
                                View Live Episode <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-gray-400 italic">Pending publish approval</span>
                            )}
                          </div>
                        </div>

                        {/* 2. YouTube */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">YouTube</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pkg.packet?.media?.videoUrl || pkg.packet?.media?.youtubeId ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500"}`}>
                                {pkg.packet?.media?.videoUrl || pkg.packet?.media?.youtubeId ? "Linked" : "No Video"}
                              </span>
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Video Source</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal">YouTube upload and chapter marker synchronization</p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100">
                            {pkg.packet?.media?.videoUrl ? (
                              <a 
                                href={pkg.packet.media.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1 group"
                              >
                                Watch Video <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-gray-400 italic">No video link configured</span>
                            )}
                          </div>
                        </div>

                        {/* 3. Patreon */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Patreon</span>
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold uppercase">
                                Connected
                              </span>
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Patreon CTA</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal">Campaign sponsor sign-in and members-only teaser text</p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100">
                            <a 
                              href="https://patreon.com/c/HighGroundOdyssey"
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-purple-700 hover:text-purple-800 inline-flex items-center gap-1 group"
                            >
                              Go to Patreon <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                          </div>
                        </div>

                        {/* 4. Podcast RSS */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Podcast Feed</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pkg.candidateStatus === "published" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                                {pkg.candidateStatus === "published" ? "Active" : "Staged"}
                              </span>
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Podcast RSS</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal">iTunes and Spotify compliant dynamic self-hosted RSS XML</p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100">
                            <a 
                              href={`/api/public/podcast/rss/${projectSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group"
                            >
                              Open XML Feed <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* YouTube Preview */}
                      <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="bg-red-50 p-3 border-b border-red-100 flex items-center gap-2">
                          <Youtube className="w-5 h-5 text-red-600" aria-hidden="true" />
                          <span className="font-bold text-red-900 text-sm">YouTube Override metadata</span>
                        </div>
                        <div className="p-4 space-y-4">
                          {pkg.packet?.overrides?.youtube ? (
                            <>
                              <div>
                                <label className="text-xs font-bold text-[#8c6b4a] uppercase">Tags</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {(pkg.packet.overrides.youtube.tags || []).map((t: string) => (
                                    <span key={t} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">#{t}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                 <label htmlFor="yt-chapters" className="text-xs font-bold text-[#8c6b4a] uppercase">Chapter Markers</label>
                                 <textarea 
                                   id="yt-chapters" 
                                   className="w-full mt-1 p-2 border border-[#e8dcc4] rounded-lg text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none" 
                                   rows={4} 
                                   readOnly 
                                   value={(pkg.packet.overrides.youtube.chapterMarkers || []).join("\n")} 
                                 />
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-6 flex flex-col items-center text-[#8c6b4a]">
                              <AlertCircle className="w-8 h-8 mb-2 opacity-50" aria-hidden="true" />
                              <p className="text-sm font-medium">No YouTube overrides set.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Podcast RSS Preview */}
                      <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="bg-blue-50 p-3 border-b border-blue-100 flex items-center gap-2">
                          <Rss className="w-5 h-5 text-blue-600" aria-hidden="true" />
                          <span className="font-bold text-blue-900 text-sm">Podcast RSS Feeds</span>
                        </div>
                        <div className="p-4 space-y-4 text-xs text-[#5e4b33]">
                          <p className="leading-relaxed">
                            Your Dynamic XML Feed URL is live and self-hosted on this Nest:
                          </p>
                          <input 
                             type="text" 
                             readOnly 
                             value={typeof window !== "undefined" ? `${window.location.origin}/api/public/podcast/rss/${projectSlug}` : `/api/public/podcast/rss/${projectSlug}`} 
                             className="w-full bg-[#f8f3e6] border border-[#e8dcc4] rounded p-2 font-mono text-[10px] text-amber-800 outline-none" 
                          />
                          <p className="leading-relaxed text-[#8c6b4a]">
                            Feed dynamically queries all approved candidates where `candidateStatus = "published"`. Copy the URL above and feed it to Apple Podcasts or Spotify.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
