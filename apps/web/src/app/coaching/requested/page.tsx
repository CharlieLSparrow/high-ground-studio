import Link from "next/link";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { getLayoutVariantFromCookieStore } from "@/lib/layout-variant";
import { getLayoutSurfaceBackground } from "@/lib/layout-variant-styles";

export default async function CoachingRequestedPage() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isTeam = canAccessInternalContent(roles);
  const cookieStore = await cookies();
  const layoutVariant = getLayoutVariantFromCookieStore(cookieStore, isTeam);

  return (
    <main
      className={[
        "min-h-screen pb-20",
        getLayoutSurfaceBackground(layoutVariant, "coaching"),
      ].join(" ")}
    >
      <PageContainer className="pt-10">
        <div className="mx-auto max-w-[860px] space-y-8">
          <GlassPanel className="p-6 text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <PageEyebrow>Coaching Request Received</PageEyebrow>
              <PageEyebrow>Next Steps</PageEyebrow>
            </div>

            <h1 className="m-0 text-[clamp(2.4rem,5vw,4.3rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              Thank you. Your coaching request is in.
            </h1>

            <p className="mb-0 mt-5 text-[1.04rem] leading-8 text-[rgba(245,239,230,0.94)]">
              We will review it personally and follow up using the contact method you selected. During this credentialing season, there is still no fixed fee. If a session is helpful, you may donate afterward in whatever amount feels appropriate and sustainable for you.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/coaching"
                className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Back to coaching
              </Link>

              <Link
                href={session?.user ? "/dashboard" : buildSignInHref("/dashboard")}
                className="rounded-full border border-flare/35 bg-flare/18 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
              >
                {session?.user ? "Open member home" : "Sign in to member home later"}
              </Link>

              <Link
                href="/"
                className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
              >
                Back to home
              </Link>
            </div>
          </GlassPanel>
        </div>
      </PageContainer>
    </main>
  );
}
