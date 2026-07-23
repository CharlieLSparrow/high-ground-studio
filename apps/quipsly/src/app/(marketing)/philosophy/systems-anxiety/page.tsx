import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Compass, Heart, ListChecks, Sparkles } from "lucide-react";

const markers = [
  "Where did this idea come from?",
  "What has been reviewed?",
  "What is still only a draft?",
  "What is ready to publish?",
  "What has a real receipt?",
];

const principles = [
  {
    title: "Make state visible",
    body: "Captured, sourced, drafted, reviewed, packaged, scheduled, published, and receipt-backed should never blur into one anxious blob.",
  },
  {
    title: "Keep the trail close",
    body: "A source, quote, clip, transcript, note, or edit decision should stay connected to the work it shaped.",
  },
  {
    title: "Let AI draft without hiding",
    body: "Quipsly can help write, rewrite, summarize, and experiment. The safeguard is transparency, not scolding.",
  },
  {
    title: "Reduce the drag",
    body: "The system should make the next calm action obvious, especially for creative people whose attention is powerful but expensive to steer.",
  },
];

export default function SystemsAnxietyPage() {
  return (
    <main className="min-h-screen bg-[#f8efe0] text-[#342315] selection:bg-[#d9b66b]/40">
      <nav className="sticky top-0 z-40 border-b border-[#e4cfaa]/70 bg-[#fff8ec]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-11 w-11 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={88} height={88} className="h-full w-full object-cover" />
            </span>
            <span className="font-serif text-2xl font-black">Quipsly</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.14em] text-[#6d4b22]">
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
        <header className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d9b66b]/70 bg-[#fffaf1]/90 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#7b5b2c] shadow-sm">
              <Heart className="h-4 w-4 text-[#315d4f]" />
              Quipsly philosophy
            </div>
            <h1 className="font-serif text-5xl font-black leading-[0.94] tracking-tight md:text-7xl">
              Systems anxiety is what happens when the work has no map.
            </h1>
            <p className="mt-7 font-sans text-xl leading-9 text-[#745b3c]">
              Creative work is already hard. The filing system, publishing checklist, source trail, media folder, social calendar, and draft history should not become a second mountain hiding behind the first one.
            </p>
          </div>
          <div className="overflow-hidden rounded-[3rem] border border-[#dbc295] bg-[#fffaf1] p-4 shadow-xl shadow-[#6c4e29]/10">
            <Image
              src="/images/quipsly-generated/cozy_quipsly_with_lit_lantern.png"
              alt="A Quipsly carrying a lantern through a cozy research path"
              width={900}
              height={900}
              priority
              className="aspect-square w-full rounded-[2.35rem] object-cover"
            />
          </div>
        </header>

        <section className="mt-14 rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/92 p-8 shadow-sm md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <div className="inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]"><Compass className="h-7 w-7" /></div>
              <h2 className="mt-5 font-serif text-4xl font-black leading-tight">The problem is not ambition. The problem is lost state.</h2>
              <p className="mt-5 font-sans text-lg leading-8 text-[#745b3c]">
                Systems anxiety is the pressure of not knowing where things live, what version is real, what has been approved, or what step is safe next.
              </p>
            </div>
            <div className="grid gap-3">
              {markers.map((marker) => (
                <div key={marker} className="flex items-center gap-3 rounded-2xl border border-[#dbc295] bg-white/72 p-4 font-sans font-bold text-[#5d4527]">
                  <ListChecks className="h-5 w-5 text-[#315d4f]" />
                  {marker}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {principles.map((principle) => (
            <article key={principle.title} className="rounded-[2rem] border border-[#dbc295] bg-white/78 p-6 shadow-sm">
              <h3 className="font-serif text-3xl font-black">{principle.title}</h3>
              <p className="mt-3 font-sans text-base leading-8 text-[#745b3c]">{principle.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-[3rem] border border-[#315d4f]/25 bg-[#2d4f43] p-8 text-[#fff8ec] shadow-xl shadow-[#173129]/15 md:p-10">
          <div className="inline-flex rounded-2xl bg-[#fff8ec]/12 p-3 text-[#f4d58e]"><Sparkles className="h-7 w-7" /></div>
          <h2 className="mt-5 font-serif text-4xl font-black leading-tight md:text-5xl">The Quipsly answer is calm visibility.</h2>
          <p className="mt-5 max-w-3xl font-sans text-lg leading-8 text-[#f5e4c2]">
            A Quipsly can collect, organize, compare, retrieve, cite, draft, prepare, and package. The point is not to make the human smaller. The point is to make the surrounding system clear enough that humans can create, decide, teach, coach, research, and publish with less friction.
          </p>
          <div className="mt-8 flex flex-col gap-3 font-sans sm:flex-row">
            <Link href="https://nest.quipsly.com/projects" className="inline-flex justify-center rounded-2xl bg-[#fff8ec] px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#2d4f43]">
              Open the Nest
            </Link>
            <Link href="/quipslys" className="inline-flex justify-center rounded-2xl border border-[#f5e4c2]/50 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#fff8ec]">
              Meet the Quipslys
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
