import Link from "next/link";
import { ArrowLeft, CircleOff, MonitorPlay } from "lucide-react";

export const metadata = {
  title: "Render readiness - Quipsly",
  description: "Inspect the web render-worker capability boundary without simulated queue records.",
};

export default function RenderQueuePage() {
  return (
    <main className="mx-auto grid min-h-[75vh] max-w-4xl place-items-center px-4 py-10 text-studio-ink">
      <section role="status" aria-label="Render worker unavailable" className="w-full rounded-3xl border border-amber-300/35 bg-[#032321] p-8 shadow-studio-panel">
        <CircleOff className="h-10 w-10 text-amber-300" />
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Capability not connected</p>
        <h1 className="mt-2 text-3xl font-black">No web render worker is claiming this timeline</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-studio-muted">
          The old queue was an in-memory demo with a sample job and a browser connection to localhost. It could not prove source resolution, rendering, output delivery, or a durable artifact receipt, so it has been retired.
        </p>
        <div className="mt-6 rounded-2xl border border-studio-line bg-[#062d2a]/50 p-5">
          <div className="flex items-start gap-3">
            <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0 text-studio-tag" />
            <div>
              <h2 className="font-black">Current production lane</h2>
              <p className="mt-1 text-sm leading-6 text-studio-muted">
                Save and review the timeline in the web editor, then use Quipsly Studio on the production Mac for source-aware playback and rendering. A future web handoff must record actor, timeline version, source manifest, worker status, output hash, and final artifact location.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/editor" className="inline-flex items-center gap-2 rounded-xl bg-studio-tag px-4 py-2.5 text-sm font-black text-[#032321]">
            <ArrowLeft size={16} /> Return to editor
          </Link>
          <Link href="/beta-readiness" className="inline-flex rounded-xl border border-studio-line px-4 py-2.5 text-sm font-bold text-studio-ink hover:border-studio-tag">
            Inspect release evidence
          </Link>
        </div>
      </section>
    </main>
  );
}
