import Link from "next/link";
import { BookOpenText, Download, Mic2 } from "lucide-react";
import { notFound } from "next/navigation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const metadata = {
  title: "Continue Writing - Quipsly Capture",
  description: "Continue a private Quipsly writing draft by voice on iPhone.",
};

export default async function ContinueCaptureWritingPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  if (!uuidPattern.test(draftId)) notFound();
  const encodedDraftID = encodeURIComponent(draftId.toLowerCase());

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_#d9eee7,_transparent_44%),linear-gradient(180deg,#fffaf2,#f7ead5)] px-5 py-10 text-[#392d20]">
    <section className="w-full max-w-xl rounded-[2rem] border border-[#ddc9a5] bg-white/90 p-7 text-center shadow-xl shadow-[#5f4720]/10 sm:p-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#087f78] text-white"><Mic2 className="h-8 w-8" aria-hidden="true" /></span>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#087f78]">Quipsly Capture</p>
      <h1 className="mt-2 font-serif text-4xl font-black tracking-tight">Keep going by voice</h1>
      <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-6 text-[#715d43]">Add another spoken passage to the same private writing. Your existing words and original recordings stay connected.</p>
      <a href={`quipsly://writing/${encodedDraftID}?action=continue`} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#087f78] px-6 py-3 text-sm font-black text-white"><Mic2 className="h-4 w-4" aria-hidden="true" />Continue in Quipsly Capture</a>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Link href={`https://nest.quipsly.com/writing/${encodedDraftID}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8c5a2] bg-[#fffaf2] px-4 py-2 text-xs font-black text-[#55422e]"><BookOpenText className="h-4 w-4" aria-hidden="true" />Continue in browser</Link>
        <a href="https://testflight.apple.com/join/XwRRcYUm" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8c5a2] bg-[#fffaf2] px-4 py-2 text-xs font-black text-[#55422e]"><Download className="h-4 w-4" aria-hidden="true" />Get the iPhone beta</a>
      </div>
      <p className="mt-5 text-xs font-semibold leading-5 text-[#846d4f]">The link carries only the writing identifier. Capture verifies the signed-in account before it opens or records anything.</p>
    </section>
  </main>;
}
