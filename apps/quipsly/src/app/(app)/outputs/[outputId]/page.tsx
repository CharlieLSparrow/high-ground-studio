import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Database,
  ExternalLink,
  FileJson,
  PackageCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { QUIPSLY_ART_ROLE_RECIPES } from "@high-ground/quipsly-domain/art-recipes";
import {
  createOutputPacketSkeleton,
  createOutputCapabilityPlan,
  getOutputDefinition,
  getOutputCatalogStageLabel,
  getOutputFamilyLabel,
  getOutputRoadmapHorizonLabel,
  QUIPSLY_OUTPUT_CATALOG,
  type QuipslyOutputCatalogStage,
} from "@high-ground/quipsly-domain/output-catalog";

const catalogStageStyles: Record<QuipslyOutputCatalogStage, string> = {
  "runway-mapped": "border-violet-200 bg-violet-50 text-violet-900",
  "contract-defined": "border-sky-200 bg-sky-50 text-sky-900",
  "workflow-draft": "border-amber-200 bg-amber-50 text-amber-950",
  "concept-only": "border-slate-200 bg-slate-50 text-slate-700",
};

const HGO_PUBLISH_QUEUE_URL = "https://app.highgroundodyssey.com/team/hgo-publish-queue";

function artFoundryHref(outputId: string, role: string, title: string) {
  const params = new URLSearchParams({
    outputId,
    role,
    subject: `a ${title} helper who keeps the output calm, sourced, and reviewable`,
    surface: title,
    mood: "useful, calm, production-ready",
  });
  return `/art-foundry?${params.toString()}`;
}

export function generateStaticParams() {
  return QUIPSLY_OUTPUT_CATALOG.map((output) => ({
    outputId: output.id,
  }));
}

export default async function OutputDetailPage({
  params,
}: {
  params: Promise<{ outputId: string }>;
}) {
  const { outputId } = await params;
  const output = getOutputDefinition(outputId);

  if (!output) notFound();

  const capabilityPlan = createOutputCapabilityPlan(output);
  const packetSkeleton = createOutputPacketSkeleton(output);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <Link
          href="/outputs"
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8ec]"
        >
          <ArrowLeft size={14} />
          Capability roadmap
        </Link>

        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <PackageCheck size={14} />
                Capability definition · {getOutputFamilyLabel(output.family)}
              </div>
              <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
                {output.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b5b45] md:text-lg">
                {output.description}
              </p>
              <p className="mt-5 max-w-3xl rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 text-sm font-bold leading-6 text-[#3d3122]">
                {output.humanPromise}
              </p>
            </div>
            <aside className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-5">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Static catalog definition</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${catalogStageStyles[output.catalogStage]}`}>
                  {getOutputCatalogStageLabel(output.catalogStage)}
                </span>
                <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                  {getOutputRoadmapHorizonLabel(output.roadmapHorizon)}
                </span>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-[#6b5b45]">
                {capabilityPlan.definitionSummary}
              </p>
              <Link
                href={`/api/output-catalog/${output.id}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#5a442e]"
              >
                <FileJson size={14} />
                View definition JSON
                <ExternalLink size={12} />
              </Link>
            </aside>
          </div>
        </header>

        <section className="mt-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm md:p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-serif text-2xl font-black">Definition boundary</h2>
              <p className="mt-2 max-w-4xl text-sm font-bold leading-6">
                This page is not a produced artifact, persisted packet, publication receipt, provider connection, scheduled job, or service-health check. A mapped runway describes where evidence should live; it does not prove that evidence exists or that any public route is reachable.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Operational evidence lanes">
          <Link href="/publishing" className="group rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-800">
                  <Database size={14} /> Persisted operational evidence
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black">Open the Publishing runway</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-violet-900/80">
                  Read accessible-Nest packet, plan, provider-attempt, and external-artifact records. Attempts are not publication proof, and recorded URLs are not live-rechecked.
                </p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
            </div>
          </Link>
          <Link href={HGO_PUBLISH_QUEUE_URL} target="_blank" rel="noreferrer" className="group rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d8bd8e]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">
                  <ExternalLink size={14} /> External operational lane
                </div>
                <h2 className="mt-2 font-serif text-2xl font-black">Private HGO publish queue</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-[#6b5b45]">
                  Candidate review is separate from current host/provider reachability and separate from public publication proof.
                </p>
              </div>
              <ExternalLink className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </Link>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <ClipboardList size={14} />
              Required source-input definition
            </div>
            <div className="grid gap-3">
              {capabilityPlan.requiredInputs.map((input) => (
                <article key={input.label} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-serif text-xl font-black">{input.label}</h2>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
                      Evidence not checked
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#a96735]">
                    {input.catalogRole.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#6b5b45]">{input.note}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <Sparkles size={14} />
              Visual helpers
            </div>
            <div className="space-y-3">
              {output.visualRoles.map((role) => (
                <Link
                  key={role}
                  href={artFoundryHref(output.id, role, output.title)}
                  className="group block rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 transition hover:border-[#a96735] hover:bg-[#fff8ec]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-serif text-xl font-black">{QUIPSLY_ART_ROLE_RECIPES[role].label}</h2>
                    <ArrowRight className="h-4 w-4 text-[#a96735] transition group-hover:translate-x-1" />
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#6b5b45]">
                    Generate a reusable Art Foundry brief for this output.
                  </p>
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <ClipboardList size={14} />
              Packet shape
            </div>
            <div className="flex flex-wrap gap-2">
              {output.packetShape.map((item) => (
                <span key={item} className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1.5 text-sm font-bold text-[#6b5b45]">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <ArrowRight size={14} />
              Intended destinations · not connection proof
            </div>
            <div className="flex flex-wrap gap-2">
              {output.publishTargets.map((target) => (
                <span key={target} className="rounded-full bg-[#3d3122] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white">
                  {target}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[2rem] border border-[#e8dcc4] bg-[#2f2318] p-5 text-[#fdf5eb] shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#f8d9b0]">
            <FileJson size={14} />
            Starter packet skeleton
          </div>
          <pre className="max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-[#fff8ec]">
            {JSON.stringify(packetSkeleton, null, 2)}
          </pre>
        </section>

        <section className="mt-8 rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm md:p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-serif text-2xl font-black">Operator boundary</h2>
              <p className="mt-2 text-sm font-bold leading-6">{capabilityPlan.operatorBoundary}</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
