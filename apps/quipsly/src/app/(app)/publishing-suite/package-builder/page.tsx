"use client";

import { useState, useEffect } from "react";
import { PackageOpen, Youtube, Rss, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";
import { mockPackages } from "../mockData";
import { DashboardSkeleton, ContentBlockSkeleton } from "../components/LoadingSkeleton";

export default function PackageBuilderPage() {
  const [selectedPkgId, setSelectedPkgId] = useState(mockPackages[0].id);
  const pkg = mockPackages.find(p => p.id === selectedPkgId) || mockPackages[0];

  const [activeTab, setActiveTab] = useState<"content" | "media" | "destinations">("content");
  const [isLoading, setIsLoading] = useState(true);
  
  // SAAS UPGRADE: Simulated Validation State
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    setValidationErrors([]);
    const timer = setTimeout(() => {
      setIsLoading(false);
      // Mock validation logic
      if (pkg.overrides?.youtube && pkg.title.length < 5) {
         setValidationErrors(["Title is too short for optimal YouTube discovery."]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pkg.id]);

  if (isLoading && mockPackages.length === 0) return <DashboardSkeleton />;

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-[#3d3122] tracking-tight">Package Builder</h1>
          <p className="text-[#8c6b4a] font-medium mt-1">Transform raw drafts into public-safe distribution packages.</p>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Package Selection - SAAS UPGRADE: Keyboard Accessibility */}
        <div className="col-span-3 bg-white rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col overflow-hidden" role="region" aria-label="Package Queue">
          <div className="p-4 border-b border-[#e8dcc4] bg-[#f8f3e6]">
            <h2 className="font-bold text-sm text-[#5e4b33] uppercase tracking-wider">Queue</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {mockPackages.map(p => {
              const isSelected = selectedPkgId === p.id;
              return (
                <button 
                  key={p.id}
                  onClick={() => setSelectedPkgId(p.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${isSelected ? "bg-[#ebdcc8] border-[#c8a980] border" : "hover:bg-[#f8f3e6] border border-transparent"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${p.kind === "episode" ? "bg-blue-100 text-blue-800" : p.kind === "video" ? "bg-red-100 text-red-800" : "bg-purple-100 text-purple-800"}`}>
                      {p.kind}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#3d3122] text-sm truncate">{p.title}</h3>
                  <p className="text-xs text-[#8c6b4a] truncate mt-1">{p.summary}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Middle & Right Column: Builder Canvas */}
        <div className="col-span-9 flex flex-col bg-white rounded-2xl border border-[#e8dcc4] shadow-sm overflow-hidden">
          
          {/* Builder Header */}
          <div className="p-6 border-b border-[#e8dcc4] flex justify-between items-start bg-[#fdfaf6]">
            {isLoading ? <ContentBlockSkeleton /> : (
              <>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">{pkg.kind}</span>
                    <span className="text-xs text-[#8c6b4a] font-mono">{pkg.id}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-[#3d3122]">{pkg.title}</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button 
                    disabled={validationErrors.length > 0}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-amber-600"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Package
                  </button>
                  {validationErrors.length > 0 && (
                     <span className="text-xs text-red-600 font-bold flex items-center gap-1">
                       <AlertCircle className="w-3 h-3" /> Fix errors to approve
                     </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Builder Tabs - SAAS UPGRADE: Accessible Tablist */}
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
            {isLoading ? <ContentBlockSkeleton /> : (
              <>
                {/* SAAS UPGRADE: Error Boundary Display */}
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
                        className="w-full p-4 rounded-xl border border-[#e8dcc4] bg-white text-sm text-[#3d3122] focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50 disabled:text-gray-500" 
                        rows={3} 
                        value={pkg.summary} 
                        readOnly 
                        aria-readonly="true"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-3">Verified Pull Quotes</h3>
                        {pkg.verifiedQuotes.length > 0 ? (
                          <div className="space-y-3" role="list">
                            {pkg.verifiedQuotes.map((q, i) => (
                              <div key={i} className="p-4 bg-white rounded-xl border border-[#e8dcc4] shadow-sm" role="listitem">
                                <p className="text-[#5e4b33] italic text-sm">"{q.text}"</p>
                                <p className="text-xs font-bold text-amber-700 mt-2">— {q.attribution}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#8c6b4a] italic">No verified quotes in this package.</p>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-3">Episode Beats</h3>
                        {pkg.beats.length > 0 ? (
                          <div className="space-y-3" role="list">
                            {pkg.beats.map((b, i) => (
                              <div key={i} className="p-3 bg-white rounded-xl border border-[#e8dcc4] flex gap-3 items-start shadow-sm" role="listitem">
                                <div className="bg-[#f8f3e6] px-2 py-1 rounded text-xs font-mono text-[#8c6b4a]">{Math.floor((b.timestamp || 0) / 60)}:{(b.timestamp || 0) % 60 === 0 ? "00" : (b.timestamp || 0) % 60}</div>
                                <div>
                                  <p className="font-bold text-sm text-[#3d3122]">{b.title}</p>
                                  <p className="text-xs text-[#6b5b45] mt-1">{b.summary}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#8c6b4a] italic">No timeline beats defined.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "media" && (
                  <div className="space-y-6">
                     {pkg.media.thumbnailUrl && (
                       <div className="border border-[#e8dcc4] rounded-xl p-4 bg-white flex gap-6 items-center hover:shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-amber-500">
                         <div className="w-40 h-40 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                           <img src={pkg.media.thumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                         </div>
                         <div>
                           <h3 className="font-bold text-[#3d3122]">Primary Thumbnail</h3>
                           <input type="text" readOnly value={pkg.media.thumbnailUrl} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-[#8c6b4a] mt-2 outline-none" aria-label="Thumbnail URL" />
                           <p className="text-xs text-green-600 font-bold mt-3 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> CDN Verified</p>
                         </div>
                       </div>
                     )}
                     {/* Other media blocks... */}
                  </div>
                )}

                {activeTab === "destinations" && (
                  <div className="grid grid-cols-2 gap-6">
                    {/* YouTube Preview */}
                    <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-red-500">
                      <div className="bg-red-50 p-3 border-b border-red-100 flex items-center gap-2">
                        <Youtube className="w-5 h-5 text-red-600" aria-hidden="true" />
                        <span className="font-bold text-red-900 text-sm">YouTube Override</span>
                      </div>
                      <div className="p-4 space-y-4">
                        {pkg.overrides?.youtube ? (
                          <>
                            <div>
                              <label className="text-xs font-bold text-[#8c6b4a] uppercase">Tags</label>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {pkg.overrides.youtube.tags.map(t => <span key={t} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">#{t}</span>)}
                              </div>
                            </div>
                            <div>
                               <label htmlFor="yt-chapters" className="text-xs font-bold text-[#8c6b4a] uppercase">Chapter Markers</label>
                               <textarea id="yt-chapters" className="w-full mt-1 p-2 border border-[#e8dcc4] rounded-lg text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none transition-shadow" rows={4} readOnly value={pkg.overrides.youtube.chapterMarkers.join("\n")} aria-label="YouTube Chapter Markers" />
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
