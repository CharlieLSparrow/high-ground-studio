import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Brain,
  Feather,
  GraduationCap,
  HeartHandshake,
  Library,
  Mic2,
  Mountain,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  TowerControl,
  Video,
  Waypoints,
} from "lucide-react";

const audienceCards = [
  {
    title: "Storytellers",
    Icon: Feather,
    copy: "Keep the midnight idea, the scene note, the interview, the quote, and the final draft connected without turning your creative life into folder archaeology.",
  },
  {
    title: "Coaches",
    href: "/coaching",
    Icon: HeartHandshake,
    copy: "Turn sessions, frameworks, reflection prompts, client notes, and teaching assets into clear packets you can reuse with care and consent.",
  },
  {
    title: "Trainers",
    Icon: GraduationCap,
    copy: "Build workshops, courses, quizzes, guides, videos, and handouts from one source trail instead of rebuilding the same lesson in five different tools.",
  },
  {
    title: "Researchers",
    Icon: Search,
    copy: "Collect sources, compare evidence, annotate findings, map concepts, and prepare publishable summaries while preserving what came from where.",
  },
];

const pillars = [
  {
    name: "Quipsly Research",
    tagline: "Capture, source, connect",
    image: "/marketing/quipsly_nest_mockup.png",
    Icon: Library,
    copy: "The research layer gathers notes, sources, transcripts, media, citations, observations, and half-formed sparks. It keeps provenance close so an idea can grow without losing its roots.",
    details: ["Source trails", "Tags and annotations", "Research packets", "Living notebooks"],
  },
  {
    name: "Quipsly Studio",
    tagline: "Shape, edit, refine",
    image: "/marketing/quipsly_studio_mockup.png",
    Icon: PanelsTopLeft,
    copy: "The creation layer turns gathered material into manuscripts, episodes, shorts, courses, scroll stories, coaching tools, quote feeds, galleries, and other finished work.",
    details: ["Writing surfaces", "Video and podcast editing", "Shorts recipes", "Reviewable drafts"],
  },
  {
    name: "Quipsly Tower",
    tagline: "Package, publish, learn",
    image: "/marketing/quipsly_tower_mockup.png",
    Icon: TowerControl,
    copy: "The publishing layer prepares platform packets, calendars, receipt slots, analytics views, Patreon workflows, episode pages, and social queues without pretending something shipped before it did.",
    details: ["Platform packets", "Publishing runway", "Receipt truth", "Analytics planning"],
  },
];

const philosophy = [
  {
    title: "Sources before certainty",
    body: "Quipsly is built to show the trail. A good answer should point back to the note, quote, clip, transcript, image, or decision that shaped it.",
  },
  {
    title: "Drafting is allowed",
    body: "A Quipsly can draft, rewrite, summarize, and experiment when invited. The difference is that drafts stay inspectable, labeled, and easy for a human to reshape.",
  },
  {
    title: "Humans keep authorship",
    body: "The system helps you see structure, choices, risk, and next steps. It does not hide the work behind a cheerful black box and call that creative progress.",
  },
  {
    title: "Calm beats clever",
    body: "The product should reduce systems anxiety by making state visible: captured, sourced, drafted, reviewed, packaged, scheduled, published, and receipt-backed.",
  },
];

const workflows = [
  {
    title: "Podcast to publishing runway",
    Icon: Mic2,
    copy: "Record or import an episode, sync the sources, create the long edit, pull shorts, write show notes, prepare platform packets, then track real publication receipts.",
  },
  {
    title: "Coaching session to reusable packet",
    Icon: HeartHandshake,
    copy: "Schedule a session, confirm consent, capture clean audio, repair the transcript, then turn the conversation into notes, action items, client-safe packets, and future teaching material.",
  },
  {
    title: "Book to course to social clips",
    Icon: BookOpen,
    copy: "Write chapters as living documents, tag teachable ideas, turn them into lessons, generate practice prompts, and publish small helpful artifacts from the same source base.",
  },
  {
    title: "Research to useful knowledge",
    Icon: Brain,
    copy: "Gather documents, web notes, photos, interviews, and observations, then build annotated packets that can become articles, presentations, training, or decision support.",
  },
  {
    title: "Media library to many outputs",
    Icon: Video,
    copy: "Keep original media whole, work with proxies and metadata, and make reusable clips, GIFs, galleries, stories, courses, and social posts without copying chaos between tools.",
  },
];

const quipslyKinds = [
  {
    title: "Librarian Quipslys",
    image: "/images/quipsly-generated/scholarly_quipsly_verifying_sources.webp",
    copy: "They fetch references, compare notes, verify attributions, and keep your source trail from wandering into the brambles.",
  },
  {
    title: "Producer Quipslys",
    image: "/images/quipsly-generated/adorable_quipsly_podcast_planning.webp",
    copy: "They help organize episodes, media assets, shorts, show notes, review boards, and publishing packets.",
  },
  {
    title: "Coach Quipslys",
    image: "/images/quipsly-generated/cute_quipsly_scientist_professor.webp",
    copy: "They turn frameworks, questions, exercises, and client-safe notes into usable learning moments.",
  },
  {
    title: "Writer Quipslys",
    image: "/images/quipsly-generated/curious_quipsly_writing_wisdom_notes.webp",
    copy: "They suggest outlines, drafts, cuts, connections, alternate phrasings, and research packets while leaving the steering wheel in human hands.",
  },
];

export default function QuipslyLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8efe0] text-[#342315] selection:bg-[#d9b66b]/40">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(95,133,91,0.22),_transparent_34%),radial-gradient(circle_at_80%_5%,_rgba(213,166,79,0.18),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.58),_rgba(255,255,255,0))]" />

      <nav className="sticky top-0 z-40 border-b border-[#e4cfaa]/70 bg-[#fff8ec]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={96} height={96} className="h-full w-full object-cover" priority />
            </span>
            <span>
              <span className="block font-serif text-2xl font-black leading-none">Quipsly</span>
              <span className="block font-sans text-[10px] font-black uppercase tracking-[0.22em] text-[#8a6a39]">Research Studio Tower</span>
            </span>
          </Link>
          <div className="hidden items-center gap-6 font-sans text-sm font-bold text-[#6d5637] lg:flex">
            <a href="#research-studio-tower" className="hover:text-[#1f493e]">System</a>
            <a href="#who" className="hover:text-[#1f493e]">Who it helps</a>
            <a href="#quipslys" className="hover:text-[#1f493e]">The Quipslys</a>
            <a href="#philosophy" className="hover:text-[#1f493e]">Philosophy</a>
          </div>
          <div className="flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.12em]">
            <Link href="https://nest.quipsly.com/projects" className="hidden rounded-full border border-[#caa96f] bg-white/80 px-4 py-2 text-[#5d4527] shadow-sm sm:inline-flex">
              Open Nest
            </Link>
            <Link href="https://patreon.com/HighGroundOdyssey" className="rounded-full bg-[#315d4f] px-4 py-2 text-[#fff8ec] shadow-sm">
              Support Beta
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 md:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:pb-24 lg:pt-20">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#d9b66b]/70 bg-[#fffaf1]/90 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#7b5b2c] shadow-sm">
            <Sprout className="h-4 w-4 text-[#315d4f]" />
            For storytellers, coaches, trainers, and researchers
          </div>
          <h1 className="max-w-5xl font-serif text-5xl font-black leading-[0.94] tracking-tight text-[#2f2418] md:text-7xl lg:text-8xl">
            Turn scattered knowledge into work people can use.
          </h1>
          <p className="mt-7 max-w-3xl font-sans text-xl leading-9 text-[#745b3c]">
            Quipsly is a production operating system for people whose ideas arrive as notes, sources, calls, clips, books, classes, quotes, photos, and wild little midnight sparks. Capture the raw material, shape it into media and writing, then publish with receipts you can trust.
          </p>
          <div className="mt-9 flex flex-col gap-3 font-sans sm:flex-row">
            <Link href="https://nest.quipsly.com/projects" className="inline-flex items-center justify-center rounded-2xl bg-[#3b2418] px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#fff8ec] shadow-lg shadow-[#3b2418]/15">
              Start in the Nest
            </Link>
            <Link href="/quipslys" className="inline-flex items-center justify-center rounded-2xl border border-[#b99052] bg-white/80 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#6d4b22] shadow-sm">
              Meet the Quipslys
            </Link>
          </div>
          <div className="mt-8 grid gap-3 font-sans text-sm text-[#745b3c] sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dbc295] bg-white/65 p-4"><strong className="text-[#315d4f]">Research</strong><br />Find the thread.</div>
            <div className="rounded-2xl border border-[#dbc295] bg-white/65 p-4"><strong className="text-[#315d4f]">Studio</strong><br />Shape the work.</div>
            <div className="rounded-2xl border border-[#dbc295] bg-white/65 p-4"><strong className="text-[#315d4f]">Tower</strong><br />Publish with clarity.</div>
          </div>
        </div>
        <div className="relative min-h-[560px]">
          <div className="absolute inset-0 rounded-[3rem] bg-[#315d4f]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[3rem] border border-[#d9b66b]/60 bg-[#fffaf1] p-4 shadow-2xl shadow-[#5d4527]/15">
            <Image
              src="/images/quipsly-generated/quipsly_placing_notes_in_nest.webp"
              alt="A Quipsly placing notes into a cozy research nest"
              width={1200}
              height={1200}
              priority
              className="aspect-[4/5] w-full rounded-[2.35rem] object-cover"
            />
            <div className="absolute bottom-8 left-8 right-8 rounded-[2rem] border border-white/50 bg-[#1d382f]/88 p-6 text-[#fff8ec] shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#f4d58e]">
                <Sparkles className="h-4 w-4" />
                Core promise
              </div>
              <p className="font-serif text-2xl font-black leading-tight">
                No more losing the good idea because the system around it was too heavy to open.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="who" className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Who Quipsly serves</p>
          <h2 className="mt-3 font-serif text-4xl font-black leading-tight md:text-6xl">Four doors into the same living system.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {audienceCards.map((card) => {
            const href = "href" in card ? card.href : null;
            const cardContent = (
              <>
                <div className="mb-5 inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]">
                  <card.Icon className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-3xl font-black">{card.title}</h3>
                <p className="mt-4 font-sans text-sm leading-7 text-[#745b3c]">{card.copy}</p>
                {"href" in card ? (
                  <span className="mt-5 inline-flex font-sans text-xs font-black uppercase tracking-[0.14em] text-[#315d4f]">
                    Explore coaching capture
                  </span>
                ) : null}
              </>
            );

            return href ? (
              <Link
                key={card.title}
                href={href}
                className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/88 p-6 text-inherit no-underline shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#6c4e29]/10"
              >
                {cardContent}
              </Link>
            ) : (
              <article key={card.title} className="rounded-[2rem] border border-[#dbc295] bg-[#fffaf1]/88 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#6c4e29]/10">
                {cardContent}
              </article>
            );
          })}
        </div>
      </section>

      <section id="research-studio-tower" className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="overflow-hidden rounded-[3rem] border border-[#d6bd91] bg-[#2d4f43] p-5 text-[#fff8ec] shadow-2xl shadow-[#173129]/20 md:p-8">
          <div className="grid gap-5 lg:grid-cols-3">
            {pillars.map((pillar) => (
              <article key={pillar.name} className="flex flex-col overflow-hidden rounded-[2.25rem] border border-white/15 bg-[#f8efe0] text-[#342315] shadow-xl">
                <div className="relative h-52 border-b border-[#dbc295] bg-[#f0dfc0]">
                  <Image src={pillar.image} alt={`${pillar.name} interface preview`} fill className="object-cover object-top" />
                  <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-[#173129]/90 px-3 py-1.5 font-sans text-[10px] font-black uppercase tracking-[0.14em] text-[#fff8ec]">
                    <pillar.Icon className="h-3.5 w-3.5" />
                    {pillar.tagline}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-serif text-3xl font-black">{pillar.name}</h3>
                  <p className="mt-4 flex-1 font-sans text-sm leading-7 text-[#745b3c]">{pillar.copy}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {pillar.details.map((detail) => (
                      <span key={detail} className="rounded-full border border-[#dbc295] bg-white/75 px-3 py-1 font-sans text-[10px] font-black uppercase tracking-[0.12em] text-[#6d4b22]">
                        {detail}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/90 p-8 shadow-sm">
            <div className="inline-flex rounded-2xl bg-[#f1dfbd] p-3 text-[#315d4f]"><Waypoints className="h-7 w-7" /></div>
            <h2 className="mt-5 font-serif text-4xl font-black leading-tight md:text-5xl">The workflow is a trail, not a trap.</h2>
            <p className="mt-5 font-sans text-lg leading-8 text-[#745b3c]">
              Quipsly is not trying to replace every tool you love. It is trying to make the invisible trail between capture, creation, review, publication, and learning visible enough that you can move without panic.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {workflows.map((workflow) => (
              <article key={workflow.title} className="rounded-[2rem] border border-[#dbc295] bg-white/75 p-6 shadow-sm">
                <div className="mb-4 inline-flex rounded-2xl bg-[#315d4f]/10 p-3 text-[#315d4f]"><workflow.Icon className="h-5 w-5" /></div>
                <h3 className="font-serif text-2xl font-black">{workflow.title}</h3>
                <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">{workflow.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="quipslys" className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#8a6a39]">Who the Quipslys are</p>
            <h2 className="mt-3 max-w-3xl font-serif text-4xl font-black leading-tight md:text-6xl">Enthusiastic helpers for the margins of serious work.</h2>
          </div>
          <Link href="/quipslys" className="inline-flex w-fit rounded-full border border-[#b99052] bg-white/80 px-5 py-3 font-sans text-xs font-black uppercase tracking-[0.14em] text-[#6d4b22] shadow-sm">
            Field guide
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quipslyKinds.map((kind) => (
            <article key={kind.title} className="overflow-hidden rounded-[2rem] border border-[#dbc295] bg-[#fffaf1] shadow-sm">
              <Image src={kind.image} alt={kind.title} width={720} height={720} className="aspect-square w-full object-cover" />
              <div className="p-5">
                <h3 className="font-serif text-2xl font-black">{kind.title}</h3>
                <p className="mt-3 font-sans text-sm leading-6 text-[#745b3c]">{kind.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="philosophy" className="relative z-10 mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="rounded-[3rem] border border-[#dbc295] bg-[#fffaf1]/92 p-8 shadow-xl shadow-[#6c4e29]/10 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <div className="inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]"><ShieldCheck className="h-7 w-7" /></div>
              <h2 className="mt-5 font-serif text-4xl font-black leading-tight md:text-6xl">A philosophy of visible work.</h2>
              <p className="mt-5 font-sans text-lg leading-8 text-[#745b3c]">
                AI can be a collaborator, draft partner, librarian, producer, and analyst. Quipsly’s job is to make that power less slippery by keeping context, evidence, decisions, and approvals where people can see them.
              </p>
              <Link href="/philosophy/systems-anxiety" className="mt-7 inline-flex rounded-full bg-[#3b2418] px-5 py-3 font-sans text-xs font-black uppercase tracking-[0.14em] text-[#fff8ec] shadow-sm">
                Read the systems anxiety thesis
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {philosophy.map((item) => (
                <article key={item.title} className="rounded-[2rem] border border-[#dbc295] bg-white/72 p-6">
                  <h3 className="font-serif text-2xl font-black">{item.title}</h3>
                  <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#dbc295] bg-[#fff8ec] px-5 py-10 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 overflow-hidden rounded-2xl border border-[#e4cfaa] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={88} height={88} className="h-full w-full object-cover" />
            </span>
            <div>
              <div className="font-serif text-xl font-black">Quipsly</div>
              <div className="font-sans text-xs font-bold text-[#745b3c]">Research, Studio, Tower</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 font-sans text-xs font-black uppercase tracking-[0.12em]">
            <Link href="https://nest.quipsly.com/projects" className="rounded-full border border-[#b99052] px-4 py-2 text-[#6d4b22]">Open Nest</Link>
            <Link href="https://patreon.com/HighGroundOdyssey" className="rounded-full border border-[#b99052] px-4 py-2 text-[#6d4b22]">Support Beta</Link>
            <Link href="https://highgroundodyssey.com" className="rounded-full border border-[#b99052] px-4 py-2 text-[#6d4b22]">High Ground Odyssey</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
