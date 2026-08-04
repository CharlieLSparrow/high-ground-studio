import { ExternalLink, ShieldCheck, Smartphone } from "lucide-react";

export function CaptureAppHandoff({
  roomId,
  joinedFromInvitation = false,
}: {
  roomId: string;
  joinedFromInvitation?: boolean;
}) {
  const captureURL = `quipsly://session/${encodeURIComponent(roomId)}?mode=live`;
  return <section className={`rounded-[1.75rem] border p-5 shadow-sm ${joinedFromInvitation ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50/70"}`} aria-labelledby="capture-handoff-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex max-w-3xl items-start gap-3">
        <span className="rounded-2xl bg-white p-3 text-violet-800 shadow-sm"><Smartphone aria-hidden="true" /></span>
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${joinedFromInvitation ? "text-emerald-800" : "text-sky-800"}`}>{joinedFromInvitation ? "Invitation accepted" : "iPhone capture edge"}</p>
          <h2 id="capture-handoff-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{joinedFromInvitation ? "Choose where you want to join" : "Continue this exact Session in Quipsly Capture"}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Capture will re-check this signed-in account against Nest, focus this canonical Session, and show its current route and consent truth. The link cannot grant access, join media, or start recording.</p>
        </div>
      </div>
      <a href={captureURL} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-800"><ExternalLink size={15} aria-hidden="true" />Open Capture</a>
    </div>
    <p className="mt-4 flex gap-2 rounded-xl border border-white/80 bg-white/75 p-3 text-[11px] font-bold leading-5 text-[#5b472f]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />Staying in this browser and opening Capture are equivalent views of one Session—not two rooms. Join and recording remain separate explicit actions on either device.</p>
  </section>;
}
