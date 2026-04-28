import { redirect } from "next/navigation";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { buildSignInHref } from "@/lib/content-access";
import {
  redirectAwayFromWelcomeIfComplete,
  sanitizeWelcomeRedirectPath,
} from "@/lib/server/welcome";

import { completeWelcomeAction } from "./actions";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/welcome"));
  }

  const { next } = await searchParams;

  redirectAwayFromWelcomeIfComplete(session, next);

  const nextPath = sanitizeWelcomeRedirectPath(next);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <GlassPanel className="mx-auto max-w-[760px] p-6 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <PageEyebrow>Welcome</PageEyebrow>
            <PageEyebrow>First Sign-In</PageEyebrow>
          </div>

          <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
            One quick preference check, then you are in.
          </h1>

          <p className="mb-0 mt-5 max-w-[640px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
            This first step just tells us what kinds of updates you want from
            High Ground Odyssey. It saves directly to your user record and
            keeps the rest of the app from guessing.
          </p>

          <form action={completeWelcomeAction} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={nextPath} />

            <label className="block rounded-2xl border border-white/10 bg-white/6 p-5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="newsletterOptIn"
                  defaultChecked={session.user.newsletterOptIn}
                  className="mt-1 h-4 w-4"
                />

                <div>
                  <div className="text-[1rem] font-bold text-[var(--text-light)]">
                    Newsletter
                  </div>
                  <div className="mt-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.84)]">
                    Occasional thoughtful updates, new writing, and project
                    momentum worth sending.
                  </div>
                </div>
              </div>
            </label>

            <label className="block rounded-2xl border border-white/10 bg-white/6 p-5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="announcementsOptIn"
                  defaultChecked={session.user.announcementsOptIn}
                  className="mt-1 h-4 w-4"
                />

                <div>
                  <div className="text-[1rem] font-bold text-[var(--text-light)]">
                    Announcements
                  </div>
                  <div className="mt-2 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.84)]">
                    Important launches, major updates, and practical things you
                    would reasonably expect us to tell you.
                  </div>
                </div>
              </div>
            </label>

            <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 p-5 text-[0.95rem] leading-7 text-[rgba(245,239,230,0.82)]">
              You can change these later. The goal here is just to finish your
              first sign-in cleanly and get you where you meant to go.
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/50 hover:bg-flare/24"
            >
              Save and continue
            </button>
          </form>
        </GlassPanel>
      </PageContainer>
    </main>
  );
}
