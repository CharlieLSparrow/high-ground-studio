import { auth } from "@/auth";
import { loadPrivateFictionIssueBundle } from "@/lib/fiction/private-fiction-seeds";
import {
  canAccessPrivateFictionNest,
  canManagePrivateFictionNest,
  PRIVATE_FICTION_PROJECT_SLUG,
} from "@/lib/fiction/private-fiction-access";
import { listStudioProjectAccessGrants } from "@/lib/server/studio-project-access";
import { grantPrivateFictionNestAccessAction, importPrivateFictionSeedAction } from "./actions";
import { Lock, FileText, Database, Sparkles, BookOpen, Clock, PanelsTopLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Private Fiction Packet",
  robots: "noindex, nofollow",
};

type PrivateFictionPacketProps = {
  params: Promise<{ seriesSlug: string; issueSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PrivateFictionPacket({
  params,
  searchParams,
}: PrivateFictionPacketProps) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!(await canAccessPrivateFictionNest(actorEmail))) {
    notFound();
  }

  const { seriesSlug, issueSlug } = await params;
  const query = searchParams ? await searchParams : {};
  const importSucceeded = firstQueryValue(query.imported) === "1";
  const accessGranted = firstQueryValue(query.accessGranted);
  const canManageAccess = await canManagePrivateFictionNest(actorEmail);
  const accessGrants = canManageAccess ? await listStudioProjectAccessGrants(PRIVATE_FICTION_PROJECT_SLUG) : [];

  let issueData: any = null;
  let storyBibleData: any = null;

  try {
    const bundle = await loadPrivateFictionIssueBundle(seriesSlug, issueSlug);
    issueData = bundle.issueData;
    storyBibleData = bundle.storyBibleData;
  } catch (error) {
    console.error("Failed to read private seed files", error);
    return notFound();
  }

  const { series, issue, creativeRules, acts } = issueData;
  const { entities, relationships } = storyBibleData;

  const characters = entities.filter((e: any) => e.type === "CHARACTER");
  const settings = entities.filter((e: any) => e.type === "SETTING");
  const themes = entities.filter((e: any) => e.type === "THEME_MOTIF");

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-12 pb-32">
      {/* PRIVATE LABELING BANNER */}
      <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-2xl flex items-start gap-4">
        <Lock className="h-6 w-6 mt-1 flex-shrink-0" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest mb-1">Private to Charlie L. Sparrow</h2>
          <p className="text-xs opacity-80 leading-relaxed">
            Do not share or expose this route. This fiction development packet is strictly confidential.
            Currently reading directly from local `content/` seed files. Not yet imported into the production database.
          </p>
        </div>
      </div>

      {importSucceeded && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 p-4 rounded-2xl">
          <h2 className="text-sm font-black uppercase tracking-widest mb-1">Quipsly DB projection refreshed</h2>
          <p className="text-xs opacity-80 leading-relaxed">
            Frames created: {firstQueryValue(query.createdFrames) || "0"} • Frames updated: {firstQueryValue(query.updatedFrames) || "0"} • Story entities created: {firstQueryValue(query.createdEntities) || "0"} • Story entities updated: {firstQueryValue(query.updatedEntities) || "0"}
          </p>
        </div>
      )}

      {accessGranted && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 p-4 rounded-2xl">
          <h2 className="text-sm font-black uppercase tracking-widest mb-1">Nest access granted</h2>
          <p className="text-xs opacity-80 leading-relaxed">
            {accessGranted} can access this private fiction Nest after signing in with that email.
          </p>
        </div>
      )}

      {canManageAccess && (
        <section className="bg-studio-panel/70 border border-studio-line/50 rounded-3xl p-6 md:p-8 shadow-xl shadow-black/5">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-studio-tag/10 p-3 text-studio-tag">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-studio-tag">Nest access</p>
                <h2 className="mt-1 text-2xl font-black text-studio-ink">Invite someone to this comic Nest.</h2>
                <p className="mt-2 text-sm leading-6 text-studio-muted">
                  Access grants are stored by email, so you can invite someone before their Quipsly account exists.
                </p>
              </div>

              <form action={grantPrivateFictionNestAccessAction} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  name="targetEmail"
                  type="email"
                  className="rounded-2xl border border-studio-line bg-studio-paper px-4 py-3 text-sm text-studio-ink shadow-sm outline-none focus:border-studio-tag"
                  placeholder="friend@example.com"
                  required
                />
                <select
                  name="role"
                  defaultValue="VIEWER"
                  className="rounded-2xl border border-studio-line bg-studio-paper px-4 py-3 text-sm font-bold text-studio-ink shadow-sm outline-none focus:border-studio-tag"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="OWNER">Owner</option>
                </select>
                <button className="rounded-2xl bg-studio-ink px-5 py-3 text-sm font-black uppercase tracking-widest text-studio-paper shadow-lg hover:-translate-y-0.5 transition-transform">
                  Grant access
                </button>
              </form>

              {accessGrants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-studio-dim">Current grants</p>
                  <div className="grid gap-2">
                    {accessGrants.map((grant) => (
                      <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-studio-line/50 bg-studio-paper/70 px-4 py-3 text-xs">
                        <span className="font-bold text-studio-ink">{grant.email}</span>
                        <span className="rounded-full bg-studio-tag/10 px-3 py-1 font-black uppercase tracking-widest text-studio-tag">
                          {grant.role} · {grant.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SERIES OVERVIEW */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-studio-tag/70">Series Overview • {series.universe}</p>
          <h1 className="text-4xl font-serif font-black text-studio-ink leading-tight">{series.title}</h1>
        </div>

        <div className="bg-studio-panel/40 border border-studio-line/40 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl shadow-black/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-black text-studio-ink">{issue.title}</h2>
              <p className="text-studio-muted text-sm mt-1 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Issue {issue.number} • {issue.format}
              </p>
            </div>
            <div className="bg-studio-source/10 text-studio-source border border-studio-source/20 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0">
              {issue.status}
            </div>
          </div>

          <div className="space-y-4 border-t border-studio-line/40 pt-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-studio-dim mb-2">SubTrope</h3>
              <p className="text-studio-ink text-sm leading-relaxed bg-studio-ink/5 p-3 rounded-xl border border-studio-ink/5">{issue.subTrope}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CREATIVE RULES */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-studio-dim flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4" />
          Creative Rules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-studio-tag/5 border border-studio-tag/20 rounded-2xl p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-tag mb-2">POV Rule</h4>
            <p className="text-xs text-studio-muted leading-relaxed">{creativeRules.povRule}</p>
          </div>
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-2">Romance Rule</h4>
            <p className="text-xs text-studio-muted leading-relaxed">{creativeRules.romanceRule}</p>
          </div>
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5 md:col-span-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Visual Style</h4>
            <p className="text-xs text-studio-muted leading-relaxed">{creativeRules.visualStyle}</p>
          </div>
        </div>
      </section>

      {/* ACTS OVERVIEW */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-studio-dim flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4" />
          Narrative Acts ({acts.length})
        </h3>
        <div className="flex flex-col gap-3">
          {acts.map((act: any) => (
            <div key={act.id} className="flex items-center gap-4 bg-studio-panel/20 border border-studio-line/20 rounded-2xl p-4">
              <div className="bg-studio-ink/10 text-studio-ink w-10 h-10 rounded-xl flex items-center justify-center font-black font-serif shrink-0">
                {act.roman}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-studio-ink">{act.title}</h4>
                <p className="text-xs text-studio-muted mt-0.5">Panels {act.startPanel} - {act.endPanel} ({act.panelCount} panels)</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STORY BIBLE ENTITIES */}
      <section className="space-y-6 pt-6 border-t border-studio-line/40">
        <h3 className="text-sm font-black uppercase tracking-widest text-studio-dim flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Story Bible Entities
        </h3>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-studio-tag uppercase tracking-wider">Characters ({characters.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((c: any) => (
              <div key={c.name} className="bg-studio-panel border border-studio-line/40 rounded-2xl p-5 shadow-sm">
                <h5 className="font-bold text-studio-ink">{c.name}</h5>
                <p className="text-xs text-studio-muted mt-1">{c.attributes.role}</p>
                {c.attributes.traits && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.attributes.traits.map((t: string) => (
                      <span key={t} className="bg-studio-tag/10 text-studio-tag border border-studio-tag/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-studio-node uppercase tracking-wider">Settings & Themes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...settings, ...themes].map((e: any) => (
              <div key={e.name} className="bg-studio-panel border border-studio-line/40 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <h5 className="font-bold text-studio-ink">{e.name}</h5>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-studio-node/70">{e.type.replace("_", " ")}</span>
                </div>
                <p className="text-xs text-studio-muted mt-2 leading-relaxed">{e.attributes.summary || e.attributes.role || e.attributes.mood || e.attributes.rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IMPORTER CTA (DISABLED) */}
      <section className="pt-12">
        <div className="bg-studio-ink/5 border border-studio-ink/10 rounded-3xl p-8 text-center flex flex-col items-center">
          <Database className="h-10 w-10 text-studio-dim mb-4" />
          <h3 className="text-lg font-black text-studio-ink mb-2">Project into Quipsly</h3>
          <p className="text-sm text-studio-muted max-w-md mx-auto mb-6 leading-relaxed">
            Keep the private seed files as canon, then idempotently refresh the live Quipsly story-bible and storyboard projections. Safe to run repeatedly; generated or uploaded panel images are preserved.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <form action={importPrivateFictionSeedAction}>
              <input type="hidden" name="seriesSlug" value={seriesSlug} />
              <input type="hidden" name="issueSlug" value={issueSlug} />
              <button className="bg-studio-ink text-studio-paper px-6 py-3 rounded-full text-sm font-black uppercase tracking-widest shadow-lg hover:-translate-y-0.5 transition-transform">
                Import / refresh DB projection
              </button>
            </form>

            <Link
              href={`/fiction-tools/private/${seriesSlug}/${issueSlug}/scroll`}
              className="inline-flex items-center gap-2 border border-studio-line bg-studio-paper px-6 py-3 rounded-full text-sm font-black uppercase tracking-widest text-studio-ink shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              <PanelsTopLeft className="h-4 w-4" />
              Scroll preview
            </Link>

            <Link
              href="/storyboards/builder"
              className="inline-flex items-center gap-2 border border-studio-line bg-studio-paper px-6 py-3 rounded-full text-sm font-black uppercase tracking-widest text-studio-ink shadow-sm hover:-translate-y-0.5 transition-transform"
            >
              Storyboard builder
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
