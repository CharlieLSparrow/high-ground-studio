import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  ImageIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createBetaReadinessResponseBody } from "@/lib/release-health";
import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";
import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { QUIPSLY_OUTPUT_CATALOG } from "@high-ground/quipsly-domain/output-catalog";

function statusClass(status: string) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "degraded") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export default async function BetaReadinessPage() {
  const productionCore = await getProductionCoreReadinessSafe();
  const readiness = createBetaReadinessResponseBody({ productionCore });
  const operatorPlan = readiness.operatorPlan;
  const liveOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.status === "live").length;
  const nowOutputs = QUIPSLY_OUTPUT_CATALOG.filter((output) => output.priority === "now").length;

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <ShieldCheck size={14} />
                Beta readiness
              </div>
              <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
                Is Quipsly beta-shaped yet?
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b5b45] md:text-lg">
                This page turns the release checklist into something readable: access, Nests, editor persistence, recording spine, research assistants, publishing packets, outputs, and generated art.
              </p>
            </div>
            <div className={`rounded-2xl border p-5 ${readiness.ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              <div className="text-xs font-black uppercase tracking-[0.18em]">Current release status</div>
              <div className="mt-3 font-serif text-4xl font-black">
                {readiness.ready ? "Ready" : "Needs config"}
              </div>
              <p className="mt-3 text-sm font-bold leading-6">
                API health is separate from beta readiness. The app can be up while one provider or secret still needs attention.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-5">
          {[
            { label: "Checks", value: readiness.checks.length, icon: CheckCircle2 },
            { label: "Outputs", value: QUIPSLY_OUTPUT_CATALOG.length, icon: Sparkles },
            { label: "Now outputs", value: nowOutputs, icon: Clock },
            { label: "Art assets", value: generatedQuipslyArt.length, icon: ImageIcon },
            { label: "Core DB", value: `${productionCore.presentTableCount}/${productionCore.requiredTableCount}`, icon: Database },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
                <Icon className="h-5 w-5 text-[#a96735]" />
                <div className="mt-3 text-4xl font-black">{item.value}</div>
                <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">{item.label}</div>
              </div>
            );
          })}
        </section>

        <section className={`mt-8 rounded-[2rem] border p-5 shadow-sm md:p-6 ${productionCore.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em]">
                Production core database
              </div>
              <h2 className="mt-2 font-serif text-3xl font-black">
                {productionCore.ok ? "Core tables are ready" : "Schema sync needed before this is fully real"}
              </h2>
              <p className="mt-3 max-w-4xl text-sm font-bold leading-6">
                {productionCore.nextStep}
              </p>
            </div>
            <Link
              href="/api/production-core/readiness"
              className="rounded-full border border-current/20 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition hover:bg-white"
            >
              Open JSON
            </Link>
          </div>
          {!productionCore.ok ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {productionCore.groups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-current/15 bg-white/60 p-4">
                  <div className="font-serif text-lg font-black">{group.label}</div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.12em]">
                    {group.status === "ready" ? "Ready" : `${group.missingTables.length} missing table${group.missingTables.length === 1 ? "" : "s"}`}
                  </div>
                  {group.missingTables.length ? (
                    <p className="mt-2 text-xs leading-5 opacity-80">
                      {group.missingTables.join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mt-8 rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
                Release cockpit
              </div>
              <h2 className="mt-2 font-serif text-3xl font-black">
                {operatorPlan.deployable ? "Deploy path is clear" : "Deploy path has gates"}
              </h2>
              <p className="mt-3 max-w-4xl text-sm font-bold leading-6 text-[#6b5b45]">
                This is the operator-facing path from this build to a safe beta release: refresh Cloud auth if needed, sync schema, deploy a no-traffic preview, smoke it, then promote only after the preview is green.
              </p>
            </div>
            <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${operatorPlan.deployable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {operatorPlan.deployable ? "No app blockers" : `${operatorPlan.blockers.length} gate${operatorPlan.blockers.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {operatorPlan.blockers.length || operatorPlan.warnings.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {operatorPlan.blockers.length ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
                  <div className="text-xs font-black uppercase tracking-[0.16em]">
                    Must resolve before promotion
                  </div>
                  <div className="mt-3 space-y-2">
                    {operatorPlan.blockers.map((blocker) => (
                      <p key={blocker} className="text-sm font-bold leading-6">
                        {blocker}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {operatorPlan.warnings.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <div className="text-xs font-black uppercase tracking-[0.16em]">
                    Allowed with visible fallback
                  </div>
                  <div className="mt-3 space-y-2">
                    {operatorPlan.warnings.map((warning) => (
                      <p key={warning} className="text-sm font-bold leading-6">
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            {operatorPlan.nextActions.map((action, index) => (
              <article key={action.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#a96735]">
                      Step {index + 1}
                    </div>
                    <h3 className="mt-1 font-serif text-xl font-black">
                      {action.label}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b5b45]">
                      {action.detail}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#ead8ba] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#7b512d]">
                    {action.required ? "Required" : "Optional"}
                  </span>
                </div>
                <code className="mt-3 block overflow-x-auto rounded-2xl border border-[#ead8ba] bg-[#23180f] px-4 py-3 text-xs font-bold leading-6 text-[#fff8ec]">
                  {action.command}
                </code>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
            <div className="text-xs font-black uppercase tracking-[0.16em]">
              Non-destructive smoke route set
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {operatorPlan.smokeRoutes.map((route) => (
                <span key={route} className="rounded-full border border-cyan-200 bg-white/70 px-3 py-1 text-xs font-bold">
                  {route}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <Database size={14} />
              Readiness checks
            </div>
            <div className="grid gap-3">
              {readiness.checks.map((check) => (
                <article key={check.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-xl font-black">{check.label}</h2>
                      <p className="mt-2 text-sm leading-6 text-[#6b5b45]">{check.detail}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            {[
              { href: "/projects", label: "Open Nests", detail: "Create or open customer workspaces." },
              { href: "/outputs", label: "Review Outputs", detail: `${liveOutputs} live output shape and ${nowOutputs} now-priority outputs.` },
              { href: "/outputs/hgo-episode-page", label: "Inspect HGO Output", detail: "Representative public episode-page readiness contract." },
              { href: "/art-foundry", label: "Open Art Foundry", detail: "Generate prompt briefs and review approved Quipsly art." },
              { href: "https://quipsly.com/quipslys", label: "Public Quipslys", detail: "Marketing field guide for visual companions." },
              { href: "/api/beta-readiness", label: "Read API JSON", detail: "Machine-readable release readiness payload." },
              { href: "/api/production-core/readiness", label: "Core DB JSON", detail: "Checks the additive production-core tables required for Nests, assets, source units, and publishing." },
              { href: "/api/output-catalog/nest-kind/writing", label: "Nest Output JSON", detail: "Machine-readable writing Nest output paths." },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d8bd8e] hover:bg-[#fff8ec]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-serif text-xl font-black">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 text-[#7d6a50]">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#a96735]" />
                </div>
              </Link>
            ))}
          </aside>
        </section>
      </section>
    </main>
  );
}
