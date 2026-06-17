"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PackageOpen, Youtube, CheckCircle2, AlertCircle, ArrowRight, Rss } from "lucide-react";
import { getEpisodeCandidatesBySlugAction, approveEpisodeCandidateAction, updateCandidatePacketAction, testPublishCandidateAction, retractEpisodeCandidateAction } from "@/app/(app)/create/actions";
import { DashboardSkeleton, ContentBlockSkeleton } from "../components/LoadingSkeleton";
import { DestinationStatusRail } from "../components/DestinationStatusRail";
import {
  buildCandidateDestinationStates,
  summarizeDestinationStates,
} from "@/lib/publishing/statusModel";

export default function PackageBuilderPage() {
  const searchParams = useSearchParams();
  const projectSlug = searchParams?.get("project") || "high-ground-odyssey-manuscript";

  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "media" | "destinations">("content");
  const [isLoading, setIsLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [retractingDestinations, setRetractingDestinations] = useState<Set<string>>(new Set());

  // Edit states for candidate packet
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editAudioUrl, setEditAudioUrl] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [editYoutubeTags, setEditYoutubeTags] = useState("");
  const [editYoutubeChapters, setEditYoutubeChapters] = useState("");
  const [editPatreonTeaser, setEditPatreonTeaser] = useState("");
  const [editPatreonIsMembersOnly, setEditPatreonIsMembersOnly] = useState(false);

  // Dry run states
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [activeDryRunTab, setActiveDryRunTab] = useState<"podcast_rss" | "youtube_v3" | "patreon_v2" | "quiplore">("podcast_rss");

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
  const destinationStates = pkg ? buildCandidateDestinationStates(pkg) : [];
  const destinationSummary = summarizeDestinationStates(destinationStates);

  const hgoState = destinationStates.find(d => d.destination === "high-ground-odyssey");
  const youtubeState = destinationStates.find(d => d.destination === "youtube");
  const patreonState = destinationStates.find(d => d.destination === "patreon");
  const rssState = destinationStates.find(d => d.destination === "podcast-rss");
  const quiploreState = destinationStates.find(d => d.destination === "quiplore");

  // Populate edit fields when the selected candidate changes
  useEffect(() => {
    setDryRunResult(null); // Reset dry run checks
    if (pkg) {
      setEditTitle(pkg.packet?.title || pkg.projectionTitle || "");
      setEditSummary(pkg.packet?.summary || "");
      setEditAudioUrl(pkg.packet?.media?.audioUrl || "");
      setEditVideoUrl(pkg.packet?.media?.videoUrl || "");
      setEditThumbnailUrl(pkg.packet?.media?.thumbnailUrl || "");
      setEditYoutubeTags((pkg.packet?.overrides?.youtube?.tags || []).join(", "));
      setEditYoutubeChapters((pkg.packet?.overrides?.youtube?.chapterMarkers || []).join("\n"));
      setEditPatreonTeaser(pkg.packet?.overrides?.patreon?.teaser || "");
      setEditPatreonIsMembersOnly(!!pkg.packet?.overrides?.patreon?.isMembersOnly);
    } else {
      setEditTitle("");
      setEditSummary("");
      setEditAudioUrl("");
      setEditVideoUrl("");
      setEditThumbnailUrl("");
      setEditYoutubeTags("");
      setEditYoutubeChapters("");
      setEditPatreonTeaser("");
      setEditPatreonIsMembersOnly(false);
    }
  }, [selectedPkgId, pkg]);

  const runDryRun = async () => {
    if (!selectedPkgId || dryRunLoading) return;
    setDryRunLoading(true);
    setDryRunResult(null);
    try {
      // Auto-save form contents first
      const tagsArray = editYoutubeTags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      const chaptersArray = editYoutubeChapters
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const saveRes = await updateCandidatePacketAction(selectedPkgId, {
        title: editTitle,
        summary: editSummary,
        media: {
          audioUrl: editAudioUrl,
          videoUrl: editVideoUrl,
          thumbnailUrl: editThumbnailUrl,
        },
        overrides: {
          youtube: {
            tags: tagsArray,
            chapterMarkers: chaptersArray,
          },
          patreon: {
            isMembersOnly: editPatreonIsMembersOnly,
            teaser: editPatreonTeaser,
          }
        }
      });

      if (!saveRes.ok) {
        alert(saveRes.error || "Failed to auto-save before dry-run validation.");
        setDryRunLoading(false);
        return;
      }

      const res = await testPublishCandidateAction(selectedPkgId);
      if (res.ok) {
        setDryRunResult(res);
      } else {
        alert(res.error || "Failed to execute pre-publish check.");
      }
    } catch (error: any) {
      alert(error.message || "Failed to execute pre-publish check.");
    } finally {
      setDryRunLoading(false);
    }
  };

  // Live validation on edited values
  useEffect(() => {
    setValidationErrors([]);
    if (pkg) {
      const errors: string[] = [];
      if (editTitle.length < 5) {
        errors.push("Title is too short for optimal SEO and discovery.");
      }
      if (!editSummary) {
        errors.push("Summary/meta description is required.");
      }
      setValidationErrors(errors);
    }
  }, [editTitle, editSummary, pkg]);

  const handleSave = async () => {
    if (!selectedPkgId || saving) return;
    setSaving(true);
    try {
      const tagsArray = editYoutubeTags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      const chaptersArray = editYoutubeChapters
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const res = await updateCandidatePacketAction(selectedPkgId, {
        title: editTitle,
        summary: editSummary,
        media: {
          audioUrl: editAudioUrl,
          videoUrl: editVideoUrl,
          thumbnailUrl: editThumbnailUrl,
        },
        overrides: {
          youtube: {
            tags: tagsArray,
            chapterMarkers: chaptersArray,
          },
          patreon: {
            isMembersOnly: editPatreonIsMembersOnly,
            teaser: editPatreonTeaser,
          }
        }
      });

      if (res.ok) {
        alert("Changes saved successfully!");
        // Reload list from the database to synchronize
        const resList = await getEpisodeCandidatesBySlugAction(projectSlug);
        if (resList.ok && resList.candidates) {
          setCandidates(resList.candidates);
        }
      } else {
        alert(res.error || "Failed to save changes.");
      }
    } catch (error: any) {
      alert(error.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedPkgId || approving || saving) return;
    setApproving(true);
    try {
      // Auto-save edited values first
      const tagsArray = editYoutubeTags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      const chaptersArray = editYoutubeChapters
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const saveRes = await updateCandidatePacketAction(selectedPkgId, {
        title: editTitle,
        summary: editSummary,
        media: {
          audioUrl: editAudioUrl,
          videoUrl: editVideoUrl,
          thumbnailUrl: editThumbnailUrl,
        },
        overrides: {
          youtube: {
            tags: tagsArray,
            chapterMarkers: chaptersArray,
          },
          patreon: {
            isMembersOnly: editPatreonIsMembersOnly,
            teaser: editPatreonTeaser,
          }
        }
      });

      if (!saveRes.ok) {
        alert(saveRes.error || "Failed to auto-save before publishing.");
        setApproving(false);
        return;
      }

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

  const handleRetract = async (destination: string) => {
    if (!confirm(`Are you sure you want to retract from ${destination}?`)) {
      return;
    }

    const nextSet = new Set(retractingDestinations);
    nextSet.add(destination);
    setRetractingDestinations(nextSet);

    try {
      const res = await retractEpisodeCandidateAction(selectedPkgId!, [destination]);
      if (res.ok) {
        alert(`Retraction for ${destination} enqueued successfully!`);
        await loadCandidates();
      } else {
        alert(res.error || `Failed to retract from ${destination}.`);
      }
    } catch (error: any) {
      alert(error.message || `Failed to retract from ${destination}.`);
    } finally {
      const cleanSet = new Set(retractingDestinations);
      cleanSet.delete(destination);
      setRetractingDestinations(cleanSet);
    }
  };

  const handleRetractAll = async () => {
    const publishedDests = destinationStates
      .filter(d => d.status === "published")
      .map(d => d.destination);
    if (publishedDests.length === 0) {
      alert("No destinations are currently published.");
      return;
    }
    if (!confirm(`Are you sure you want to retract this episode from: ${publishedDests.join(", ")}?`)) {
      return;
    }

    const nextSet = new Set(retractingDestinations);
    publishedDests.forEach(d => nextSet.add(d));
    setRetractingDestinations(nextSet);

    try {
      const res = await retractEpisodeCandidateAction(selectedPkgId!, publishedDests);
      if (res.ok) {
        alert("Retraction enqueued successfully. Destination statuses will update in the background.");
        await loadCandidates();
      } else {
        alert(res.error || "Failed to trigger retraction.");
      }
    } catch (error: any) {
      alert(error.message || "Failed to trigger retraction.");
    } finally {
      const cleanSet = new Set(retractingDestinations);
      publishedDests.forEach(d => cleanSet.delete(d));
      setRetractingDestinations(cleanSet);
    }
  };

  // Auto-polling for active background sync/rollback jobs
  useEffect(() => {
    const hasActiveJobs = candidates.some(c => {
      const states = buildCandidateDestinationStates(c);
      return states.some(s => s.status === "queued");
    });

    if (!hasActiveJobs) return;

    const interval = setInterval(async () => {
      try {
        const res = await getEpisodeCandidatesBySlugAction(projectSlug);
        if (res.ok && res.candidates) {
          setCandidates(res.candidates);
        }
      } catch (error) {
        console.error("Polling candidates failed", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [candidates, projectSlug]);

  const renderStatusBadge = (state: any) => {
    const status = state?.status;
    if (status === "published") {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">
          Live
        </span>
      );
    }
    if (status === "queued") {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 animate-pulse">
          Processing...
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-100 text-rose-800">
          Failed
        </span>
      );
    }
    if (status === "draft") {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 text-gray-800">
          Takedown
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
        Staged
      </span>
    );
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
        <a href="/projects?fallback=true" className="px-6 py-3 bg-[#3d3122] hover:bg-[#2c2217] text-white rounded-xl font-bold transition-all shadow-sm">
          Choose a Nest
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">
                      {destinationSummary.published} published
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                      {destinationSummary.ready} ready/queued
                    </span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-800">
                      {destinationSummary.needsAttention} needs review
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || approving}
                      className="px-4 py-2.5 bg-white border border-[#e8dcc4] hover:bg-[#fdfaf6] text-[#5e4b33] rounded-xl font-bold text-sm transition-all shadow-xs flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                    >
                      {saving ? "Saving..." : "Save Details"}
                    </button>
                    {pkg.candidateStatus !== "published" ? (
                      <button
                        onClick={handleApprove}
                        disabled={validationErrors.length > 0 || approving || saving}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-amber-600"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {approving ? "Publishing..." : "Approve & Publish live"}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <span className="px-4 py-2.5 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-sm flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Published Live
                        </span>
                        <button
                          onClick={handleRetractAll}
                          disabled={approving || saving}
                          className="px-4 py-2.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-sm transition-all shadow-xs flex items-center gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 cursor-pointer"
                        >
                          Takedown Episode
                        </button>
                      </div>
                    )}
                  </div>
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
                <div className="mb-6 rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg font-black text-[#3d3122]">Destination status</h3>
                      <p className="mt-1 text-xs leading-5 text-[#8c6b4a]">
                        This is the public packet map. It shows where this source-backed package is live, ready, queued, or blocked without exposing private manuscript notes.
                      </p>
                    </div>
                  </div>
                  <DestinationStatusRail states={destinationStates} />
                </div>

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
                      <label htmlFor="pkg-title" className="block text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-2">Title Override</label>
                      <input
                        id="pkg-title"
                        type="text"
                        className="w-full p-4 rounded-xl border border-[#e8dcc4] bg-white text-sm text-[#3d3122] focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-shadow"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Enter custom title for publication target"
                      />
                    </div>

                    <div>
                      <label htmlFor="pkg-summary" className="block text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-2">Summary (Meta Description)</label>
                      <textarea
                        id="pkg-summary"
                        className="w-full p-4 rounded-xl border border-[#e8dcc4] bg-white text-sm text-[#3d3122] focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-shadow"
                        rows={3}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        placeholder="Enter public meta summary description"
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
                     <div className="border border-[#e8dcc4] rounded-xl p-6 bg-white flex flex-col md:flex-row gap-6 items-start">
                       <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 flex items-center justify-center self-center">
                         {editThumbnailUrl ? (
                           <img src={editThumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                         ) : (
                           <span className="text-xs italic text-[#8c6b4a]">No Thumbnail</span>
                         )}
                       </div>
                       <div className="flex-1 w-full space-y-4">
                         <div>
                           <label htmlFor="pkg-thumbnail-url" className="block text-xs font-bold text-[#8c6b4a] uppercase">Primary Thumbnail URL</label>
                           <input
                             id="pkg-thumbnail-url"
                             type="text"
                             value={editThumbnailUrl}
                             onChange={(e) => setEditThumbnailUrl(e.target.value)}
                             placeholder="https://example.com/thumbnail.jpg"
                             className="w-full bg-white border border-[#e8dcc4] rounded-xl px-3 py-2 mt-1 text-sm font-mono text-[#3d3122] outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-shadow"
                           />
                         </div>

                         <div>
                           <label htmlFor="pkg-audio-url" className="block text-xs font-bold text-[#8c6b4a] uppercase">Public Podcast Audio URL (.mp3)</label>
                           <input
                             id="pkg-audio-url"
                             type="text"
                             value={editAudioUrl}
                             onChange={(e) => setEditAudioUrl(e.target.value)}
                             placeholder="https://example.com/podcast-episode.mp3"
                             className="w-full bg-white border border-[#e8dcc4] rounded-xl px-3 py-2 mt-1 text-sm font-mono text-[#3d3122] outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-shadow"
                           />
                         </div>

                         <div>
                           <label htmlFor="pkg-video-url" className="block text-xs font-bold text-[#8c6b4a] uppercase">YouTube Watch Link / Video Source URL</label>
                           <input
                             id="pkg-video-url"
                             type="text"
                             value={editVideoUrl}
                             onChange={(e) => setEditVideoUrl(e.target.value)}
                             placeholder="https://youtube.com/watch?v=..."
                             className="w-full bg-white border border-[#e8dcc4] rounded-xl px-3 py-2 mt-1 text-sm font-mono text-[#3d3122] outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-shadow"
                           />
                         </div>

                         <p className="text-xs text-[#8c6b4a]">These media assets map directly to destination enclosures (e.g. RSS feeds and video adapters) on approval.</p>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* 1. HGO */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">HGO Site</span>
                              {renderStatusBadge(hgoState)}
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">High Ground Odyssey</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal font-medium">
                              {hgoState?.notes || "Public episode rendering engine on highgroundodyssey.com"}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center gap-2">
                            {hgoState?.status === "published" ? (
                              <a
                                href={`https://highgroundodyssey.com/episodes/${pkg.projectionSlug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1 group"
                              >
                                View Live <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-gray-400 italic">Staged</span>
                            )}
                            {hgoState?.status === "published" && (
                              <button
                                onClick={() => handleRetract("high-ground-odyssey")}
                                disabled={retractingDestinations.has("high-ground-odyssey")}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:bg-gray-100 text-rose-700 disabled:text-gray-400 rounded-md border border-rose-200 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                {retractingDestinations.has("high-ground-odyssey") ? "Tearing down..." : "Takedown"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 2. YouTube */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">YouTube</span>
                              {renderStatusBadge(youtubeState)}
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Video Source</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal font-medium">
                              {youtubeState?.notes || "YouTube upload and chapter marker synchronization"}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center gap-2">
                            {editVideoUrl ? (
                              <a
                                href={editVideoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1 group"
                              >
                                Watch Video <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-gray-400 italic">No link</span>
                            )}
                            {youtubeState?.status === "published" && (
                              <button
                                onClick={() => handleRetract("youtube")}
                                disabled={retractingDestinations.has("youtube")}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:bg-gray-100 text-rose-700 disabled:text-gray-400 rounded-md border border-rose-200 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                {retractingDestinations.has("youtube") ? "Tearing down..." : "Takedown"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 3. Patreon */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Patreon</span>
                              {renderStatusBadge(patreonState)}
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Patreon CTA</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal font-medium">
                              {patreonState?.notes || (editPatreonIsMembersOnly ? `Members-Only Post (Teaser: ${editPatreonTeaser ? editPatreonTeaser.slice(0, 30) + '...' : 'none'})` : 'Campaign sponsor sign-in and public teaser')}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center gap-2">
                            <a
                              href="https://patreon.com/c/HighGroundOdyssey"
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-purple-700 hover:text-purple-800 inline-flex items-center gap-1 group"
                            >
                              Go to Patreon <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                            {patreonState?.status === "published" && (
                              <button
                                onClick={() => handleRetract("patreon")}
                                disabled={retractingDestinations.has("patreon")}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:bg-gray-100 text-rose-700 disabled:text-gray-400 rounded-md border border-rose-200 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                {retractingDestinations.has("patreon") ? "Tearing down..." : "Takedown"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 4. Podcast RSS */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Podcast Feed</span>
                              {renderStatusBadge(rssState)}
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">Podcast RSS</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal font-medium">
                              {rssState?.notes || "iTunes and Spotify compliant dynamic self-hosted RSS XML"}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center gap-2">
                            <a
                              href={`/api/public/podcast/rss/${projectSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group"
                            >
                              Open XML Feed <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                            {rssState?.status === "published" && (
                              <button
                                onClick={() => handleRetract("podcast-rss")}
                                disabled={retractingDestinations.has("podcast-rss")}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:bg-gray-100 text-rose-700 disabled:text-gray-400 rounded-md border border-rose-200 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                {retractingDestinations.has("podcast-rss") ? "Tearing down..." : "Takedown"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 5. QuipLore Semantic Library */}
                        <div className="bg-white p-4 rounded-xl border border-[#e8dcc4] flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Semantic Lib</span>
                              {renderStatusBadge(quiploreState)}
                            </div>
                            <h4 className="font-bold text-[#3d3122] text-sm">QuipLore Library</h4>
                            <p className="text-[11px] text-[#8c6b4a] mt-1 leading-normal font-medium">
                              {quiploreState?.notes || "Semantic quote parser, author references, and citation database index"}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center gap-2">
                            <a
                              href="/stream"
                              className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1 group"
                            >
                              View Quote Stream <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                            {quiploreState?.status === "published" && (
                              <button
                                onClick={() => handleRetract("quiplore")}
                                disabled={retractingDestinations.has("quiplore")}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:bg-gray-100 text-rose-700 disabled:text-gray-400 rounded-md border border-rose-200 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                {retractingDestinations.has("quiplore") ? "Tearing down..." : "Takedown"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* YouTube Override */}
                      <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="bg-red-50 p-3 border-b border-red-100 flex items-center gap-2">
                          <Youtube className="w-5 h-5 text-red-600" aria-hidden="true" />
                          <span className="font-bold text-red-900 text-sm">YouTube Override metadata</span>
                        </div>
                        <div className="p-4 space-y-4">
                          <div>
                            <label htmlFor="yt-tags" className="text-xs font-bold text-[#8c6b4a] uppercase">Tags (comma-separated)</label>
                            <input
                              id="yt-tags"
                              type="text"
                              value={editYoutubeTags}
                              onChange={(e) => setEditYoutubeTags(e.target.value)}
                              placeholder="lessons, rule, show, writing"
                              className="w-full mt-1 p-2 border border-[#e8dcc4] rounded-lg text-xs focus:ring-2 focus:ring-red-500 outline-none"
                            />
                          </div>
                          <div>
                             <label htmlFor="yt-chapters" className="text-xs font-bold text-[#8c6b4a] uppercase">Chapter Markers (one per line, e.g. 00:00 Intro)</label>
                             <textarea
                               id="yt-chapters"
                               className="w-full mt-1 p-2 border border-[#e8dcc4] rounded-lg text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none"
                               rows={4}
                               value={editYoutubeChapters}
                               onChange={(e) => setEditYoutubeChapters(e.target.value)}
                               placeholder={"00:00 Introduction\n01:30 First Beat\n03:45 Conclusion"}
                             />
                          </div>
                        </div>
                      </div>

                      {/* Patreon Override */}
                      <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="bg-purple-50 p-3 border-b border-purple-100 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">P</span>
                          <span className="font-bold text-purple-900 text-sm">Patreon Override metadata</span>
                        </div>
                        <div className="p-4 space-y-4">
                          <div>
                            <label htmlFor="patreon-teaser" className="text-xs font-bold text-[#8c6b4a] uppercase block mb-1">Teaser Text (Public Preview)</label>
                            <textarea
                              id="patreon-teaser"
                              className="w-full p-2 border border-[#e8dcc4] rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                              rows={3}
                              value={editPatreonTeaser}
                              onChange={(e) => setEditPatreonTeaser(e.target.value)}
                              placeholder="Preview description shown to non-patrons..."
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="checkbox"
                              id="patreon-members-only"
                              checked={editPatreonIsMembersOnly}
                              onChange={(e) => setEditPatreonIsMembersOnly(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <label htmlFor="patreon-members-only" className="text-xs font-bold text-[#5e4b33] uppercase select-none">
                              Gated (Members Only Post)
                            </label>
                          </div>
                        </div>
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

                    {/* Pre-Publish Dry Run Panel */}
                    <div className="border border-[#e8dcc4] rounded-xl bg-white overflow-hidden shadow-sm">
                      <div className="bg-amber-50 p-4 border-b border-amber-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-amber-700" />
                          <div>
                            <span className="font-bold text-amber-900 text-sm block">Pre-Publish Pipeline Check & Dry-Run</span>
                            <span className="text-[11px] text-[#8c6b4a] block">Validate metadata standards and inspect platform payloads before going public</span>
                          </div>
                        </div>
                        <button
                          onClick={runDryRun}
                          disabled={dryRunLoading}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 self-end"
                        >
                          {dryRunLoading ? "Running Checks..." : "Run Diagnostic Check"}
                        </button>
                      </div>

                      <div className="p-4 space-y-4">
                        {dryRunResult ? (
                          <div className="space-y-4">
                            {/* Validation results summarizer */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              {/* 1. Podcast RSS */}
                              <div className="p-3 rounded-xl border bg-[#fdfaf6] border-[#e8dcc4]">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-[#8c6b4a] uppercase">Podcast RSS</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${dryRunResult.validationResults.podcast_rss.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                    {dryRunResult.validationResults.podcast_rss.isValid ? "Valid" : "Invalid"}
                                  </span>
                                </div>
                                <ul className="text-[10px] space-y-1 mt-2">
                                  {dryRunResult.validationResults.podcast_rss.errors.map((e: string, i: number) => (
                                    <li key={i} className="text-red-700 font-medium flex items-center gap-1">• {e}</li>
                                  ))}
                                  {dryRunResult.validationResults.podcast_rss.warnings.map((w: string, i: number) => (
                                    <li key={i} className="text-amber-700 flex items-center gap-1">• {w}</li>
                                  ))}
                                  {dryRunResult.validationResults.podcast_rss.errors.length === 0 && dryRunResult.validationResults.podcast_rss.warnings.length === 0 && (
                                    <li className="text-emerald-700">✓ All RSS standards met.</li>
                                  )}
                                </ul>
                              </div>

                              {/* 2. YouTube */}
                              <div className="p-3 rounded-xl border bg-[#fdfaf6] border-[#e8dcc4]">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-[#8c6b4a] uppercase">YouTube</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${dryRunResult.validationResults.youtube_v3.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                    {dryRunResult.validationResults.youtube_v3.isValid ? "Valid" : "Invalid"}
                                  </span>
                                </div>
                                <ul className="text-[10px] space-y-1 mt-2">
                                  {dryRunResult.validationResults.youtube_v3.errors.map((e: string, i: number) => (
                                    <li key={i} className="text-red-700 font-medium flex items-center gap-1">• {e}</li>
                                  ))}
                                  {dryRunResult.validationResults.youtube_v3.warnings.map((w: string, i: number) => (
                                    <li key={i} className="text-amber-700 flex items-center gap-1">• {w}</li>
                                  ))}
                                  {dryRunResult.validationResults.youtube_v3.errors.length === 0 && dryRunResult.validationResults.youtube_v3.warnings.length === 0 && (
                                    <li className="text-emerald-700">✓ All YouTube standards met.</li>
                                  )}
                                </ul>
                              </div>

                              {/* 3. Patreon */}
                              <div className="p-3 rounded-xl border bg-[#fdfaf6] border-[#e8dcc4]">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-[#8c6b4a] uppercase">Patreon</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${dryRunResult.validationResults.patreon_v2.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                    {dryRunResult.validationResults.patreon_v2.isValid ? "Valid" : "Invalid"}
                                  </span>
                                </div>
                                <ul className="text-[10px] space-y-1 mt-2">
                                  {dryRunResult.validationResults.patreon_v2.errors.map((e: string, i: number) => (
                                    <li key={i} className="text-red-700 font-medium flex items-center gap-1">• {e}</li>
                                  ))}
                                  {dryRunResult.validationResults.patreon_v2.warnings.map((w: string, i: number) => (
                                    <li key={i} className="text-amber-700 flex items-center gap-1">• {w}</li>
                                  ))}
                                  {dryRunResult.validationResults.patreon_v2.errors.length === 0 && dryRunResult.validationResults.patreon_v2.warnings.length === 0 && (
                                    <li className="text-emerald-700">✓ All Patreon standards met.</li>
                                  )}
                                </ul>
                              </div>

                              {/* 4. QuipLore */}
                              <div className="p-3 rounded-xl border bg-[#fdfaf6] border-[#e8dcc4]">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-[#8c6b4a] uppercase">QuipLore</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${dryRunResult.validationResults.quiplore?.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                    {dryRunResult.validationResults.quiplore?.isValid ? "Valid" : "Invalid"}
                                  </span>
                                </div>
                                <ul className="text-[10px] space-y-1 mt-2">
                                  {dryRunResult.validationResults.quiplore?.errors.map((e: string, i: number) => (
                                    <li key={i} className="text-red-700 font-medium flex items-center gap-1">• {e}</li>
                                  ))}
                                  {dryRunResult.validationResults.quiplore?.warnings.map((w: string, i: number) => (
                                    <li key={i} className="text-amber-700 flex items-center gap-1">• {w}</li>
                                  ))}
                                  {dryRunResult.validationResults.quiplore?.errors.length === 0 && dryRunResult.validationResults.quiplore?.warnings.length === 0 && (
                                    <li className="text-emerald-700">✓ All QuipLore standards met.</li>
                                  )}
                                </ul>
                              </div>
                            </div>

                            {/* Payload inspector tabs */}
                            <div className="border border-[#e8dcc4] rounded-xl overflow-hidden bg-white shadow-2xs">
                              <div className="flex border-b border-[#e8dcc4] bg-[#f8f3e6] px-2">
                                {([
                                  { id: "podcast_rss", label: "Podcast RSS XML Preview" },
                                  { id: "youtube_v3", label: "YouTube JSON Payload" },
                                  { id: "patreon_v2", label: "Patreon JSON Payload" },
                                  { id: "quiplore", label: "QuipLore Semantic Payload" }
                                ] as const).map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => setActiveDryRunTab(t.id)}
                                    className={`px-3 py-2 text-xs font-bold border-b-2 transition-all ${activeDryRunTab === t.id ? "border-amber-600 text-amber-700 bg-white" : "border-transparent text-[#8c6b4a] hover:text-[#3d3122]"}`}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                              <div className="p-4 bg-gray-900 text-gray-100 max-h-[250px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                                {activeDryRunTab === "podcast_rss" && (
                                  <pre className="whitespace-pre-wrap">
{`<?xml version="1.0" encoding="UTF-8"?>
<item>
  <title>${dryRunResult.preparedPayloads.podcast_rss.title}</title>
  <description><![CDATA[${dryRunResult.preparedPayloads.podcast_rss.description}]]></description>
  <enclosure url="${dryRunResult.preparedPayloads.podcast_rss.enclosure || ""}" type="audio/mpeg" />
  <guid isPermaLink="false">${dryRunResult.preparedPayloads.podcast_rss.guid}</guid>
  <pubDate>${dryRunResult.preparedPayloads.podcast_rss.pubDate}</pubDate>
</item>`}
                                  </pre>
                                )}
                                {activeDryRunTab === "youtube_v3" && (
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(dryRunResult.preparedPayloads.youtube_v3, null, 2)}
                                  </pre>
                                )}
                                {activeDryRunTab === "patreon_v2" && (
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(dryRunResult.preparedPayloads.patreon_v2, null, 2)}
                                  </pre>
                                )}
                                {activeDryRunTab === "quiplore" && (
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(dryRunResult.preparedPayloads.quiplore, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-6 text-[#8c6b4a]">
                            <p className="text-xs">No validation results ready. Click <strong className="text-[#3d3122]">Run Diagnostic Check</strong> to dry-run the publishing sequence.</p>
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
