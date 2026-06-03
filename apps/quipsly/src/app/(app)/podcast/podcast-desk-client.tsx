"use client";

import { useState, useEffect } from "react";
import { 
  Play, 
  Plus, 
  Trash2, 
  Edit2, 
  Disc, 
  Globe, 
  Users, 
  Volume2, 
  Music, 
  Clock, 
  FileText, 
  Link as LinkIcon, 
  Sliders, 
  FolderPlus, 
  BarChart, 
  ArrowLeft,
  Settings,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { 
  getEpisodesAction, 
  createEpisodeAction, 
  updateEpisodeAction, 
  deleteEpisodeAction, 
  getCloudRendersAction,
  EpisodeData 
} from "./actions";

interface PodcastDeskClientProps {
  actor: {
    primaryEmail: string;
  };
}

export function PodcastDeskClient({ actor }: PodcastDeskClientProps) {
  const [view, setView] = useState<"list" | "form" | "analytics">("list");
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [cloudRenders, setCloudRenders] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form Fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioSizeBytes, setAudioSizeBytes] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [episodeType, setEpisodeType] = useState("full");
  const [season, setSeason] = useState<number | "">(1);
  const [episodeNumber, setEpisodeNumber] = useState<number | "">("");

  // Search Filter
  const [search, setSearch] = useState("");

  // Reload Episodes
  const loadEpisodes = async () => {
    setLoading(true);
    const res = await getEpisodesAction();
    if (res.success) {
      setEpisodes(res.episodes);
      setIsSimulated(!!res.isSimulated);
    } else {
      setErrorMsg(res.error || "Failed to load episodes.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEpisodes();
    getCloudRendersAction().then(setCloudRenders);
  }, []);

  // Set form fields for Editing
  const startEdit = (ep: any) => {
    setSelectedEpisode(ep);
    setTitle(ep.title);
    setSlug(ep.slug);
    setDescription(ep.description);
    setAudioUrl(ep.audioUrl);
    setAudioSizeBytes(ep.audioSizeBytes);
    setDurationSeconds(ep.durationSeconds);
    setEpisodeType(ep.episodeType);
    setSeason(ep.season || 1);
    setEpisodeNumber(ep.episodeNumber || "");
    setView("form");
  };

  // Clear form fields for Adding
  const startAdd = () => {
    setSelectedEpisode(null);
    setTitle("");
    setSlug("");
    setDescription("");
    setAudioUrl("");
    setAudioSizeBytes(0);
    setDurationSeconds(0);
    setEpisodeType("full");
    setSeason(1);
    setEpisodeNumber("");
    setView("form");
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const data: EpisodeData = {
      title,
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
      description,
      audioUrl,
      audioSizeBytes: Number(audioSizeBytes),
      durationSeconds: Number(durationSeconds),
      episodeType,
      season: season ? Number(season) : null,
      episodeNumber: episodeNumber ? Number(episodeNumber) : null,
    };

    let res;
    if (selectedEpisode) {
      res = await updateEpisodeAction(selectedEpisode.id, data);
    } else {
      res = await createEpisodeAction(data);
    }

    if (res.success) {
      setSuccessMsg(selectedEpisode ? "Episode updated successfully!" : "Episode published successfully!");
      await loadEpisodes();
      setTimeout(() => {
        setView("list");
        setSuccessMsg("");
      }, 1000);
    } else {
      setErrorMsg(res.error || "An error occurred during saving.");
    }
    setSaving(false);
  };

  // Handle Delete
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to unpublish and delete "${name}"?`)) return;
    const res = await deleteEpisodeAction(id);
    if (res.success) {
      setSuccessMsg("Episode deleted successfully.");
      await loadEpisodes();
      setTimeout(() => setSuccessMsg(""), 2000);
    } else {
      setErrorMsg(res.error || "Failed to delete episode.");
    }
  };

  // Quick Select Asset
  const selectAsset = (asset: any) => {
    setAudioUrl(asset.url);
    setAudioSizeBytes(asset.sizeBytes);
    setDurationSeconds(asset.durationSeconds);
    if (!title) {
      // Auto pre-populate title from clean filename
      const cleanTitle = asset.name
        .replace(".mp3", "")
        .replace(/_/g, " ")
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      setTitle(cleanTitle);
      setSlug(cleanTitle.toLowerCase().replace(/[^a-z0-9-_]/g, "-"));
    }
    setShowAssetPicker(false);
  };

  // Filter episodes
  const filteredEpisodes = episodes.filter(ep => 
    ep.title.toLowerCase().includes(search.toLowerCase()) || 
    ep.description.toLowerCase().includes(search.toLowerCase()) ||
    ep.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-zinc-100 font-sans p-6 md:p-10 select-none">
      
      {/* Header Bar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-zinc-900 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Disc className="h-5 w-5 text-white animate-spin" style={{ animationDuration: '8s' }} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">Podcast Publishing Desk</h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">HIGH GROUND MEDIA ENGINE</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-zinc-950/40 px-3.5 py-1.5 text-xs text-zinc-400 font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
            <span>Actor: {actor.primaryEmail}</span>
          </div>

          {view === "list" && (
            <>
              <button 
                onClick={() => setView("analytics")}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white"
              >
                <BarChart className="h-4 w-4" />
                View Demographics
              </button>
              <button 
                onClick={startAdd}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:scale-[1.02] transition-all px-4 py-2 text-xs font-black text-black active:scale-[0.98] shadow-lg shadow-amber-500/10"
              >
                <Plus className="h-4 w-4 text-black stroke-[3px]" />
                PUBLISH EPISODE
              </button>
            </>
          )}

          {view !== "list" && (
            <button 
              onClick={() => setView("list")}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Episodes
            </button>
          )}
        </div>
      </header>

      {/* Global alert messages */}
      {successMsg && (
        <div className="mb-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm font-semibold flex items-center gap-2 animate-pulse">
          <ShieldCheck className="h-4 w-4" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {errorMsg}
        </div>
      )}

      {/* Database offline seeder warning */}
      {isSimulated && (
        <div className="mb-8 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-xs flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 animate-bounce" />
          <div>
            <p className="font-bold">PostgreSQL Connection Warning</p>
            <p className="text-zinc-400 mt-0.5">Could not establish direct pool to PostgreSQL cluster. Switched to high-fidelity simulated memory state. You can still create and manage items inside the session context.</p>
          </div>
        </div>
      )}

      {/* 1. EPISODE LIST VIEW */}
      {view === "list" && (
        <div className="grid gap-6">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-zinc-900/30 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
            <div className="w-full sm:max-w-xs relative">
              <input 
                type="text" 
                placeholder="Search episodes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-2.5 text-zinc-300 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <div className="text-xs font-mono text-zinc-500">
              Showing {filteredEpisodes.length} of {episodes.length} episodes
            </div>
          </div>

          {/* Episodes Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-zinc-800 rounded-3xl bg-zinc-950/20">
              <Music className="h-12 w-12 text-zinc-700 mb-3" />
              <p className="text-sm font-semibold text-zinc-400">No episodes registered yet.</p>
              <p className="text-xs text-zinc-600 mt-1">Ready to launch your first high-interest podcast transmission.</p>
              <button 
                onClick={startAdd}
                className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                Launch Episode 1
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredEpisodes.map((ep) => (
                <div 
                  key={ep.id}
                  className="rounded-2xl border border-white/5 bg-zinc-950/40 hover:bg-zinc-900/40 p-5 md:p-6 transition-all duration-300 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center shrink-0">
                      <Music className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-[10px] font-mono tracking-wider font-bold text-amber-500 uppercase">
                          S{ep.season || "1"} • E{ep.episodeNumber || "X"}
                        </span>
                        <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[9px] font-mono font-bold text-zinc-400 border border-white/5 uppercase">
                          {ep.episodeType}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(ep.publishedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg text-white mt-1.5 hover:text-amber-400 transition-colors cursor-pointer" onClick={() => startEdit(ep)}>{ep.title}</h3>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{ep.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 w-full md:w-auto justify-between md:justify-end border-t md:border-none border-white/5 pt-4 md:pt-0">
                    <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 select-none">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-zinc-600" />
                        <span>{Math.round(ep.durationSeconds / 60)}m</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-zinc-600" />
                        <span>{(ep.audioSizeBytes / (1024 * 1024)).toFixed(1)}MB</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => startEdit(ep)}
                        className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5 transition-colors"
                        title="Edit episode"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(ep.id, ep.title)}
                        className="p-2 rounded-lg bg-zinc-950 hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 border border-white/5 hover:border-rose-900/50 transition-colors"
                        title="Unpublish episode"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* 2. FORM CREATIVE VIEW (PUBLISH / EDIT) */}
      {view === "form" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          
          <form onSubmit={handleSave} className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-md space-y-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider border-b border-white/5 pb-4">
              {selectedEpisode ? "EDIT EPISODE METADATA" : "TRANSMIT NEW PODCAST EPISODE"}
            </h2>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Episode Title</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!selectedEpisode) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"));
                    }
                  }}
                  placeholder="e.g. Episode 3: The Fumadocs Engine"
                  required
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Url Slug</label>
                <input 
                  type="text" 
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. episode-3-fumadocs-engine"
                  required
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Description / Show Notes</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Malcolm and Daniel dive deep into multi-tenant routing architectures and layout isolation strategies..."
                rows={4}
                required
                className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Audio Track Source URL</label>
                <button 
                  type="button"
                  onClick={() => setShowAssetPicker(true)}
                  className="text-xs text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1.5"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Pick from GCS Renders
                </button>
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://storage.googleapis.com/high-ground-studio/episodes/take_3.mp3"
                  required
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 pl-10 pr-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                <LinkIcon className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-600" />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Audio Size (Bytes)</label>
                <input 
                  type="number" 
                  value={audioSizeBytes || ""}
                  onChange={(e) => setAudioSizeBytes(Number(e.target.value))}
                  placeholder="14500320"
                  required
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Duration (Seconds)</label>
                <input 
                  type="number" 
                  value={durationSeconds || ""}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  placeholder="1800"
                  required
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Episode Type</label>
                <select 
                  value={episodeType}
                  onChange={(e) => setEpisodeType(e.target.value)}
                  className="w-full text-sm rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-zinc-300 focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  <option value="full">Full Episode</option>
                  <option value="bonus">Bonus Content</option>
                  <option value="trailer">Season Trailer</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Season Number</label>
                <input 
                  type="number" 
                  value={season}
                  onChange={(e) => setSeason(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Episode Number</label>
                <input 
                  type="number" 
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-sm rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 flex gap-4">
              <button 
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-black text-black hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 shadow-lg shadow-amber-500/10"
              >
                {saving ? "TRANSMITTING..." : selectedEpisode ? "SAVE CHANGES" : "PUBLISH TRANSMISSION"}
              </button>
              <button 
                type="button"
                onClick={() => setView("list")}
                className="px-6 rounded-xl border border-white/10 hover:bg-white/5 transition text-sm font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

          </form>

          {/* Right Info pane */}
          <div className="space-y-6">
            <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Publishing Specs
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                When you publish, this episode is instantly injected into your iTunes and Spotify compliant RSS XML feed.
              </p>
              <div className="mt-4 p-3 bg-black/35 rounded-xl border border-white/5 text-[11px] font-mono text-zinc-500 space-y-2">
                <div className="flex justify-between">
                  <span>Feed Schema</span>
                  <span className="text-amber-500">RSS 2.0</span>
                </div>
                <div className="flex justify-between">
                  <span>Compliance</span>
                  <span className="text-emerald-500">IAB Tech Lab V2</span>
                </div>
                <div className="flex justify-between">
                  <span>SSL Routing</span>
                  <span className="text-zinc-300">Enforced</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5" />
                Audio Enclosures
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Always ensure your audio assets are compiled as 128kbps stereo MP3 files for optimal multi-platform streaming performance.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* 3. DEDICATED ANALYTICS DECK VIEW */}
      {view === "analytics" && (
        <div className="grid gap-6">
          <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
              <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart className="h-5 w-5 text-amber-500" />
                CREATOR PERFORMANCE DEMOGRAPHICS
              </h2>
              <span className="text-xs font-mono text-zinc-500">IAB Standardized</span>
            </div>

            <div className="grid gap-6 md:grid-cols-3 mb-8">
              
              {/* Stat 1 */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Disc className="h-4 w-4 text-amber-500" />
                  Global Listens
                </div>
                <div className="text-3xl font-black text-white font-mono">1,842</div>
                <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                  <span className="text-emerald-500 font-bold">↑ 12%</span>
                  <span>vs last 30 days</span>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Users className="h-4 w-4 text-orange-500" />
                  Unique Cohorts
                </div>
                <div className="text-3xl font-black text-white font-mono">1,565</div>
                <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                  <span className="text-emerald-500 font-bold">↑ 8%</span>
                  <span>IP-hashed users</span>
                </div>
              </div>

              {/* Stat 3 */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Globe className="h-4 w-4 text-emerald-500" />
                  Regional Feeds
                </div>
                <div className="text-3xl font-black text-white font-mono">14 Countries</div>
                <div className="text-[10px] text-zinc-500 mt-2">Vercel Edge Resolved</div>
              </div>

            </div>

            {/* Geographical Cohorts graph */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-black/45 border border-white/5 rounded-2xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 font-mono">Top Listener Applications</h3>
                <div className="space-y-4">
                  {[
                    { name: "Apple Podcasts", count: 828, percent: 45 },
                    { name: "Spotify", count: 552, percent: 30 },
                    { name: "Web Player", count: 276, percent: 15 },
                    { name: "Other Players", count: 184, percent: 10 }
                  ].map(app => (
                    <div key={app.name}>
                      <div className="flex justify-between text-xs mb-1.5 font-mono text-zinc-400">
                        <span>{app.name}</span>
                        <span>{app.count} listens ({app.percent}%)</span>
                      </div>
                      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${app.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-black/45 border border-white/5 rounded-2xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 font-mono">Geographical Demographics</h3>
                <div className="space-y-4">
                  {[
                    { name: "United States (US)", count: 1105, percent: 60 },
                    { name: "United Kingdom (GB)", count: 276, percent: 15 },
                    { name: "Canada (CA)", count: 184, percent: 10 },
                    { name: "Other Countries", count: 277, percent: 15 }
                  ].map(geo => (
                    <div key={geo.name}>
                      <div className="flex justify-between text-xs mb-1.5 font-mono text-zinc-400">
                        <span>{geo.name}</span>
                        <span>{geo.count} listens ({geo.percent}%)</span>
                      </div>
                      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${geo.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. FLOATING ASSET PICKER DRAWER / MODAL */}
      {showAssetPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            
            <div className="p-6 border-b border-zinc-900 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-white">Select Audio Render</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">Google Cloud Storage Assets</p>
              </div>
              <button 
                onClick={() => setShowAssetPicker(false)}
                className="text-zinc-500 hover:text-white text-xl font-bold px-2 py-1"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {cloudRenders.map((asset) => (
                <div 
                  key={asset.name}
                  onClick={() => selectAsset(asset)}
                  className="rounded-xl border border-white/5 bg-zinc-900/40 hover:bg-zinc-800/40 hover:border-amber-500/20 p-4 transition-all duration-200 cursor-pointer flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0">
                      <Music className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-white truncate" title={asset.name}>{asset.name}</h4>
                      <p className="text-xs text-zinc-500 mt-1 font-mono">
                        {(asset.sizeBytes / (1024 * 1024)).toFixed(1)}MB • {Math.round(asset.durationSeconds / 60)} minutes
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-amber-500 border border-amber-500/20 rounded-full px-2.5 py-0.5 bg-amber-500/5 uppercase shrink-0">
                    Master
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
