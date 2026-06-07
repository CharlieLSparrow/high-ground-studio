import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Film,
  GraduationCap,
  ImageIcon,
  Mic,
  Quote,
  Share2,
  Sparkles,
} from "lucide-react";
import { QUIPSLY_ART_ROLE_RECIPES } from "@high-ground/quipsly-domain/art-recipes";
import {
  getOutputFamilyLabel,
  getOutputStatusLabel,
  QUIPSLY_OUTPUT_CATALOG,
  type QuipslyOutputDefinition,
  type QuipslyOutputStatus,
} from "@high-ground/quipsly-domain/output-catalog";

const statusStyles: Record<QuipslyOutputStatus, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "beta-ready": "border-sky-200 bg-sky-50 text-sky-800",
  prototype: "border-amber-200 bg-amber-50 text-amber-900",
  planned: "border-slate-200 bg-slate-50 text-slate-700",
};

function iconForOutput(output: QuipslyOutputDefinition) {
  if (output.family === "audio-video") return Film;
  if (output.family === "social") return Share2;
  if (output.family === "learning") return GraduationCap;
  if (output.family === "publishing") return BookOpen;
  if (output.family === "quotes") return Quote;
  if (output.family === "visual-story" || output.family === "client-gallery") return ImageIcon;
  if (output.family === "community") return Sparkles;
  return Mic;
}

function artFoundryHref(output: QuipslyOutputDefinition, role: string) {
  const params = new URLSearchParams({
    role,
    subject: `a ${output.title} helper that understands ${output.sourceInputs.slice(0, 3).join(", ")}`,
    surface: output.title,
    mood: "useful, calm, production-ready",
  });
  return `/art-foundry?${params.toString()}`;
}

export default function OutputsPage() {
  const nowOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.priority === "now");
  const nextOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.priority === "next");
  const laterOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.priority === "later");

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <Sparkles size={14} />
                Output catalog
              </div>
              <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
                One source. Many native outputs.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b5b45] md:text-lg">
                This is Quipsly&apos;s product map for turning a Nest into real things: episode pages, podcast feeds, YouTube packages, social cuts, quote cards, courses, books, story scrolls, galleries, and supporter posts.
              </p>
            </div>
            <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Current focus</div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-3xl font-black text-emerald-800">{nowOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Now</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-3xl font-black text-amber-900">{nextOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Next</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-3xl font-black text-slate-700">{laterOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Later</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-5">
          {QUIPSLY_OUTPUT_CATALOG.map((output) => {
            const Icon = iconForOutput(output);
            return (
              <article key={output.id} className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white shadow-sm">
                <div className="grid gap-5 p-5 lg:grid-cols-[260px_1fr_260px] lg:p-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#a96735]">
                        <Icon size={24} />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a96735]">
                          {getOutputFamilyLabel(output.family)}
                        </div>
                        <h2 className="mt-1 font-serif text-2xl font-black leading-tight">{output.title}</h2>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusStyles[output.status]}`}>
                        {getOutputStatusLabel(output.status)}
                      </span>
                      <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                        {output.priority}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#6b5b45]">{output.description}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Source inputs</div>
                      <ul className="mt-3 space-y-2 text-sm font-bold text-[#5c4932]">
                        {output.sourceInputs.map((item) => (
                          <li key={item} className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Packet shape</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {output.packetShape.map((item) => (
                          <span key={item} className="rounded-full border border-[#eadfca] bg-white px-2.5 py-1 text-xs font-bold text-[#6b5b45]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Human promise</div>
                    <p className="mt-3 text-sm font-bold leading-6 text-[#3d3122]">{output.humanPromise}</p>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Targets</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {output.publishTargets.map((target) => (
                        <span key={target} className="inline-flex items-center gap-1 rounded-full bg-[#3d3122] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white">
                          {target}
                          <ArrowRight size={10} />
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Visual helpers</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {output.visualRoles.map((role) => (
                        <Link key={role} href={artFoundryHref(output, role)} className="rounded-full border border-[#e8dcc4] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#8c6b4a] transition hover:border-[#a96735] hover:bg-[#fff8ec]">
                          {QUIPSLY_ART_ROLE_RECIPES[role].label}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={`/outputs/${output.id}`}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#3d3122] bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#5a442e]"
                    >
                      Open output plan
                      <ArrowRight size={13} />
                    </Link>
                  </aside>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
