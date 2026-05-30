import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// Highly curated thematic brand profiles for each of the 10 niches
const NICHE_PROFILES: Record<string, {
  headline: string;
  sub: string;
  accent: string;
  themeClass: string;
  gradientFrom: string;
  gradientTo: string;
  featureTitle: string;
  featureDesc: string;
}> = {
  ai: {
    headline: "The Future, Curated Daily.",
    sub: "Zero-latency insights, neural summaries, and the daily Tonight Show monologue. Welcome to the cognitive edge.",
    accent: "#3b82f6",
    themeClass: "from-blue-600/20 via-purple-600/5 to-transparent",
    gradientFrom: "from-blue-500",
    gradientTo: "to-purple-500",
    featureTitle: "The AI Tonight Show",
    featureDesc: "An interactive, browser-voiced teleprompter monologue summarizing the day's neural shifts."
  },
  ukulele: {
    headline: "Four Strings. Endless Joy.",
    sub: "Mastering the warm, rhythmic hum of the island sound. From your first C chord to syncopated fingerpicking.",
    accent: "#f59e0b",
    themeClass: "from-amber-600/20 via-yellow-600/5 to-transparent",
    gradientFrom: "from-amber-500",
    gradientTo: "to-yellow-500",
    featureTitle: "Island Jam Sessions",
    featureDesc: "Interactive play-alongs, chord progression engines, and syncopated strumming trackers."
  },
  guitar: {
    headline: "Six Strings. Zero Excuses.",
    sub: "Diving deep into the fretboard, tone design, and acoustic mechanics. Build your practice, own your sound.",
    accent: "#b45309",
    themeClass: "from-orange-700/20 via-yellow-700/5 to-transparent",
    gradientFrom: "from-orange-600",
    gradientTo: "to-amber-700",
    featureTitle: "Fretboard Mechanics",
    featureDesc: "Interactive scale maps, modal pathways, and absolute physical tone-crafting checklists."
  },
  adhd: {
    headline: "Harnessing the High-Interest Mind.",
    sub: "Ditching shame, mapping dopamine peaks, and building spatial task engines tailored exactly for neurodivergent momentum.",
    accent: "#06b6d4",
    themeClass: "from-cyan-600/20 via-emerald-600/5 to-transparent",
    gradientFrom: "from-cyan-500",
    gradientTo: "to-emerald-500",
    featureTitle: "The Dopamine Engine",
    featureDesc: "Spatial task maps, high-stimulus timers, and gamified progress flows designed for focus."
  },
  leadership: {
    headline: "Autonomy, Purpose, and Influence.",
    sub: "Leadership isn't a title; it is the design of environments where human agency tip-toes into hyper-performance.",
    accent: "#eab308",
    themeClass: "from-yellow-600/20 via-slate-600/5 to-transparent",
    gradientFrom: "from-yellow-500",
    gradientTo: "to-amber-500",
    featureTitle: "Influence Case Studies",
    featureDesc: "Deep-dives into behavioral economics, organizational tipping points, and psychological safety."
  },
  photography: {
    headline: "Chasing Light. Telling Stories.",
    sub: "Aperture math, composition mechanics, and raw color science. Capture the texture of moments before they fade.",
    accent: "#f43f5e",
    themeClass: "from-rose-600/20 via-purple-600/5 to-transparent",
    gradientFrom: "from-rose-500",
    gradientTo: "to-purple-600",
    featureTitle: "Raw Lens Labs",
    featureDesc: "Interactive exposure maps, color grading LUT pipelines, and spatial composition theory."
  },
  "data-science": {
    headline: "From Raw Columns to Narrative Truth.",
    sub: "Converting tables, indices, and telemetry streams into human stories. The database is your library.",
    accent: "#10b981",
    themeClass: "from-emerald-600/20 via-teal-600/5 to-transparent",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-500",
    featureTitle: "Telemetry Streams",
    featureDesc: "3D cohort telemetry tracking viewer drop-offs and converting columns into stories."
  },
  "course-creation": {
    headline: "The Architecture of Understanding.",
    sub: "Designing immersive educational loops, active retrieval gates, and modules that students actually finish.",
    accent: "#6366f1",
    themeClass: "from-indigo-600/20 via-blue-600/5 to-transparent",
    gradientFrom: "from-indigo-500",
    gradientTo: "to-blue-500",
    featureTitle: "Learning Sciences Lab",
    featureDesc: "Active-recall design suites, spatial syllabus architects, and retention optimizing templates."
  },
  storytelling: {
    headline: "The Mechanics of Resonance.",
    sub: "Character tipping points, suspense tracks, and structural worldbuilding. Speak so the room listens.",
    accent: "#8b5cf6",
    themeClass: "from-violet-600/20 via-pink-600/5 to-transparent",
    gradientFrom: "from-violet-500",
    gradientTo: "to-pink-500",
    featureTitle: "Resonance Structures",
    featureDesc: "3-act plot templates, tension-track graphs, and character development workshops."
  },
  "wood-laser": {
    headline: "Precision Design. Physical Art.",
    sub: "Vector alignment, focal math, and materials science. Transform raw birch and acrylic under the arc of the light.",
    accent: "#ea580c",
    themeClass: "from-orange-600/20 via-red-600/5 to-transparent",
    gradientFrom: "from-orange-500",
    gradientTo: "to-red-600",
    featureTitle: "Vector Vector labs",
    featureDesc: "Speed/power calibration calculators, material curves, and physical assembly blueprints."
  }
};

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { niche } = await params;
  const profile = NICHE_PROFILES[niche.toLowerCase()];
  return {
    title: `${niche.toUpperCase()} Hub | High Ground Studio`,
    description: profile?.sub || `Discover curated news and learning modules for ${niche}.`,
  };
}

export default async function NicheHomePage({ params }: any) {
  const { niche } = await params;
  const lowerNiche = niche.toLowerCase();
  const profile = NICHE_PROFILES[lowerNiche];

  if (!profile) {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-white overflow-hidden relative">
      
      {/* Decorative Glow Grid */}
      <div className={`absolute inset-0 bg-gradient-to-b ${profile.themeClass} pointer-events-none z-0`} />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKSIvPjwvc3ZnPg==')] pointer-events-none opacity-40 z-0" />

      {/* Header */}
      <header className="h-20 w-full flex items-center justify-between px-8 border-b border-white/5 backdrop-blur bg-zinc-950/20 z-10">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${profile.gradientFrom} ${profile.gradientTo} flex items-center justify-center font-bold text-white shadow-lg`}>
            {niche.substring(0, 1).toUpperCase()}
          </div>
          <span className="font-mono text-sm tracking-widest uppercase text-white/70">{niche} // HUB</span>
        </div>
        <Link 
          href="http://localhost:3000" 
          className="text-xs text-zinc-500 hover:text-white transition-colors uppercase tracking-widest font-mono"
        >
          ← Return to Studio
        </Link>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10 max-w-4xl mx-auto">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 uppercase tracking-widest mb-6`}>
          <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: profile.accent }} />
          Live Platform
        </span>

        <h1 className={`text-5xl md:text-7xl font-black mb-6 tracking-tighter bg-gradient-to-r ${profile.gradientFrom} ${profile.gradientTo} bg-clip-text text-transparent`}>
          {profile.headline}
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl leading-relaxed">
          {profile.sub}
        </p>
        
        {/* Call to Actions */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link 
            href={`/sites/${lowerNiche}/news`} 
            className={`px-8 py-4 rounded-full font-bold shadow-lg transition-all hover:scale-105 bg-white text-zinc-950 hover:bg-zinc-100 flex items-center gap-2`}
          >
            Read Niche News
          </Link>
          <Link 
            href={`/sites/${lowerNiche}/learn`} 
            className={`px-8 py-4 rounded-full font-bold shadow-lg transition-all hover:scale-105 border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur flex items-center gap-2`}
          >
            Start Learning Hub
          </Link>
          {lowerNiche === "ai" && (
            <Link 
              href={`/sites/ai/tonight-show`} 
              className={`px-8 py-4 rounded-full font-bold shadow-lg transition-all hover:scale-105 bg-gradient-to-r ${profile.gradientFrom} ${profile.gradientTo} text-white flex items-center gap-2`}
            >
              🎤 Tonight Show Teleprompter
            </Link>
          )}
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full text-left">
          
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur hover:border-white/10 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
              <svg className="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2v3m2 3V10m0 0l-3-3m3 3l3-3" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{profile.featureTitle}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{profile.featureDesc}</p>
          </div>

          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur hover:border-white/10 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
              <svg className="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Fumadocs Learning Chapters</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">Lock down premium lessons behind the Patreon-integrated Network Pass with local paywalls.</p>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="h-16 w-full border-t border-white/5 flex items-center justify-between px-8 text-xs text-zinc-600 font-mono mt-auto relative z-10 bg-zinc-950/40 backdrop-blur">
        <span>© 2026 HIGH GROUND LABS</span>
        <span>MULTI-TENANT EXPEDITION</span>
      </footer>

    </div>
  );
}

