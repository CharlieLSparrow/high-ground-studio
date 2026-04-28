import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { canAccessInternalContent } from "@/lib/authz";
import { buildSignInHref } from "@/lib/content-access";
import { redirectToWelcomeIfNeeded } from "@/lib/server/welcome";
import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];

  if (!session?.user) {
    redirect(buildSignInHref("/team/clients"));
  }

  redirectToWelcomeIfNeeded(session, "/team/clients");

  if (!canAccessInternalContent(roles)) {
    notFound();
  }

  const displayName =
    session.user.name?.trim() ||
    session.user.primaryEmail ||
    session.user.email ||
    "Team User";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20">
      <PageContainer className="pt-8">
        <div className="mb-8">
          <BackLink href="/">
            <span aria-hidden="true">←</span>
            <span>Back to High Ground Odyssey</span>
          </BackLink>
        </div>

        <GlassPanel className="mb-8 p-6 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <PageEyebrow>Team</PageEyebrow>
            <PageEyebrow>Internal</PageEyebrow>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
                Team Console
              </h1>

              <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
                This is the internal operations layer for coaching support:
                client setup, appointment management, and later membership
                controls. We are building the sane version first so no one has
                to fight a haunted spreadsheet.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-[rgba(245,239,230,0.9)]">
              Signed in as <strong>{displayName}</strong>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/team/clients"
              className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
            >
              Clients
            </Link>

            <Link
              href="/team/appointments"
              className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
            >
              Appointments
            </Link>
          </div>
        </GlassPanel>

        {children}
      </PageContainer>
    </main>
  );
}
