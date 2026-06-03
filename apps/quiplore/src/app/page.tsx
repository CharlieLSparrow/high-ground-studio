import Link from "next/link";
import { Play, Layers, Compass } from "lucide-react";
import { getLorelistsHomeData } from "./actions/feed-actions";

export default async function DiscoveryHubPage() {
  const lorelists = await getLorelistsHomeData();

  return (
    <main className="w-full min-h-screen bg-black text-white overflow-y-auto pb-24">
      {/* Hero Section */}
      <div className="relative w-full h-[60vh] flex items-end pb-12 px-6 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="absolute inset-0 z-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center" />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-black mb-4 tracking-tight">
            Quip<span className="text-amber-500">lore</span>
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-lg leading-relaxed">
            Explore curated 360° lesson paths, interactive knowledge feeds, and immersive learning experiences.
          </p>
          <div className="flex gap-4">
            <Link href="/video-stream" className="bg-white text-black px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all">
              <Compass size={20} />
              Start Swiping Feed
            </Link>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="px-6 py-8 space-y-12 relative z-10 -mt-8">
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Layers size={24} className="text-amber-500" />
            Curated Lorelists
          </h2>
          {lorelists.length === 0 ? (
            <div className="w-full p-8 border border-white/10 rounded-2xl bg-white/5 text-center">
              <p className="text-white/50">No Lorelists curated yet. Head to the Studio to create one!</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {lorelists.map(list => (
                <Link key={list.id} href={`/lorelist/${list.id}`} className="snap-start shrink-0 w-72 md:w-80 group">
                  <div className="w-full h-44 bg-zinc-900 rounded-xl overflow-hidden relative mb-3 group-hover:ring-2 ring-amber-500 transition-all shadow-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-900/40 to-black/80 z-0" />
                    
                    {/* Abstract visual background to make it look premium */}
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full" />
                    <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full" />

                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-10">
                      <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mb-3 group-hover:bg-amber-500 group-hover:scale-110 transition-all">
                        <Play size={20} className="text-white ml-1" fill="currentColor" />
                      </div>
                      <span className="text-xs font-bold text-white/70 uppercase tracking-widest">{list._count.items} Segments</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg leading-tight group-hover:text-amber-400 transition-colors line-clamp-1">{list.title}</h3>
                  <p className="text-sm text-white/50 line-clamp-2 mt-1">{list.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Future Rows Placeholder */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-white/80">Trending Concepts</h2>
          <div className="flex overflow-x-auto gap-3 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {["Computer Science", "Parkinson's Therapy", "Astrophysics", "UI Design", "Biomechanics"].map((concept, i) => (
              <div key={i} className="shrink-0 px-6 py-3 rounded-full bg-zinc-900 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer transition-colors font-medium">
                {concept}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
