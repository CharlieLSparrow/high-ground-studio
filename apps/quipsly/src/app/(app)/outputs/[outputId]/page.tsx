import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileJson,
  PackageCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { QUIPSLY_ART_ROLE_RECIPES } from "@high-ground/quipsly-domain/art-recipes";
import {
  createOutputPacketSkeleton,
  createOutputReadinessPlan,
  getOutputDefinition,
  getOutputFamilyLabel,
  getOutputStatusLabel,
  QUIPSLY_OUTPUT_CATALOG,
  type QuipslyOutputStatus,
} from "@high-ground/quipsly-domain/output-catalog";

const statusStyles: Record<QuipslyOutputStatus, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "beta-ready": "border-sky-200 bg-sky-50 text-sky-800",
  prototype: "border-amber-200 bg-amber-50 text-amber-900",
  planned: "border-slate-200 bg-slate-50 text-slate-700",
};

const inputStatusStyles = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "needs-source": "border-slate-200 bg-slate-50 text-slate-700",
  "needs-review": "border-amber-200 bg-amber-50 text-amber-900",
};

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

  const readinessPlan = createOutputReadinessPlan(output);
  const packetSkeleton = createOutputPacketSkeleton(output);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <Link
          href="/outputs"
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8ec]"
        >
          <ArrowLeft size={14} />
          Output catalog
        </Link>

        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <PackageCheck size={14} />
                {getOutputFamilyLabel(output.family)}
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
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Readiness</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${statusStyles[output.status]}`}>
                  {getOutputStatusLabel(output.status)}
                </span>
                <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                  {output.priority}
                </span>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-[#6b5b45]">
                {readinessPlan.readinessSummary}
              </p>
              <Link
                href={`/api/output-catalog/${output.id}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#5a442e]"
              >
                <FileJson size={14} />
                View JSON contract
                <ExternalLink size={12} />
              </Link>
            </aside>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <ClipboardList size={14} />
              Required source inputs
            </div>
            <div className="grid gap-3">
              {readinessPlan.requiredInputs.map((input) => (
                <article key={input.label} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-serif text-xl font-black">{input.label}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${inputStatusStyles[input.status]}`}>
                      {input.status.replace("-", " ")}
                    </span>
                  </div>
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
              <CheckCircle2 size={14} />
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
              Publish targets
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
              <h2 className="font-serif text-2xl font-black">Operator warning</h2>
              <p className="mt-2 text-sm font-bold leading-6">{readinessPlan.operatorWarning}</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
