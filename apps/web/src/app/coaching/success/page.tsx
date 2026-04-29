import Link from "next/link";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

export default async function CoachingSuccessPage() {
  const session = await auth();

  redirectToWelcomeIfNeeded(session, "/coaching/success");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <PageEyebrow>Thank You</PageEyebrow>

          <h1 className="m-0 mt-3 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
            We have your coaching request
          </h1>

          <p className="mb-0 mt-5 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
            Thanks for stepping forward. We will follow up directly to confirm
            fit, cadence, scheduling, and the right next step for your season.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
            >
              Open member home
            </Link>

            <Link
              href="/coaching"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
            >
              Back to coaching
            </Link>
          </div>
        </GlassPanel>
      </PageContainer>
    </main>
  );
}
