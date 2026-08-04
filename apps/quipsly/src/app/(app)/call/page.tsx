import Link from "next/link";
import { ArrowRight, Camera, Mic2, ShieldCheck, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CallRoomPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query: Record<string, string | string[] | undefined> = await (
    searchParams ?? Promise.resolve({})
  );
  const roomId = queryValue(query.roomId) || queryValue(query.room);
  if (roomId) {
    redirect(`/sessions/${encodeURIComponent(roomId)}?mode=live`);
  }

  return (
    <main className="min-h-screen bg-[#f7f0e3] px-5 py-10 text-[#3d3122] lg:px-10">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-sm">
        <div className="border-b border-[#e5d5b7] bg-[#211a14] px-6 py-8 text-[#fff7e8] md:px-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e7b15f]">Quipsly Live Session</p>
          <h1 className="mt-3 max-w-4xl font-serif text-4xl font-black tracking-tight md:text-5xl">Browser calls now live inside the work they belong to.</h1>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#d8c6a6]">Choose a saved Session, then use its Live room. That gives the call the right people, privacy, consent, Nest, chat thread, retained-source ledger, transcript, and follow-through instead of creating an orphan meeting.</p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 md:p-10">
          <article className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <Mic2 className="text-violet-800" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-black">Use external studio devices</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-violet-950">Select and preview a Shure, Canon, webcam, or other browser-visible microphone and camera before joining. Quipsly remembers the setup on that browser.</p>
          </article>
          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <Smartphone className="text-sky-800" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-black">Join from browser and iPhone</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-sky-950">Both clients join the same room with distinct per-device identities, so one person can intentionally use more than one device without evicting the first connection.</p>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <ShieldCheck className="text-emerald-800" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-black">Conversation is not hidden recording</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">Joining starts the conversation only. A separate visible, consent-bound action retains the high-quality browser or iPhone source and produces exact source receipts.</p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <Camera className="text-amber-800" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-black">The surrounding workspace matches the work</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-amber-950">Episodes add manuscript, shared Watch, production thread, timeline, editor, and publishing. Coaching adds private notes, goals, commitments, continuity, and reviewed client follow-up.</p>
          </article>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-[#e5d5b7] px-6 py-6 md:px-10">
          <Link href="/coaching/sessions" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white">Choose a Session <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link href="/schedule" className="inline-flex min-h-12 items-center rounded-full border border-[#d8c7a7] bg-white px-5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Open calendar</Link>
          <Link href="/projects" className="inline-flex min-h-12 items-center rounded-full border border-[#d8c7a7] bg-white px-5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Open Nests</Link>
        </div>
      </section>
    </main>
  );
}
