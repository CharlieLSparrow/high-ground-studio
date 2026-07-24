import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Database,
  ExternalLink,
  Film,
  GraduationCap,
  ImageIcon,
  Mic,
  Quote,
  Share2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { QUIPSLY_ART_ROLE_RECIPES } from "@high-ground/quipsly-domain/art-recipes";
import {
  getOutputCatalogStageLabel,
  getOutputFamilyLabel,
  getOutputRoadmapHorizonLabel,
  QUIPSLY_OUTPUT_CATALOG,
  type QuipslyOutputDefinition,
  type QuipslyOutputCatalogStage,
} from "@high-ground/quipsly-domain/output-catalog";

const catalogStageStyles: Record<QuipslyOutputCatalogStage, string> = {
  "runway-mapped": "border-violet-200 bg-violet-50 text-violet-900",
  "contract-defined": "border-sky-200 bg-sky-50 text-sky-900",
  "workflow-draft": "border-amber-200 bg-amber-50 text-amber-950",
  "concept-only": "border-slate-200 bg-slate-50 text-slate-700",
};

const HGO_PUBLISH_QUEUE_URL = "https://app.highgroundodyssey.com/team/hgo-publish-queue";

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
  const activeDesignOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.roadmapHorizon === "active-design");
  const nearTermOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.roadmapHorizon === "near-term");
  const exploreLaterOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.roadmapHorizon === "explore-later");

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <Sparkles size={14} />
                Capability roadmap · definition only
              </div>
              <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
                One source. Many native outputs.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b5b45] md:text-lg">
                This catalog defines how a Nest could project into episode pages, podcast packages, video packages, social cuts, quote cards, courses, books, story scrolls, galleries, and supporter posts.
              </p>
              <div className="mt-5 flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  No card on this page is a produced artifact, persisted packet, publication receipt, provider connection, or live service-health result.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Catalog definitions by roadmap horizon</div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
                  <div className="text-3xl font-black text-violet-900">{activeDesignOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">Active design</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-3xl font-black text-amber-900">{nearTermOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Near-term</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-3xl font-black text-slate-700">{exploreLaterOutputs.length}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Explore later</div>
                </div>
              </div>
              <p className="mt-4 text-xs font-bold leading-5 text-[#7d6a50]">
                These counts describe roadmap definitions, not implemented outputs or current availability.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Operational evidence lanes">
          <Link
            href="/publishing"
            className="group rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-800">
                  <Database size={14} />
                  Persisted operational evidence
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black">Open the Publishing runway</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-violet-900/80">
                  Inspect accessible-Nest packets, internal publish plans, provider attempts, and external-artifact receipt records. Attempts are not publication proof, and recorded URLs are not live-rechecked.
                </p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href={HGO_PUBLISH_QUEUE_URL}
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d8bd8e]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">
                  <ExternalLink size={14} />
                  External operational lane
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black">Private HGO publish queue</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-[#6b5b45]">
                  Open the private HGO candidate-review lane. This link does not claim that the provider, host, route, or a proposed public page is currently reachable.
                </p>
              </div>
              <ExternalLink className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </Link>
        </section>

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
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${catalogStageStyles[output.catalogStage]}`}>
                        {getOutputCatalogStageLabel(output.catalogStage)}
                      </span>
                      <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                        {getOutputRoadmapHorizonLabel(output.roadmapHorizon)}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#6b5b45]">{output.description}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Proposed source inputs · not checked</div>
                      <ul className="mt-3 space-y-2 text-sm font-bold text-[#5c4932]">
                        {output.sourceInputs.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a96735]" />
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
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Intended UX outcome</div>
                    <p className="mt-3 text-sm font-bold leading-6 text-[#3d3122]">{output.humanPromise}</p>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Intended destinations · not connection proof</div>
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
                      Open capability definition
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
