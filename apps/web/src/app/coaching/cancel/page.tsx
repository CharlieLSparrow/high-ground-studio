import Link from "next/link";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";

export default async function CoachingCancelPage() {
  const session = await auth();

  redirectToWelcomeIfNeeded(session, "/coaching/cancel");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-10">
        <GlassPanel className="p-6 text-[var(--text-light)]">
          <PageEyebrow>Checkout canceled</PageEyebrow>

          <h1 className="m-0 mt-3 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
            No worries, nothing was charged here
          </h1>

          <p className="mb-0 mt-5 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
            You canceled checkout before completing the purchase. You can head
            back to the coaching page anytime and choose the plan that fits your
            season best.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/coaching"
              className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
            >
              Back to coaching
            </Link>
          </div>
        </GlassPanel>
      </PageContainer>
    </main>
  );
}
