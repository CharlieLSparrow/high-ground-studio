import { notFound } from "next/navigation";
import { getLearnSource } from "@/lib/source";
import { auth } from "@/auth";
import Link from "next/link";

export default async function LearnPage({ params }: any) {
  const { niche, slug = [] } = await params;
  const source = await getLearnSource(niche);
  const page = source.getPage(slug);

  if (!page) {
    notFound();
  }

  const isPremium = (page as any).data.premium === true;
  
  if (isPremium) {
    const session = await auth();
    const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
    const hasNetworkPass = roles.includes("NETWORK_PASS");

    if (!hasNetworkPass) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[linear-gradient(to_bottom,var(--bg-dark,#08171b),var(--bg-darker,#0a1012))] text-[var(--text-light,#f5efe6)] font-sans">
          <div className="max-w-2xl w-full rounded-3xl border border-white/10 bg-white/5 p-8 md:p-12 shadow-[0_0_40px_rgba(255,122,24,0.1)] backdrop-blur-md text-center relative overflow-hidden">
            
            {/* Decorative background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-[var(--accent,#ff7a18)]/20 blur-[80px] pointer-events-none" />

            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent,#ff7a18)] to-amber-600 shadow-lg ring-4 ring-white/10">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            
            <h1 className="mb-4 text-3xl md:text-5xl font-extrabold tracking-tight text-white">
              Well, look who found the secret library.
            </h1>
            
            <p className="mb-8 text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
              Some of our favorite tools, stories, and hard-won wisdom are tucked away here for <strong>Network Pass</strong> members. It’s less of a paywall and more of a quiet, cozy room where the good stuff lives. We’d be absolutely honored to have you pull up a chair and join us for the rest of the journey.
            </p>

            <Link
              href="/auth/patreon"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent,#ff7a18)] px-8 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(255,122,24,0.4)] transition-all hover:scale-105 hover:bg-orange-500 hover:shadow-[0_0_30px_rgba(255,122,24,0.6)]"
            >
              <span>Unlock with Patreon</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>

            <div className="mt-8 pt-8 border-t border-white/10">
              <p className="text-sm text-white/50">
                Already part of the expedition? Just make sure you're logged in with the same email you use on Patreon, and we'll open the door automatically.
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  const PageContent = (page as any).data.body;

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-3xl mx-auto prose prose-invert">
      <h1 className="text-4xl font-bold mb-8 capitalize">{niche} Learning Hub</h1>
      <PageContent />
    </div>
  );
}
